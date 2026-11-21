import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BankChapter } from '../../src/domain/entities/bank-chapter.types';
import { ChapterProgress } from '../../src/domain/entities/chapter-progress.types';
import { ChapterBundleService } from '../../src/storage/chapter-bundle-service';
import { db } from '../../src/storage/scratchpad-db';

describe('Chapter Bundle Service (Import / Export) - §4.1, E2E-02', () => {
  const sampleBank: BankChapter = {
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

  beforeEach(async () => {
    await db.chapters_bank.clear();
    await db.progress_docs.clear();
    await db.history_chunks.clear();
    await db.app_meta.clear();

    await db.chapters_bank.put(sampleBank);
  });

  it('exports chapter bundle with valid JSON structure', async () => {
    const localProgress: ChapterProgress = {
      schemaVersion: '1.0.0',
      kind: 'chapter_progress',
      chapterId: 'PC-1.1',
      bankVersion: 'v21',
      updatedHlc: '1732176000000:0001:dev-local',
      items: {
        'PC-1.1-L01': {
          status: 'in_progress',
          statusHlc: '1732176000000:0001:dev-local',
          attemptCount: 0,
          steps: {
            s1: {
              stepId: 's1',
              orderKey: 'a0',
              branchId: 'main',
              updatedHlc: '1732176000000:0001:dev-local',
              deleted: false,
              segments: [{ type: 'math', content: '2x = 4' }]
            }
          }
        }
      }
    };
    await db.progress_docs.put(localProgress);

    const { filename, jsonString, bundle } = await ChapterBundleService.exportChapterBundle('PC-1.1');

    expect(filename).toContain('PC-1.1-bundle-');
    expect(bundle.kind).toBe('chapter_bundle');
    expect(bundle.bank.chapterId).toBe('PC-1.1');
    expect(bundle.progress.items['PC-1.1-L01'].steps['s1'].segments[0].content).toBe('2x = 4');

    const parsed = JSON.parse(jsonString);
    expect(parsed.schemaVersion).toBe('1.0.0');
  });

  it('preserves newer local steps when importing older bundle (E2E-02)', async () => {
    // Newer local edit at time 2000
    const localProgress: ChapterProgress = {
      schemaVersion: '1.0.0',
      kind: 'chapter_progress',
      chapterId: 'PC-1.1',
      bankVersion: 'v21',
      updatedHlc: '1732176002000:0000:dev-local',
      items: {
        'PC-1.1-L01': {
          status: 'in_progress',
          statusHlc: '1732176002000:0000:dev-local',
          attemptCount: 0,
          steps: {
            s1: {
              stepId: 's1',
              orderKey: 'a0',
              branchId: 'main',
              updatedHlc: '1732176002000:0000:dev-local',
              deleted: false,
              segments: [{ type: 'math', content: 'x = 2 (NEWER LOCAL)' }]
            }
          }
        }
      }
    };
    await db.progress_docs.put(localProgress);

    // Older imported bundle from time 1000
    const olderBundle = {
      schemaVersion: '1.0.0',
      kind: 'chapter_bundle',
      exportedAtIso: '2026-11-21T07:00:00Z',
      bank: sampleBank,
      progress: {
        schemaVersion: '1.0.0',
        kind: 'chapter_progress',
        chapterId: 'PC-1.1',
        bankVersion: 'v21',
        updatedHlc: '1732176001000:0000:dev-other',
        items: {
          'PC-1.1-L01': {
            status: 'in_progress',
            statusHlc: '1732176001000:0000:dev-other',
            attemptCount: 0,
            steps: {
              s1: {
                stepId: 's1',
                orderKey: 'a0',
                branchId: 'main',
                updatedHlc: '1732176001000:0000:dev-other',
                deleted: false,
                segments: [{ type: 'math', content: '2x = 4 (OLDER REMOTE)' }]
              }
            }
          }
        }
      },
      historyChunks: []
    };

    const res = await ChapterBundleService.importChapterBundle(olderBundle);
    expect(res.status).toBe('success');

    // Verify newer local content won
    const current = await db.progress_docs.get('PC-1.1');
    expect(current?.items['PC-1.1-L01'].steps['s1'].segments[0].content).toBe('x = 2 (NEWER LOCAL)');
  });
});
