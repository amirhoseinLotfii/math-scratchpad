import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ChapterProgress, ItemProgress, StepRecord } from '../../src/domain/entities/chapter-progress.types';
import { formatHlc } from '../../src/domain/sync/hlc';
import { mergeChapterProgress } from '../../src/domain/sync/lww-merge';

describe('LWW Merge Properties - UT-02', () => {
  const devices = ['dev-a', 'dev-b', 'dev-c'];

  // Arbitrary generator for HLC
  const arbHlc = fc
    .tuple(
      fc.integer({ min: 1700000000000, max: 1800000000000 }),
      fc.integer({ min: 0, max: 999 }),
      fc.constantFrom(...devices)
    )
    .map(([wall, counter, dev]) => formatHlc(wall, counter, dev));

  // Arbitrary generator for StepRecord
  const arbStepRecord = (stepId: string): fc.Arbitrary<StepRecord> =>
    fc.record({
      stepId: fc.constant(stepId),
      orderKey: fc.constantFrom('a0', 'a1', 'a0V'),
      branchId: fc.constantFrom('main', 'plus', 'minus'),
      updatedHlc: arbHlc,
      deleted: fc.boolean(),
      segments: fc.constant([{ type: 'math' as const, content: 'x = 1' }])
    });

  // Arbitrary generator for ItemProgress
  const arbItemProgress = (itemId: string): fc.Arbitrary<ItemProgress> =>
    fc
      .tuple(
        fc.constantFrom('not_started' as const, 'in_progress' as const, 'solved' as const),
        arbHlc,
        fc.integer({ min: 0, max: 10 }),
        fc.dictionary(fc.constantFrom('s1', 's2'), fc.constant(null)).chain(dict => {
          const stepArbs: Record<string, fc.Arbitrary<StepRecord>> = {};
          for (const sId of Object.keys(dict)) {
            stepArbs[sId] = arbStepRecord(sId);
          }
          return fc.record(stepArbs);
        }),
        fc.boolean()
      )
      .map(([status, statusHlc, attemptCount, steps, isSolved]) => ({
        status,
        statusHlc,
        attemptCount,
        steps,
        finalSubmittedAt: isSolved ? '2026-11-21T00:00:00Z' : undefined,
        finalSubmitHlc: isSolved ? statusHlc : undefined,
        editedAfterSubmit: false
      }));

  // Arbitrary generator for ChapterProgress
  const arbChapterProgress: fc.Arbitrary<ChapterProgress> = fc
    .tuple(
      fc.constant('PC-1.1'),
      arbHlc,
      fc.record({
        'PC-1.1-L01': arbItemProgress('PC-1.1-L01'),
        'PC-1.1-L02': arbItemProgress('PC-1.1-L02')
      })
    )
    .map(([chapterId, updatedHlc, items]) => ({
      schemaVersion: '1.0.0',
      kind: 'chapter_progress' as const,
      chapterId,
      bankVersion: 'v21',
      updatedHlc,
      items
    }));

  it('is idempotent: merge(A, A) === A', () => {
    fc.assert(
      fc.property(arbChapterProgress, a => {
        const merged = mergeChapterProgress(a, a);
        expect(merged).toEqual(a);
      }),
      { numRuns: 100 }
    );
  });

  it('is commutative: merge(A, B) === merge(B, A)', () => {
    fc.assert(
      fc.property(arbChapterProgress, arbChapterProgress, (a, b) => {
        const ab = mergeChapterProgress(a, b);
        const ba = mergeChapterProgress(b, a);
        expect(ab).toEqual(ba);
      }),
      { numRuns: 100 }
    );
  });

  it('is associative: merge(merge(A, B), C) === merge(A, merge(B, C))', () => {
    fc.assert(
      fc.property(
        arbChapterProgress,
        arbChapterProgress,
        arbChapterProgress,
        (a, b, c) => {
          const ab_c = mergeChapterProgress(mergeChapterProgress(a, b), c);
          const a_bc = mergeChapterProgress(a, mergeChapterProgress(b, c));
          expect(ab_c).toEqual(a_bc);
        }
      ),
      { numRuns: 100 }
    );
  });
});
