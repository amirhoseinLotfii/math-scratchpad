import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { validateBank, type BankQuestion } from '../../../src/features/drive-bank/drive-bank';
import { LessonScreen } from '../../../src/features/lessons/lesson-screen';
import type { LessonProgress } from '../../../src/features/lessons/types';
import { sampleBank, mount } from '../../helpers/lesson-screen';
describe('lesson practice', () => {
  it('keeps a completed lesson summary reachable and offers Review lesson', async () => {
    const bank = sampleBank();
    mount(bank, 'SAMPLE-1.1', {
      lessonId: 'SAMPLE-1.1',
      status: 'done',
      currentConceptIndex: 1,
      completedConceptIds: ['SAMPLE-1.1-C1', 'SAMPLE-1.1-C2'],
      answeredCheckIds: ['SAMPLE-1.1-L01', 'SAMPLE-1.1-L02'],
      skippedChecks: [],
      summaryOpen: true,
      revealedSteps: {},
    });
    expect(screen.getByRole('heading', { name: 'Lesson summary' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeVisible();
    const review = screen.getByRole('button', { name: 'Review lesson' });
    await userEvent.click(review);
    expect(screen.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
  });

  it('splits end-of-lesson practice into saved textbook-first batches of at most 100 questions', async () => {
    const base = sampleBank();
    const lessonId = 'SAMPLE-1.1';
    const bank = validateBank({
      ...base,
      questions: [
        ...base.questions,
        ...Array.from({ length: 105 }, (_, index) => ({
          id: `SAMPLE-BATCH-${String(index + 1).padStart(3, '0')}`,
          mode: 'text',
          source: `Extra practice ${index + 1}`,
          answerType: 'text',
          stage: 'practice',
          origin: 'generated',
          lessonId,
        })),
      ],
    });
    const lesson = bank.lessons!.find((item) => item.id === lessonId)!;
    const initialProgress: LessonProgress = {
      lessonId,
      status: 'done',
      currentConceptIndex: 1,
      currentSectionIndex: 1,
      completedConceptIds: [],
      answeredCheckIds: [],
      skippedChecks: [],
      summaryOpen: true,
      revealedSteps: {},
    };
    const onStartPractice = vi.fn();
    const props = { bank, lesson, initialProgress, onBack: vi.fn(), onProgress: vi.fn(), onStartPractice };
    const { unmount } = render(<LessonScreen {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start practice' }));
    const firstBatch = onStartPractice.mock.lastCall![2] as BankQuestion[];
    const firstProgress = onStartPractice.mock.lastCall![1] as LessonProgress;
    expect(firstBatch).toHaveLength(100);
    expect(firstProgress.activePracticeQuestionIds).toEqual(firstBatch.map((question) => question.id));
    expect(firstBatch.slice(0, 3).map((question) => question.id)).toEqual(['SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03']);

    unmount();
    const completedProgress: LessonProgress = {
      ...firstProgress,
      status: 'learning',
      summaryOpen: true,
      activePracticeQuestionIds: undefined,
      completedPracticeQuestionIds: firstBatch.map((question) => question.id),
    };
    render(<LessonScreen {...props} initialProgress={completedProgress} />);
    const continueButton = screen.getByRole('button', { name: /Continue end-of-lesson practice/ });
    await userEvent.click(continueButton);
    const nextBatch = onStartPractice.mock.lastCall![2] as BankQuestion[];
    expect(nextBatch.length).toBeGreaterThan(0);
    expect(nextBatch.length).toBeLessThanOrEqual(100);
    expect(nextBatch.every((question) => !firstBatch.some((first) => first.id === question.id))).toBe(true);
  });
});
