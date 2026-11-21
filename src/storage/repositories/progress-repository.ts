import {
  ChapterProgress,
  ChapterProgressSchema,
  ItemProgress,
  StepRecord
} from '../../domain/entities/chapter-progress.types';
import { generateHlc } from '../../domain/sync/hlc';
import { MathScratchpadDB } from '../scratchpad-db';

export interface SaveStepMutationOptions {
  deviceId?: string;
  forceThrowMidMutation?: boolean; // For testing atomic rollback (UT-01)
}

export class ProgressRepository {
  constructor(private db: MathScratchpadDB) {}

  async getChapterProgress(chapterId: string): Promise<ChapterProgress | undefined> {
    return this.db.progress_docs.get(chapterId);
  }

  async saveChapterProgress(progress: ChapterProgress): Promise<void> {
    const validated = ChapterProgressSchema.parse(progress);
    await this.db.progress_docs.put(validated);
  }

  /**
   * Atomic mutation for saving a step edit.
   * Updates progress_docs and upserts sync_outbox in one rw transaction.
   */
  async saveStepMutation(
    chapterId: string,
    itemId: string,
    step: StepRecord,
    options: SaveStepMutationOptions = {}
  ): Promise<{ updatedHlc: string; outboxQueued: boolean }> {
    const deviceId = options.deviceId || 'local-device';

    return await this.db.transaction(
      'rw',
      [this.db.progress_docs, this.db.sync_outbox, this.db.history_chunks],
      async () => {
        let progress = await this.db.progress_docs.get(chapterId);

        const newHlc = generateHlc(progress?.updatedHlc, deviceId);

        if (!progress) {
          progress = {
            schemaVersion: '1.0.0',
            kind: 'chapter_progress',
            chapterId,
            bankVersion: 'v1',
            updatedHlc: newHlc,
            items: {}
          };
        } else {
          progress.updatedHlc = newHlc;
        }

        let item = progress.items[itemId];
        if (!item) {
          item = {
            status: 'in_progress',
            statusHlc: newHlc,
            attemptCount: 0,
            steps: {}
          };
          progress.items[itemId] = item;
        }

        // If item was already solved, flag editedAfterSubmit per §3.4 / §7.2
        if (item.status === 'solved') {
          item.editedAfterSubmit = true;
        } else if (item.status === 'not_started') {
          item.status = 'in_progress';
          item.statusHlc = newHlc;
        }

        const stepToSave: StepRecord = {
          ...step,
          updatedHlc: newHlc
        };
        item.steps[step.stepId] = stepToSave;

        // Save progress doc
        await this.db.progress_docs.put(progress);

        // Upsert sync_outbox
        const outboxKey = `progress:${chapterId}`;
        const existingOutbox = await this.db.sync_outbox.where('outboxKey').equals(outboxKey).first();

        const nowIso = new Date().toISOString();
        if (existingOutbox && existingOutbox.id) {
          await this.db.sync_outbox.update(existingOutbox.id, {
            dirtySinceHlc: newHlc,
            status: 'pending',
            updatedAtIso: nowIso
          });
        } else {
          await this.db.sync_outbox.put({
            outboxKey,
            status: 'pending',
            dirtySinceHlc: newHlc,
            priority: 'debounce',
            retryCount: 0,
            createdAtIso: nowIso,
            updatedAtIso: nowIso
          });
        }

        // Test hook for rollback test (UT-01)
        if (options.forceThrowMidMutation) {
          throw new Error('Forced error mid-saveStepMutation for rollback testing');
        }

        return { updatedHlc: newHlc, outboxQueued: true };
      }
    );
  }

  /**
   * Final submit for an item («ثبت نهایی»).
   * Sets status: 'solved', assigns finalSubmitHlc, appends history attempt, and flushes outbox immediately.
   */
  async finalSubmitItem(
    chapterId: string,
    itemId: string,
    finalAnswer: Record<string, unknown>,
    deviceId: string = 'local-device'
  ): Promise<{ status: 'solved'; attemptCount: number; finalSubmitHlc: string }> {
    return await this.db.transaction(
      'rw',
      [this.db.progress_docs, this.db.sync_outbox, this.db.history_chunks],
      async () => {
        let progress = await this.db.progress_docs.get(chapterId);
        const submitHlc = generateHlc(progress?.updatedHlc, deviceId);
        const nowIso = new Date().toISOString();

        if (!progress) {
          progress = {
            schemaVersion: '1.0.0',
            kind: 'chapter_progress',
            chapterId,
            bankVersion: 'v1',
            updatedHlc: submitHlc,
            items: {}
          };
        } else {
          progress.updatedHlc = submitHlc;
        }

        let item = progress.items[itemId];
        if (!item) {
          item = {
            status: 'solved',
            statusHlc: submitHlc,
            attemptCount: 1,
            steps: {}
          };
          progress.items[itemId] = item;
        }

        item.status = 'solved';
        item.statusHlc = submitHlc;
        item.attemptCount = (item.attemptCount || 0) + 1;
        item.finalAnswer = finalAnswer;
        item.finalSubmittedAt = nowIso;
        item.finalSubmitHlc = submitHlc;
        item.editedAfterSubmit = false;

        await this.db.progress_docs.put(progress);

        // Append to history chunks
        const chunkId = `hist-${chapterId}-${deviceId}`;
        let chunk = await this.db.history_chunks.get(chunkId);
        if (!chunk) {
          chunk = {
            schemaVersion: '1.0.0',
            kind: 'history_chunk',
            chunkId,
            chapterId,
            deviceId,
            records: []
          };
        }

        chunk.records.push({
          recordId: `rec-${submitHlc}`,
          recordType: 'final_submit_attempt',
          itemId,
          bankVersion: progress.bankVersion,
          createdHlc: submitHlc,
          createdAtIso: nowIso,
          snapshot: {
            steps: { ...item.steps },
            finalAnswer
          }
        });
        await this.db.history_chunks.put(chunk);

        // Queue outbox with immediate priority
        const outboxKey = `progress:${chapterId}`;
        const existingOutbox = await this.db.sync_outbox.where('outboxKey').equals(outboxKey).first();
        if (existingOutbox && existingOutbox.id) {
          await this.db.sync_outbox.update(existingOutbox.id, {
            dirtySinceHlc: submitHlc,
            status: 'pending',
            priority: 'immediate',
            updatedAtIso: nowIso
          });
        } else {
          await this.db.sync_outbox.put({
            outboxKey,
            status: 'pending',
            dirtySinceHlc: submitHlc,
            priority: 'immediate',
            retryCount: 0,
            createdAtIso: nowIso,
            updatedAtIso: nowIso
          });
        }

        return {
          status: 'solved',
          attemptCount: item.attemptCount,
          finalSubmitHlc: submitHlc
        };
      }
    );
  }
}
