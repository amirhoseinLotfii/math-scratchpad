import { describe, expect, it } from 'vitest';
import { ItemProgress } from '../../src/domain/entities/chapter-progress.types';
import {
  evaluateCompletion,
  getItemDisplayStatus,
  isItemSolved
} from '../../src/domain/sync/completion-evaluator';

describe('Unified Completion Evaluator - §3.4', () => {
  it('identifies solved items only when status is solved AND finalSubmitHlc is present', () => {
    const notStarted: ItemProgress = {
      status: 'not_started',
      statusHlc: '0001000000000:0000:dev-a',
      attemptCount: 0,
      steps: {}
    };
    expect(isItemSolved(notStarted)).toBe(false);

    // Draft / in-progress with steps
    const inProgress: ItemProgress = {
      status: 'in_progress',
      statusHlc: '0001000000000:0000:dev-a',
      attemptCount: 0,
      steps: {
        s1: {
          stepId: 's1',
          orderKey: 'a0',
          branchId: 'main',
          updatedHlc: '0001000000000:0000:dev-a',
          deleted: false,
          segments: [{ type: 'math', content: '2x = 4' }]
        }
      }
    };
    expect(isItemSolved(inProgress)).toBe(false);

    // Solved without finalSubmitHlc (invalid/incomplete)
    const solvedWithoutHlc: ItemProgress = {
      status: 'solved',
      statusHlc: '0001000000000:0000:dev-a',
      attemptCount: 1,
      steps: {}
    };
    expect(isItemSolved(solvedWithoutHlc)).toBe(false);

    // Validly solved
    const validSolved: ItemProgress = {
      status: 'solved',
      statusHlc: '0001000000000:0000:dev-a',
      attemptCount: 1,
      steps: {},
      finalSubmittedAt: '2026-11-21T08:00:00Z',
      finalSubmitHlc: '0001000000000:0000:dev-a'
    };
    expect(isItemSolved(validSolved)).toBe(true);
  });

  it('returns proper Persian display status including edited-after-submit', () => {
    const solvedAndEdited: ItemProgress = {
      status: 'solved',
      statusHlc: '0001000000000:0000:dev-a',
      attemptCount: 1,
      steps: {},
      finalSubmitHlc: '0001000000000:0000:dev-a',
      editedAfterSubmit: true
    };
    const display = getItemDisplayStatus(solvedAndEdited);
    expect(display.status).toBe('solved');
    expect(display.isEditedAfterSubmit).toBe(true);
    expect(display.labelFa).toBe('حل‌شده (ویرایش‌شده)');
  });

  it('aggregates completion percentages accurately', () => {
    const items: Record<string, ItemProgress> = {
      q1: {
        status: 'solved',
        statusHlc: '0001000000000:0000:dev-a',
        attemptCount: 1,
        finalSubmitHlc: '0001000000000:0000:dev-a',
        steps: {}
      },
      q2: {
        status: 'in_progress',
        statusHlc: '0001000000000:0000:dev-a',
        attemptCount: 0,
        steps: {}
      },
      q3: {
        status: 'not_started',
        statusHlc: '0001000000000:0000:dev-a',
        attemptCount: 0,
        steps: {}
      },
      q4: {
        status: 'not_started',
        statusHlc: '0001000000000:0000:dev-a',
        attemptCount: 0,
        steps: {}
      }
    };

    const stats = evaluateCompletion(items);
    expect(stats.total).toBe(4);
    expect(stats.solved).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.notStarted).toBe(2);
    expect(stats.percent).toBe(25);
  });
});
