import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from '../../src/parser';
import { blankStep } from '../../src/model';
import { validateBank, type BankQuestion, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { buildLessonSections } from '../../src/features/lessons/lesson-sections';
import { emptyLessonProgressState, lessonExportDataFromState, readLessonProgress, saveLessonProgress } from '../../src/features/lessons/lesson-progress-store';
import { allowedWorkKeys, buildSectionWorkItems, clampSplitRatio, exampleWorkKey, lessonPaneMode, normalizeWorkAnswers, questionWorkKey, ratioFromPointer, resolveSelectedWorkItem, SPLIT_DEFAULT } from '../../src/features/lessons/lesson-work-items';
import type { Lesson, LessonProgress } from '../../src/features/lessons/types';

const q = (id: string, stage: 'learn' | 'practice'): BankQuestion => ({ id, mode: 'math', source: 'x+1', stage, lessonId: 'L1' });
const lesson: Lesson = { id: 'L1', book: 'B', section: '1.1', title: 'درس', concepts: [{ id: 'C1', title: 'مفهوم', checkQuestionIds: ['L1-L01'], blocks: [
  { type: 'paragraph', text: 'متن' },
  { type: 'example', title: 'کادر «چگونه» کتاب (How To): دامنه', steps: ['۱', '۲'] },
  { type: 'example', title: 'روش گام‌به‌گام: دامنه', steps: ['۱'] },
  { type: 'example', title: 'مثال ۱', steps: ['گام ۱', 'گام ۲'] },
  { type: 'note', text: 'مثال هدایت‌شده («تکمیلی») — فقط راهنمایی' },
  { type: 'note', text: 'خطاهای رایج' },
] }] };

describe('lesson work items', () => {
  it('lists worked and guided examples, then checks, then section exercises, skipping How To and method boxes', () => {
    const section = buildLessonSections(lesson)[0];
    const items = buildSectionWorkItems(section, [q('L1-L01', 'learn')], [q('L1-X001', 'practice'), q('L1-01', 'practice')]);
    expect(items.map(item => [item.kind, item.key])).toEqual([
      ['example', exampleWorkKey('C1', 3)],
      ['guided', exampleWorkKey('C1', 4)],
      ['check', questionWorkKey('L1-L01')],
      ['exercise', 'q:L1-X001'],
      ['exercise', 'q:L1-01'],
    ]);
    expect(buildSectionWorkItems(undefined, [], [])).toEqual([]);
  });

  it('keeps a valid selection and falls back to the first item of the section', () => {
    const items = buildSectionWorkItems(buildLessonSections(lesson)[0], [], [q('L1-X001', 'practice')]);
    expect(resolveSelectedWorkItem(items, 'q:L1-X001')?.key).toBe('q:L1-X001');
    expect(resolveSelectedWorkItem(items, 'q:other-section')?.key).toBe(items[0].key);
    expect(resolveSelectedWorkItem([], 'x')).toBeUndefined();
  });

  it('preserves answer metadata when creating a section exercise work item', () => {
    const question: BankQuestion = { id: 'L1-TEXT', mode: 'text', source: 'Explain the idea.', prompt: 'Explain the idea.', answerType: 'text', lessonId: 'L1', stage: 'practice' };
    const item = buildSectionWorkItems(buildLessonSections(lesson)[0], [], [question]).find(entry => entry.kind === 'exercise')!;
    expect(item.workQuestion).toMatchObject({ id: 'q:L1-TEXT', answerType: 'text', mode: 'text', source: 'Explain the idea.' });
  });

  it('chooses split on wide screens and tabs otherwise; clamps and maps the resize ratio for RTL and LTR', () => {
    expect(lessonPaneMode(true)).toBe('split');
    expect(lessonPaneMode(false)).toBe('tabs');
    expect(clampSplitRatio(10)).toBe(30);
    expect(clampSplitRatio('90')).toBe(70);
    expect(clampSplitRatio('nope')).toBe(SPLIT_DEFAULT);
    expect(clampSplitRatio(undefined)).toBe(SPLIT_DEFAULT);
    const rect = { left: 0, width: 1000 };
    expect(ratioFromPointer(400, rect, false)).toBe(40);
    expect(ratioFromPointer(400, rect, true)).toBe(60);
    expect(ratioFromPointer(5, rect, true)).toBe(70);
    expect(ratioFromPointer(5, { left: 0, width: 0 }, true)).toBe(SPLIT_DEFAULT);
  });

  it('drops unknown or malformed saved work entry by entry', () => {
    const allowed = allowedWorkKeys(lesson, [q('L1-X001', 'practice'), q('L1-L01', 'learn')]);
    expect(allowed.has('q:L1-X001')).toBe(true);
    expect(allowed.has('q:L1-L01')).toBe(false);
    const steps = [blankStep()];
    const result = normalizeWorkAnswers({ 'q:L1-X001': { type: 'math', steps }, 'q:nope': { type: 'math', steps }, [exampleWorkKey('C1', 3)]: { type: 'text', value: 'x' } }, allowed, () => steps);
    expect(Object.keys(result!)).toEqual(['q:L1-X001']);
    expect(normalizeWorkAnswers('bad', allowed, () => steps)).toBeUndefined();
  });
});

describe('lesson work storage compatibility', () => {
  beforeEach(() => localStorage.clear());
  const VERSION = 'sample-v1-abc', NOW = '2026-10-30T12:00:00.000Z';
  function bank(): DriveBank {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as { lessons: Array<{ concepts: Array<{ blocks: unknown[] }> }> };
    raw.lessons[0].concepts[0].blocks.push({ type: 'example', title: 'Worked example', steps: ['Step 1'] });
    return validateBank(raw);
  }
  function base(): LessonProgress {
    return { lessonId: 'SAMPLE-1.1', status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0, completedSectionIds: [], completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {}, learnStartedAt: NOW };
  }

  it('reads progress saved before work answers existed unchanged', () => {
    const source = bank(), state = emptyLessonProgressState(source.bank_id, VERSION);
    state.progressById['SAMPLE-1.1'] = base();
    saveLessonProgress(source, VERSION, state);
    const restored = readLessonProgress(source, VERSION, localStorage, NOW).progressById['SAMPLE-1.1'];
    expect(restored).toEqual(base());
    expect(restored.workAnswers).toBeUndefined();
  });

  it('round-trips work, drops invalid entries without losing the rest, and never exports work', () => {
    const source = bank(), state = emptyLessonProgressState(source.bank_id, VERSION);
    const step = blankStep(); step.expression = parse('2+3');
    const exampleIndex = source.lessons![0].concepts[0].blocks.length - 1;
    const exampleKey = exampleWorkKey('SAMPLE-1.1-C1', exampleIndex);
    state.progressById['SAMPLE-1.1'] = { ...base(), workAnswers: {
      'q:SAMPLE-1.1-P01': { type: 'math', steps: [step] },
      [exampleKey]: { type: 'math', steps: [step] },
      'q:NOT-IN-BANK': { type: 'math', steps: [step] },
    } };
    saveLessonProgress(source, VERSION, state);
    const restored = readLessonProgress(source, VERSION, localStorage, NOW);
    expect(restored.warning).toBe('');
    const progress = restored.progressById['SAMPLE-1.1'];
    expect(Object.keys(progress.workAnswers ?? {}).sort()).toEqual([exampleKey, 'q:SAMPLE-1.1-P01'].sort());
    expect(progress.answeredCheckIds).toEqual([]);
    expect(progress.completedPracticeQuestionIds).toBeUndefined();
    expect(JSON.stringify(lessonExportDataFromState(restored))).not.toContain('workAnswers');
  });

  it('round-trips all typed work answers and migrates old math work to a read-only legacy answer', () => {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as { questions: Array<Record<string, unknown>> };
    raw.questions.push(
      { id: 'SAMPLE-1.1-TEXT', mode: 'text', source: 'Explain the method.', stage: 'practice', lessonId: 'SAMPLE-1.1' },
      { id: 'SAMPLE-1.1-CHOICE', mode: 'text', source: 'Choose an option.', answerType: 'choice', choices: ['A', 'B'], stage: 'practice', lessonId: 'SAMPLE-1.1' },
      { id: 'SAMPLE-1.1-TF', mode: 'text', source: 'Is the statement true?', answerType: 'true_false_why', stage: 'practice', lessonId: 'SAMPLE-1.1' },
      { id: 'SAMPLE-1.1-MISTAKE', mode: 'text', source: 'Find the mistake.', answerType: 'find_mistake', stage: 'practice', lessonId: 'SAMPLE-1.1' },
    );
    const source = validateBank(raw), state = emptyLessonProgressState(source.bank_id, VERSION);
    const legacyStep = blankStep(); legacyStep.expression = parse('3+4');
    state.progressById['SAMPLE-1.1'] = { ...base(), workAnswers: {
      'q:SAMPLE-1.1-TEXT': { type: 'text', value: 'Explain with words.' },
      'q:SAMPLE-1.1-CHOICE': { type: 'choice', value: 'B' },
      'q:SAMPLE-1.1-TF': { type: 'true_false_why', choice: 'false', reason: 'A counterexample disproves it.' },
      'q:SAMPLE-1.1-MISTAKE': { type: 'find_mistake', value: 'The sign changes here.' },
      'q:SAMPLE-1.1-P01': { type: 'math', steps: [legacyStep] },
    } };

    expect(saveLessonProgress(source, VERSION, state).saved).toBe(true);
    const restored = readLessonProgress(source, VERSION, localStorage, NOW);
    const answers = restored.progressById['SAMPLE-1.1'].workAnswers!;
    expect(answers['q:SAMPLE-1.1-TEXT']).toEqual({ type: 'text', value: 'Explain with words.' });
    expect(answers['q:SAMPLE-1.1-CHOICE']).toEqual({ type: 'choice', value: 'B' });
    expect(answers['q:SAMPLE-1.1-TF']).toEqual({ type: 'true_false_why', choice: 'false', reason: 'A counterexample disproves it.' });
    expect(answers['q:SAMPLE-1.1-MISTAKE']).toEqual({ type: 'find_mistake', value: 'The sign changes here.' });
    expect(answers['q:SAMPLE-1.1-P01']).toMatchObject({ type: 'math', steps: [legacyStep] });
    expect(JSON.stringify(lessonExportDataFromState(restored))).not.toContain('workAnswers');
  });

  it('preserves legacy math steps read-only when the question now requires text', () => {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as { questions: Array<Record<string, unknown>> };
    raw.questions.push({ id: 'SAMPLE-1.1-TEXT', mode: 'text', source: 'Explain the method.', stage: 'practice', lessonId: 'SAMPLE-1.1' });
    const source = validateBank(raw), state = emptyLessonProgressState(source.bank_id, VERSION);
    const oldStep = blankStep(); oldStep.expression = parse('3+4');
    state.progressById['SAMPLE-1.1'] = { ...base(), workAnswers: { 'q:SAMPLE-1.1-TEXT': { type: 'math', steps: [oldStep] } } };

    expect(saveLessonProgress(source, VERSION, state).saved).toBe(true);
    expect(readLessonProgress(source, VERSION, localStorage, NOW).progressById['SAMPLE-1.1'].workAnswers?.['q:SAMPLE-1.1-TEXT'])
      .toMatchObject({ type: 'text', value: '', legacyMathSteps: [oldStep] });
  });
});
