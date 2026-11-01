import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../src/app/store-provider';
import { validateBank } from '../../src/features/drive-bank/drive-bank';
import { emptyLessonProgressState, readLessonProgress, saveLessonProgress } from '../../src/features/lessons/lesson-progress-store';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import { buildActiveLessonChunks } from '../../src/features/lessons/lesson-sections';
import type { LessonProgress } from '../../src/features/lessons/types';
import { blankStep } from '../../src/model';
import { parse } from '../../src/parser';
import { initialState, makeStore } from '../../src/store';

const bank = validateBank(JSON.parse(readFileSync('data/MATH_QUESTION_BANK_v22.json', 'utf8')) as unknown);
const lesson = bank.lessons!.find(entry => entry.id === 'PC-1.1')!;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function phoneLayout() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
}

describe('active lesson read–write–solve integration', () => {
  it('requires submitted typed responses for each chunk and restores additive progress fields', async () => {
    phoneLayout();
    const user = userEvent.setup();
    let latest: LessonProgress | undefined;
    render(<Provider store={makeStore(initialState())}><LessonScreen bank={bank} lesson={lesson} onBack={vi.fn()} onProgress={value => { latest = value; }} onStartPractice={vi.fn()} /></Provider>);

    const flow = screen.getByRole('region', { name: 'درس‌نامهٔ تعاملی' });
    expect(within(flow).getByRole('button', { name: /گام بعدی/ })).toBeDisabled();
    const firstTab = screen.getByRole('tab', { name: /پاسخ‌نویسی/ });
    await user.click(firstTab);
    const textboxes = within(screen.getByRole('complementary', { name: 'پاسخ‌نویسی همین بخش' })).getAllByLabelText('پاسخ تو');
    const chunks = buildActiveLessonChunks(lesson);
    const firstChunk = chunks[0];
    expect(textboxes).toHaveLength(firstChunk.questionIds.length);
    for (const [index, textbox] of textboxes.entries()) {
      await user.type(textbox, `پاسخ آزمایشی ${index + 1}`);
      await user.click(screen.getAllByRole('button', { name: 'ثبت پاسخ' })[0]);
    }
    expect(latest?.chunkAnswers?.[firstChunk.questionIds[0]]?.submittedAt).toBeTruthy();
    expect(latest?.currentSectionIndex).toBe(0);
    await user.click(screen.getByRole('tab', { name: 'درس‌نامه' }));
    const next = within(flow).getByRole('button', { name: /گام بعدی/ });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(flow.querySelector('.lesson-section-label')).toHaveTextContent(/گام ۲ از ۳/);
    expect(latest?.completedLearningChunkIds).toContain(firstChunk.id);
    expect(latest?.currentChunkId).toBe(chunks[1].id);

    const practiceQuestion = bank.questions.find(question => question.lessonId === lesson.id && question.stage === 'practice')!;
    const savedWorkKey = `q:${practiceQuestion.id}`;
    const workStep = blankStep();
    workStep.expression = parse('4+5');
    const legacyFields: LessonProgress = {
      lessonId: lesson.id, status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0,
      completedSectionIds: [lesson.sections![0].id], completedConceptIds: [], answeredCheckIds: [firstChunk.questionIds[0]], skippedChecks: [],
      checkAnswers: { [firstChunk.questionIds[0]]: { type: 'text', value: 'پاسخ قدیمی' } },
      revealedSteps: {},
      workAnswers: { [savedWorkKey]: { type: 'math', steps: [workStep] } },
      currentChunkId: firstChunk.id,
      chunkAnswers: { [firstChunk.questionIds[0]]: { value: 'saved', updatedAt: '2026-11-01T00:00:00.000Z', submittedAt: '2026-11-01T00:00:01.000Z' } },
    };
    const state = emptyLessonProgressState(bank.bank_id, bank.version);
    state.progressById[lesson.id] = legacyFields;
    expect(saveLessonProgress(bank, bank.version, state, localStorage).saved).toBe(true);
    const restored = readLessonProgress(bank, bank.version, localStorage);
    const saved = restored.progressById[lesson.id];
    expect(saved.completedSectionIds).toEqual([lesson.sections![0].id]);
    expect(saved.answeredCheckIds).toEqual([firstChunk.questionIds[0]]);
    expect(saved.workAnswers?.[savedWorkKey]).toBeDefined();
    expect(saved.currentChunkId).toBe(firstChunk.id);
    expect(saved.chunkAnswers?.[firstChunk.questionIds[0]].value).toBe('saved');
  });
});
