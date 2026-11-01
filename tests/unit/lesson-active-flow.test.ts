import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findForbiddenKey, validateBank } from '../../src/features/drive-bank/drive-bank';
import { buildActiveLessonChunks } from '../../src/features/lessons/lesson-sections';
import { buildChapterExportBundle, buildLessonExportBundle, downloadLessonFile, lessonExportMarkdown } from '../../src/features/lessons/lesson-export';
import { snapshotLessonPracticeResults } from '../../src/features/lessons/lesson-practice-results';
import { nextTextbookPracticeBatch } from '../../src/features/lessons/lesson-practice-batches';
import { getPracticeQuestions } from '../../src/features/lessons/selectors';
import { blankStep, MAX_SESSION_EXERCISES } from '../../src/model';

const rawV22 = JSON.parse(readFileSync('data/MATH_QUESTION_BANK_v22.json', 'utf8')) as unknown;
const bank = validateBank(rawV22);
const chapterLessons = bank.lessons?.filter(lesson => /^PC-1\.[1-7]$/.test(lesson.id)) ?? [];
afterEach(() => { vi.restoreAllMocks(); });

describe('v22 active lesson bank', () => {
  it('loads with the unchanged v21 lesson data and validates each short chunk reference', () => {
    expect(bank.version).toBe('v22');
    expect(bank.questions).toHaveLength(864);
    expect(chapterLessons).toHaveLength(7);
    expect((bank.parseWarnings ?? []).filter(warning => /learningChunks/.test(warning))).toEqual([]);
    const chunks = chapterLessons.flatMap(lesson => lesson.concepts.flatMap(concept => {
      expect(concept.learningChunks?.length).toBeGreaterThan(0);
      for (const chunk of concept.learningChunks ?? []) {
        expect(chunk.questionIds.length).toBeGreaterThanOrEqual(1);
        expect(chunk.questionIds.length).toBeLessThanOrEqual(3);
        expect(chunk.blockIndexes).toEqual([...chunk.blockIndexes].sort((a, b) => a - b));
        for (const questionId of chunk.questionIds) {
          const question = bank.questions.find(entry => entry.id === questionId);
          expect(question).toMatchObject({ lessonId: lesson.id, conceptId: concept.id, stage: 'learn' });
        }
      }
      const allIndexes = concept.learningChunks?.flatMap(chunk => chunk.blockIndexes) ?? [];
      expect(allIndexes).toEqual(Array.from({ length: concept.blocks.length }, (_, index) => index));
      return concept.learningChunks ?? [];
    }));
    expect(chunks).toHaveLength(227);
    expect(buildActiveLessonChunks(chapterLessons[0])).toHaveLength(68);
  });

  it('adds only answer-free typed checks and removes embedded solutions from textbook exercise blocks', () => {
    expect(findForbiddenKey(rawV22)).toBeNull();
    const generated = bank.questions.filter(question => question.id.includes('-K') && question.stage === 'learn');
    expect(generated).toHaveLength(144);
    expect(generated.every(question => question.mode === 'text' && question.answerType === 'text' && !question.guidance)).toBe(true);
    expect(generated.every(question => !Object.hasOwn(question, 'answer') && !Object.hasOwn(question, 'solution'))).toBe(true);
    const exercisePrompt = /^\s*(?:try\s*it\b|تمرین\s*(?:شماره|[۰-۹\d]))/iu;
    const bookExercises = chapterLessons.flatMap(lesson => lesson.concepts.flatMap(concept => concept.blocks.filter(block =>
      block.type === 'example' && exercisePrompt.test(`${block.title ?? ''} ${block.text ?? ''}`))));
    expect(bookExercises).toEqual([]);
    const promptOnlyBlocks = chapterLessons.flatMap(lesson => lesson.concepts.flatMap(concept => concept.blocks.filter(block =>
      block.type === 'paragraph' && exercisePrompt.test(block.text))));
    expect(promptOnlyBlocks).toHaveLength(12);
    const tryIts = chapterLessons.flatMap(lesson => getPracticeQuestions(bank, lesson.id).filter(question => /-TI\d+$/.test(question.id)));
    expect(tryIts).toHaveLength(12);
    expect(tryIts.every(question => question.stage === 'practice' && question.origin === 'textbook' && question.answerType === 'text')).toBe(true);
    expect(tryIts.every(question => !Object.hasOwn(question, 'answer') && !Object.hasOwn(question, 'solution') && !Object.hasOwn(question, 'guidance'))).toBe(true);
    for (const lesson of chapterLessons) for (const concept of lesson.concepts) {
      const prompts = concept.blocks.flatMap(block => block.type === 'paragraph' && exercisePrompt.test(block.text) ? [block.text] : []);
      const questions = getPracticeQuestions(bank, lesson.id).filter(question => question.conceptId === concept.id && /-TI\d+$/.test(question.id));
      expect(questions.map(question => question.source)).toEqual(prompts);
    }
  });

  it('still loads legacy lesson records without learningChunks', () => {
    const legacy = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as Record<string, unknown>;
    const legacyBank = validateBank({ ...legacy, version: 'v21' });
    expect(legacyBank.lessons?.every(lesson => lesson.concepts.every(concept => concept.learningChunks === undefined))).toBe(true);
  });
});

