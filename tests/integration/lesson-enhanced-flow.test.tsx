import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../src/app/store-provider';
import { validateBank } from '../../src/features/drive-bank/drive-bank';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import { buildActiveLessonChunks } from '../../src/features/lessons/lesson-sections';
import type { BankQuestion } from '../../src/features/drive-bank/drive-bank';
import type { Lesson, LessonProgress } from '../../src/features/lessons/types';
import { initialState, makeStore } from '../../src/store';

const bank = validateBank(JSON.parse(readFileSync('data/MATH_QUESTION_BANK_v23.json', 'utf8')) as unknown);
const lesson = bank.lessons!.find(item => item.id === 'PC-1.1')!;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function phoneLayout() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
}

describe('enhanced active lesson practice', () => {
  it('gates a chunk on three varied answers and requires a reason for multiple choice', async () => {
    phoneLayout();
    const user = userEvent.setup();
    const activeChunk = buildActiveLessonChunks(lesson).find(chunk => chunk.questionIds.some(id => bank.questions.find(question => question.id === id)?.answerType === 'choice'))!;
    const initialProgress: LessonProgress = {
      lessonId: lesson.id, status: 'learning', currentConceptIndex: activeChunk.conceptIndex, currentSectionIndex: 0,
      completedSectionIds: [], completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], revealedSteps: {},
      currentChunkId: activeChunk.id, activeConceptPhase: 'reading',
    };
    let latest: LessonProgress | undefined;
    render(<Provider store={makeStore(initialState())}><LessonScreen bank={bank} lesson={lesson} initialProgress={initialProgress} onBack={vi.fn()} onProgress={value => { latest = value; }} onStartPractice={vi.fn()} /></Provider>);

    const flow = screen.getByRole('region', { name: 'درس‌نامهٔ تعاملی' });
    await user.click(screen.getByRole('tab', { name: /پاسخ‌نویسی/ }));
    const pane = screen.getByRole('complementary', { name: 'پاسخ‌نویسی همین بخش' });
    expect(within(pane).getAllByRole('article')).toHaveLength(3);
    const lessonTab = screen.getByRole('tab', { name: 'درس‌نامه' });
    const workTab = screen.getByRole('tab', { name: /پاسخ‌نویسی/ });
    await user.click(lessonTab);
    const next = within(flow).getByRole('button', { name: /(گام بعدی|رفتن به مثال‌ها)/ });
    expect(next).toBeDisabled();
    await user.click(workTab);

    let submitted = 0;
    for (const articleIndex of [0, 1, 2]) {
      const article = within(screen.getByRole('complementary', { name: 'پاسخ‌نویسی همین بخش' })).getAllByRole('article')[articleIndex]!;
      const question = bank.questions.find(item => item.id === activeChunk.questionIds[articleIndex])!;
      if (question.answerType === 'choice') {
        const radios = within(article).getAllByRole('radio');
        await user.click(radios[0]);
        const submit = within(article).getByRole('button', { name: 'ثبت پاسخ' });
        expect(submit).toBeDisabled();
        await user.type(within(article).getByLabelText('چرا این گزینه را انتخاب کردی؟'), 'چون با جملهٔ متن هم‌خوان است.');
        expect(submit).toBeEnabled();
        await user.click(submit);
        expect(latest?.chunkAnswers?.[question.id]?.explanation).toContain('هم‌خوان');
      } else {
        await user.type(within(article).getByLabelText('پاسخ تو'), `پاسخ و دلیل ${submitted + 1}`);
        await user.click(within(article).getByRole('button', { name: 'ثبت پاسخ' }));
      }
      submitted++;
      expect(within(article).getByText('بدون کلید؛ برای بررسی خروجی را بفرست')).toBeVisible();
      await user.click(lessonTab);
      const nextButton = within(flow).getByRole('button', { name: /(گام بعدی|رفتن به مثال‌ها)/ });
      if (articleIndex < 2) expect(nextButton).toBeDisabled();
      else expect(nextButton).toBeEnabled();
      if (articleIndex < 2) await user.click(workTab);
    }
    expect(within(flow).getByRole('button', { name: /(گام بعدی|رفتن به مثال‌ها)/ })).toBeEnabled();
    expect(latest?.chunkAnswers?.[activeChunk.questionIds[0]]?.submittedAt).toBeTruthy();
  });

  it('launches all three per-concept extras only through the labelled More practice action', async () => {
    phoneLayout();
    const user = userEvent.setup();
    const concept = lesson.concepts.find(item => bank.questions.some(question => question.id === `${item.id}-MORE-01`))!;
    const conceptChunks = buildActiveLessonChunks(lesson).filter(chunk => chunk.concept.id === concept.id);
    const lastChunk = conceptChunks.at(-1)!;
    const exampleAttempts = Object.fromEntries(concept.blocks.flatMap((block, blockIndex) => block.type === 'example' ? [[`ex:${concept.id}:${blockIndex}`, { attemptedAt: '2026-11-01T12:00:00.000Z' }]] : []));
    const initialProgress: LessonProgress = {
      lessonId: lesson.id, status: 'learning', currentConceptIndex: lastChunk.conceptIndex, currentSectionIndex: 0,
      completedSectionIds: [], completedConceptIds: [concept.id], answeredCheckIds: [], skippedChecks: [], revealedSteps: {},
      currentChunkId: lastChunk.id, activeConceptPhase: 'summary', conceptSummaryId: concept.id,
      exampleAttempts,
    };
    const onStartPractice = vi.fn((_lesson: Lesson, _progress: LessonProgress, _questions: BankQuestion[], _sectionId?: string, _conceptId?: string) => {});
    render(<Provider store={makeStore(initialState())}><LessonScreen bank={bank} lesson={lesson} initialProgress={initialProgress} onBack={vi.fn()} onProgress={vi.fn()} onStartPractice={onStartPractice} /></Provider>);
    expect(screen.getAllByText('⭐ غیرکتابی (هم‌سطح کتاب)').length).toBeGreaterThan(0);
    const action = screen.getByRole('button', { name: /تمرین بیشتر/ });
    await user.click(action);
    const launched = onStartPractice.mock.calls[0]?.[2] ?? [];
    expect(launched).toHaveLength(3);
    expect(launched.every(question => question.id.includes('-MORE-'))).toBe(true);
    expect(launched.map(question => question.interactionType)).toEqual(['typed', 'explain', 'find-mistake']);
    expect(launched[0].source).toContain('S&P');
  });
});
