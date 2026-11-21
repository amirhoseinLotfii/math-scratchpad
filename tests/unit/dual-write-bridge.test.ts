import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/storage/scratchpad-db';
import { dualWriteToDexie } from '../../src/storage/dual-write-bridge';

describe('Dual-Write Bridge - Phase 2', () => {
  beforeEach(async () => {
    await db.progress_docs.clear();
    await db.chapters_bank.clear();
  });

  it('mirrors legacy lesson-progress into progress_docs in Dexie', async () => {
    const payload = {
      bankId: 'PC-1.1',
      bankVersion: 'v21',
      lessons: {
        'lesson-1': {
          lessonId: 'PC-1.1',
          workAnswers: {
            'item-q1': {
              steps: [
                { id: 's1', segments: [{ type: 'math', content: '3x = 9' }] }
              ]
            }
          }
        }
      }
    };

    const success = await dualWriteToDexie(
      'math-scratchpad-lesson-progress-v1:PC-1.1:v21',
      JSON.stringify(payload)
    );
    expect(success).toBe(true);

    const doc = await db.progress_docs.get('PC-1.1');
    expect(doc).toBeDefined();
    expect(doc?.chapterId).toBe('PC-1.1');
    expect(doc?.items['item-q1'].steps['s1'].segments[0].content).toBe('3x = 9');
  });

  it('handles invalid json gracefully without throwing', async () => {
    const success = await dualWriteToDexie('test-key', 'not-valid-json{{{');
    expect(success).toBe(false);
  });
});
