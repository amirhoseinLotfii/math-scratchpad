import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BankChapter } from '../../src/domain/entities/bank-chapter.types';
import { StepRecord } from '../../src/domain/entities/chapter-progress.types';
import {
  BankRepository,
  MathScratchpadDB,
  OutboxRepository,
  ProgressRepository
} from '../../src/storage';

describe('Dexie Storage Layer & Atomic Transactions - UT-01', () => {
  let db: MathScratchpadDB;
  let bankRepo: BankRepository;
  let progressRepo: ProgressRepository;
  let outboxRepo: OutboxRepository;

  beforeEach(async () => {
    // Generate a fresh unique DB name for each test run
    const testDbName = `test-scratchpad-${Date.now()}-${Math.random()}`;
    db = new MathScratchpadDB(testDbName);
    await db.open();

    bankRepo = new BankRepository(db);
    progressRepo = new ProgressRepository(db);
    outboxRepo = new OutboxRepository(db);
  });

  it('saves and reads bank chapter cleanly', async () => {
    const chapter: BankChapter = {
      schemaVersion: '1.0.0',
      kind: 'bank_chapter',
      bankVersion: 'v21',
      chapterId: 'PC-1.1',
      title: { fa: 'فصل اول', en: 'Chapter 1' },
      items: [
        {
          itemId: 'PC-1.1-L01',
          orderIndex: 0,
          itemType: 'math',
          requiredForCompletion: true,
          prompt: {
            segments: [{ type: 'persian_text', content: 'معادله را حل کنید' }]
          }
        }
      ]
    };

    await bankRepo.saveBankChapter(chapter);
    const retrieved = await bankRepo.getBankChapter('PC-1.1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.title.fa).toBe('فصل اول');
    expect(retrieved?.items.length).toBe(1);
  });

  it('rolls back both progress and outbox on aborted mid-saveStepMutation (UT-01)', async () => {
    const chapterId = 'PC-1.1';
    const itemId = 'PC-1.1-L01';
    const step: StepRecord = {
      stepId: 'step-abort-test',
      orderKey: 'a0',
      branchId: 'main',
      updatedHlc: '0001732176000:0000:dev-local',
      deleted: false,
      segments: [{ type: 'math', content: '2x = 6' }]
    };

    // Expect mutation to fail
    await expect(
      progressRepo.saveStepMutation(chapterId, itemId, step, {
        forceThrowMidMutation: true
      })
    ).rejects.toThrow('Forced error mid-saveStepMutation for rollback testing');

    // Verify atomic rollback: neither progress_docs nor sync_outbox contains records
    const progressDoc = await db.progress_docs.get(chapterId);
    expect(progressDoc).toBeUndefined();

    const outboxEntries = await db.sync_outbox.toArray();
    expect(outboxEntries.length).toBe(0);
  });

  it('submits final answer with immediate priority and creates history snapshot', async () => {
    const chapterId = 'PC-1.1';
    const itemId = 'PC-1.1-L01';
    const step: StepRecord = {
      stepId: 'step-final-test',
      orderKey: 'a0',
      branchId: 'main',
      updatedHlc: '0001732176000:0000:dev-local',
      deleted: false,
      segments: [{ type: 'math', content: 'x = 3' }]
    };

    // Save step first
    await progressRepo.saveStepMutation(chapterId, itemId, step);

    // Final submit
    const res = await progressRepo.finalSubmitItem(
      chapterId,
      itemId,
      { math: 'x = 3' },
      'dev-local'
    );

    expect(res.status).toBe('solved');
    expect(res.finalSubmitHlc).toBeDefined();

    // Verify progress doc
    const progress = await progressRepo.getChapterProgress(chapterId);
    expect(progress).toBeDefined();
    expect(progress?.items[itemId].status).toBe('solved');
    expect(progress?.items[itemId].finalSubmitHlc).toBe(res.finalSubmitHlc);

    // Verify outbox queued with immediate priority
    const outbox = await db.sync_outbox.where('outboxKey').equals(`progress:${chapterId}`).first();
    expect(outbox).toBeDefined();
    expect(outbox?.priority).toBe('immediate');
    expect(outbox?.status).toBe('pending');

    // Verify history snapshot appended
    const historyChunks = await db.history_chunks.where('chapterId').equals(chapterId).toArray();
    expect(historyChunks.length).toBe(1);
    expect(historyChunks[0].records.length).toBe(1);
    expect(historyChunks[0].records[0].recordType).toBe('final_submit_attempt');
  });

  it('acks outbox according to HLC freshness rule (§4.3)', async () => {
    const outboxKey = 'progress:PC-1.1';
    await outboxRepo.queueOutbox(outboxKey, '1732176000000:0000:dev-a');

    const pending = await outboxRepo.getPendingOutbox();
    expect(pending.length).toBe(1);
    const entryId = pending[0].id!;

    // Case 1: Uploaded HLC is older than dirty HLC (e.g. newer keystroke arrived)
    const ackOlder = await outboxRepo.ackOutbox(entryId, '1732175000000:0000:dev-a');
    expect(ackOlder).toBe(false);
    expect((await db.sync_outbox.get(entryId))?.status).toBe('pending');

    // Case 2: Uploaded HLC matches or is newer than dirty HLC
    const ackSuccess = await outboxRepo.ackOutbox(entryId, '1732176000000:0000:dev-a');
    expect(ackSuccess).toBe(true);
    expect(await db.sync_outbox.get(entryId)).toBeUndefined();
  });
});