describe('lesson and chapter export', () => {
  it('includes chunk prompts and learner responses while omitting book solution steps', () => {
    const lesson = chapterLessons[0];
    const concept = lesson.concepts[0];
    const chunk = concept.learningChunks![0];
    const questionId = chunk.questionIds[0];
    const exampleIndex = concept.blocks.findIndex(block => block.type === 'example' && block.steps.length > 0);
    const workStep = blankStep();
    workStep.mathLatex = '4';
    const progress = {
      lessonId: lesson.id, status: 'learning' as const, currentConceptIndex: 0, completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], revealedSteps: {},
      currentChunkId: chunk.id, chunkAnswers: { [questionId]: { value: 'پاسخ من', updatedAt: '2026-11-01T09:00:00.000Z', submittedAt: '2026-11-01T09:00:01.000Z' } },
      workAnswers: exampleIndex >= 0 ? { [`ex:${concept.id}:${exampleIndex}`]: { type: 'math' as const, steps: [workStep] } } : undefined,
    };
    const bundle = buildLessonExportBundle(bank, lesson, progress, '2026-11-01T09:01:00.000Z');
    const exportedConcept = bundle.lessons[0].concepts[0];
    expect(exportedConcept.chunks[0].questions[0].studentAnswer).toBe('پاسخ من');
    expect(exportedConcept.examples.every(example => !Object.hasOwn(example, 'steps'))).toBe(true);
    expect(exportedConcept.chunks.flatMap(item => item.content).filter(block => block.type === 'example').every(block => !Object.hasOwn(block, 'steps'))).toBe(true);
    expect(JSON.stringify(bundle)).toContain('پاسخ من');
    expect(JSON.stringify(bundle)).not.toContain('bookSolution');
    const markdown = lessonExportMarkdown(bundle);
    expect(markdown).toContain('<div dir="rtl" lang="fa">');
    expect(markdown).toContain('بدون کلید؛ برای بررسی خروجی را بفرست');
    expect(markdown).toContain('پاسخ من');
    expect(markdown).toContain('\\(');
  });

  it('exports all chapter lesson content and preserves question attempts without grading them', () => {
    const chapter = buildChapterExportBundle(bank, {}, '2026-11-01T09:01:00.000Z');
    expect(chapter.schemaVersion).toBe('math-scratchpad.chapter-export/1.0');
    expect(chapter.lessons.map(lesson => lesson.id)).toEqual(bank.chapter?.lessonIds);
    expect(chapter.lessons.flatMap(lesson => lesson.concepts).flatMap(concept => concept.exercises).every(question => question.correctness === 'unknown')).toBe(true);
  });

  it('downloads offline Blob exports with the requested extension and content type', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const created = vi.fn<(blob: Blob) => string>(() => 'blob:test');
    const revoked = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: created });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoked });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const schedule = vi.spyOn(window, 'setTimeout').mockImplementation(() => 1 as unknown as ReturnType<typeof setTimeout>);
    expect(downloadLessonFile('lesson.md', '# درس', 'md')).toBe(true);
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ type: 'text/markdown;charset=utf-8' }));
    expect(click).toHaveBeenCalled();
    expect(created.mock.calls[0]![0].size).toBeGreaterThan(0);
    expect(schedule).toHaveBeenCalledOnce();
    const revoke = schedule.mock.calls[0][0];
    if (typeof revoke === 'function') revoke();
    expect(revoked).toHaveBeenCalledWith('blob:test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
  });
});

describe('practice answer snapshots', () => {
  it('keeps typed work and timestamps, and does not invent correctness', () => {
    const exercise = {
      id: 'e1', bankQuestionId: 'PC-1.1-X01', mode: 'math' as const, source: 'x+1',
      steps: [{ ...blankStep(), mathLatex: 'x=2', final: true }], confidence: 'medium' as const,
      startedAt: '2026-11-01T08:00:00.000Z', submittedAt: '2026-11-01T08:01:00.000Z',
    };
    const results = snapshotLessonPracticeResults([exercise], [exercise.bankQuestionId], {}, '2026-11-01T08:01:01.000Z');
    expect(results[exercise.bankQuestionId]).toMatchObject({ status: 'answered', startedAt: exercise.startedAt, submittedAt: exercise.submittedAt, updatedAt: '2026-11-01T08:01:01.000Z' });
    expect(results[exercise.bankQuestionId]).not.toHaveProperty('correctness');
    expect(results[exercise.bankQuestionId].steps[0].final).toBe(true);
  });
});

describe('concept exercise batching', () => {
  it('keeps every textbook exercise in source order within the editor session limit', () => {
    const template = bank.questions.find(question => question.lessonId === 'PC-1.1' && question.conceptId === 'PC-1.1-C02' && question.stage === 'practice' && question.origin === 'textbook')!;
    const questions = Array.from({ length: MAX_SESSION_EXERCISES + 5 }, (_, index) => ({ ...template, id: `batch-${index + 1}` }));
    const first = nextTextbookPracticeBatch(questions);
    const second = nextTextbookPracticeBatch(questions, first.map(question => question.id));
    const third = nextTextbookPracticeBatch(questions, [...first, ...second].map(question => question.id));
    expect(first.map(question => question.id)).toEqual(questions.slice(0, MAX_SESSION_EXERCISES).map(question => question.id));
    expect(second.map(question => question.id)).toEqual(questions.slice(MAX_SESSION_EXERCISES).map(question => question.id));
    expect(nextTextbookPracticeBatch(questions, [...first, ...second].map(question => question.id))).toEqual([]);
  });
});
