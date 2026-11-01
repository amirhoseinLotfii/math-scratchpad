import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_BANK, bankDocument, findForbiddenKey, MAX_BANK_TEXT_LENGTH, parseBankText, readBankCache, saveBankCache, snapshotVersion, validateBank } from '../../src/features/drive-bank/drive-bank';
import { buildChapterExportBundle, buildLessonExportBundle, lessonExportMarkdown } from '../../src/features/lessons/lesson-export';
import { buildMixedReviewSet, mixedReviewHistory, redactMixedReviewAttribution, type MixedReviewHistory } from '../../src/features/lessons/mixed-review';
import { snapshotAttemptedPracticeResults } from '../../src/features/lessons/lesson-practice-results';
import { emptyLessonProgressState, readLessonProgress, saveLessonProgress } from '../../src/features/lessons/lesson-progress-store';
import type { LessonProgress, MixedReviewRun } from '../../src/features/lessons/types';

const v23Text = readFileSync('data/MATH_QUESTION_BANK_v23.json', 'utf8');
const raw = JSON.parse(v23Text) as unknown;
const bank = validateBank(raw);
const v22 = validateBank(JSON.parse(readFileSync('data/MATH_QUESTION_BANK_v22.json', 'utf8')) as unknown);
const chapterLessons = bank.lessons?.filter(lesson => /^PC-1\.[1-7]$/.test(lesson.id)) ?? [];
const NOW = '2026-11-01T12:00:00.000Z';

function progressFor(lessonId: string): LessonProgress {
  return { lessonId, status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0, completedSectionIds: [], completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {} };
}
function seeded(seed: number) {
  let value = seed;
  return () => { value = (value * 48271) % 2147483647; return value / 2147483647; };
}
afterEach(() => localStorage.clear());

describe('v23 answer-free heavy practice bank', () => {
  it('parses inside the bounded upload/cache size and keeps every v22 chunk reference', () => {
    expect(v23Text.length).toBeLessThan(MAX_BANK_TEXT_LENGTH);
    expect(parseBankText(v23Text)).not.toBe(EMPTY_BANK);
    expect(() => parseBankText(' '.repeat(MAX_BANK_TEXT_LENGTH + 1))).toThrow('too large');
    expect(bank.version).toBe('v23');
    expect(bank.questions).toHaveLength(1435);
    expect((bank.parseWarnings ?? [])).toEqual([]);
    expect(chapterLessons).toHaveLength(7);
    expect(chapterLessons.flatMap(lesson => lesson.concepts.flatMap(concept => concept.learningChunks ?? []))).toHaveLength(227);
  });

  it('stores and reloads the complete v23 bank as an offline cache', async () => {
    const version = await snapshotVersion(bank);
    expect(await saveBankCache('drive-chapter-one-v23', bank, version, 'fingerprint-v23', localStorage)).toMatchObject({ saved: true });
    const cached = await readBankCache('drive-chapter-one-v23', localStorage);
    expect(cached?.bank.questions).toHaveLength(bank.questions.length);
    expect(cached?.fingerprint).toBe('fingerprint-v23');
  });

  it('migrates a saved v22 choice response without requiring a newly added rationale', async () => {
    const oldLesson = v22.lessons!.find(lesson => lesson.id === 'PC-1.1')!;
    const oldQuestion = v22.questions.find(question => question.id === 'PC-1.1-L02')!;
    const oldChunk = oldLesson.concepts.flatMap(concept => concept.learningChunks ?? []).find(chunk => chunk.questionIds.includes(oldQuestion.id))!;
    expect(oldQuestion.requiresExplanation).toBeUndefined();
    const oldVersion = await snapshotVersion(v22);
    const newVersion = await snapshotVersion(bank);
    const progress: LessonProgress = {
      ...progressFor(oldLesson.id), currentChunkId: oldChunk.id, activeConceptPhase: 'reading',
      chunkAnswers: { [oldQuestion.id]: { value: oldQuestion.choices![0]!, updatedAt: NOW, submittedAt: NOW } },
    };
    const oldState = emptyLessonProgressState(v22.bank_id, oldVersion);
    oldState.progressById[oldLesson.id] = progress;
    expect(saveLessonProgress(v22, oldVersion, oldState, localStorage)).toMatchObject({ saved: true });
    const migrated = readLessonProgress(bank, newVersion, localStorage, NOW);
    expect(migrated.persistenceBlocked).toBe(false);
    expect(migrated.progressById[oldLesson.id].chunkAnswers?.[oldQuestion.id]).toMatchObject({ value: oldQuestion.choices![0], submittedAt: NOW });
  });

  it('gives every reading chunk three varied question-only checks and every concept three labelled extras', () => {
    const allInteractions = new Set<string>();
    let extraCount = 0;
    for (const lesson of chapterLessons) for (const concept of lesson.concepts) {
      const chunks = concept.learningChunks ?? [];
      const conceptInteractions = new Set<string>();
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.questionIds).toHaveLength(3);
        const questions = chunk.questionIds.map(id => bank.questions.find(question => question.id === id)!);
        for (const question of questions) {
          expect(question).toMatchObject({ lessonId: lesson.id, conceptId: concept.id, stage: 'learn' });
          expect(question.tags).toMatchObject({ chapter: bank.chapter?.id, lesson: lesson.id, concept: concept.id });
          expect(question.tags?.skill).toBeTruthy();
          expect(question.interactionType).toBeTruthy();
          allInteractions.add(question.interactionType!);
          conceptInteractions.add(question.interactionType!);
          if (question.id.startsWith(`${chunk.id}-Q`) && question.interactionType === 'true-false-why') {
            expect(question).toMatchObject({ answerType: 'choice', choices: ['درست است', 'نادرست است'], requiresExplanation: true });
          }
          if (question.id.startsWith(`${chunk.id}-Q`) && question.interactionType === 'multiple-choice') {
            expect(new Set(question.choices).size).toBe(question.choices?.length);
            expect(question.requiresExplanation).toBe(true);
          }
        }
        for (const question of questions.filter(question => question.id.startsWith(`${chunk.id}-Q`) && question.answerType === 'choice')) {
          expect(question.choices?.length).toBeGreaterThanOrEqual(2);
          expect(question.requiresExplanation).toBe(true);
        }
      }
      const extras = bank.questions.filter(question => question.id.startsWith(`${concept.id}-MORE-`));
      expect(extras).toHaveLength(3);
      expect(extras.every(question => question.stage === 'practice' && question.origin === 'generated')).toBe(true);
      expect(extras.every(question => question.prompt?.includes('تمرین اضافه (هم‌سطح کتاب)'))).toBe(true);
      const section = lesson.sections?.find(item => item.conceptIds.includes(concept.id));
      const sourceCandidates = (section?.practiceQuestionIds ?? []).map(id => bank.questions.find(question => question.id === id))
        .filter((question): question is NonNullable<typeof question> => !!question && !question.id.includes('-MORE-'));
      const sourceQuestion = sourceCandidates.find(question => question.origin === 'textbook') ?? sourceCandidates[0]
        ?? concept.checkQuestionIds.map(id => bank.questions.find(question => question.id === id)).find((question): question is NonNullable<typeof question> => !!question);
      expect(sourceQuestion).toBeTruthy();
      expect(extras.every(question => question.source === sourceQuestion!.source)).toBe(true);
      expect(extras[0]?.prompt).toContain(sourceQuestion!.prompt ?? sourceQuestion!.source);
      expect(extras.map(question => question.interactionType)).toContain('explain');
      expect(extras.map(question => question.interactionType)).toContain('find-mistake');
      expect(extras.every(question => question.tags?.chapter === bank.chapter?.id && question.tags?.lesson === lesson.id && !!question.tags?.section && question.tags?.concept === concept.id && !!question.tags?.skill && question.tags.source === 'extra' && !!question.tags.modeledOn)).toBe(true);
      extras.forEach(question => { allInteractions.add(question.interactionType!); conceptInteractions.add(question.interactionType!); });
      expect(conceptInteractions.size).toBeGreaterThanOrEqual(5);
      extraCount += extras.length;
    }
    expect(extraCount).toBe(117);
    for (const type of ['typed', 'multiple-choice', 'true-false-why', 'find-mistake', 'explain', 'step-by-step']) expect(allInteractions.has(type)).toBe(true);
    const chapterQuestions = bank.questions.filter(question => /^PC-1\.[1-7]$/.test(question.lessonId ?? ''));
    expect(chapterQuestions.every(question => question.tags?.chapter === bank.chapter?.id && !!question.tags?.lesson && !!question.tags?.section && !!question.tags?.concept && !!question.tags?.skill && !!question.tags?.source)).toBe(true);
    expect(findForbiddenKey(raw)).toBeNull();
    expect(JSON.stringify(raw)).not.toMatch(/"(?:answer|answers|solution|solutions|answer_key|correct_answer)"\s*:/iu);
  });

  it('rejects missing, mismatched, future, or out-of-flow provenance while preserving v22 compatibility', () => {
    type TaggedBank = {
      version: string;
      questions: Array<{ id: string; lessonId?: string; sectionId?: string; tags?: Record<string, string> }>;
      lessons: Array<{
        id: string;
        sections?: Array<{ id: string; practiceQuestionIds: string[] }>;
        concepts: Array<{ id: string; blocks: Array<{ type: string; title?: string; source?: string; modeledOn?: string }> }>;
      }>;
    };
    const original = JSON.parse(v23Text) as TaggedBank;
    const extraId = 'PC-1.2-C01-MORE-01';
    const extra = original.questions.find(question => question.id === extraId)!;
    const futureBook = original.questions.find(question => question.id === 'PC-1.2-X004')!;
    expect(() => validateBank(v22)).not.toThrow();
    const supplementalBlock = original.lessons.find(lesson => lesson.id === 'PC-1.2')!.concepts.find(concept => concept.id === 'PC-1.2-C01')!.blocks.find(block => block.title?.includes('مثال آموزشی تکمیلی'))!;
    expect(supplementalBlock).toMatchObject({ source: 'extra', modeledOn: 'PC-1.2-X001' });

    const withoutModel = structuredClone(original);
    delete withoutModel.questions.find(question => question.id === extraId)!.tags!.modeledOn;
    expect(() => validateBank(withoutModel)).toThrow(/modeledOn/u);

    const futureModel = structuredClone(original);
    futureModel.questions.find(question => question.id === extraId)!.tags!.modeledOn = futureBook.id;
    expect(() => validateBank(futureModel)).toThrow(/later lesson or section/u);

    const wrongConcept = structuredClone(original);
    wrongConcept.questions.find(question => question.id === extraId)!.tags!.concept = 'PC-1.2-C02';
    expect(() => validateBank(wrongConcept)).toThrow(/section flow/u);

    const unassignedBookItem = structuredClone(original);
    const bookToRemove = unassignedBookItem.questions.find(question => question.id === futureBook.id)!;
    const section = unassignedBookItem.lessons.find(lesson => lesson.id === 'PC-1.2')!.sections!.find(item => item.id === bookToRemove.sectionId)!;
    section.practiceQuestionIds = section.practiceQuestionIds.filter(id => id !== bookToRemove.id);
    expect(() => validateBank(unassignedBookItem)).toThrow(/section flow|missing from its section/u);

    const missingTag = structuredClone(original);
    delete missingTag.questions.find(question => question.id === extraId)!.tags!.section;
    expect(() => validateBank(missingTag)).toThrow(/require chapter, lesson, section/u);

    const missingExampleModel = structuredClone(original);
    const blockWithoutModel = missingExampleModel.lessons.find(lesson => lesson.id === 'PC-1.2')!.concepts.find(concept => concept.id === 'PC-1.2-C01')!.blocks.find(block => block.title?.includes('مثال آموزشی تکمیلی'))!;
    delete blockWithoutModel.modeledOn;
    expect(() => validateBank(missingExampleModel)).toThrow(/supplemental examples require extra provenance and modeledOn/u);

    const futureExampleModel = structuredClone(original);
    const blockWithFutureModel = futureExampleModel.lessons.find(lesson => lesson.id === 'PC-1.2')!.concepts.find(concept => concept.id === 'PC-1.2-C01')!.blocks.find(block => block.title?.includes('مثال آموزشی تکمیلی'))!;
    blockWithFutureModel.modeledOn = futureBook.id;
    expect(() => validateBank(futureExampleModel)).toThrow(/later lesson or section/u);
    expect(extra.tags?.source).toBe('extra');
  });
});

describe('tag-based mixed review selection', () => {
  it('removes lesson/concept citations from pending mixed prompts while preserving their math', () => {
    expect(redactMixedReviewAttribution('پیش‌حسابان ۱٫۱ · نماد تابع: مقدار خروجی تابع. (پیوند با کتاب: مثال ۳، صفحهٔ ۱۱ کتاب)'))
      .toBe('مقدار خروجی تابع.');
    expect(redactMixedReviewAttribution('تمرین اضافه (هم‌سطح کتاب): با الگوبرداری از تمرین کتاب PC-1.2-X004 یک نمونهٔ تازه بساز.'))
      .not.toMatch(/PC-1\.2|الگوبرداری از تمرین کتاب/u);
    const bookExerciseCitation = redactMixedReviewAttribution('تمرین اضافه (هم‌سطح کتاب) · بازتمرین: تمرین کتاب · بخش 1.2 · شمارهٔ 1');
    expect(bookExerciseCitation).toBe('تمرین اضافه (هم‌سطح کتاب) · بازتمرین: تمرین کتاب');
    for (const question of bank.questions.filter(item => item.id.startsWith('PC-1.2-C01-MORE-'))) {
      const pending = redactMixedReviewAttribution(question.prompt ?? '');
      expect(pending).not.toMatch(/پیش‌حسابان\s+[۰-۹\d]+\s*·|بخش\s+1\.2\s*·\s*شماره|PC-1\.2/iu);
    }
    expect(redactMixedReviewAttribution('f(x)=x^2-4; {(1,2),(2,4)}')).toBe('f(x)=x^2-4; {(1,2),(2,4)}');
  });

  it('builds cumulative lesson sets and only offers the chapter test at the last tagged lesson', () => {
    const cumulative = buildMixedReviewSet(bank, { lessonId: 'PC-1.4', mode: 'lesson', now: Date.parse(NOW), random: seeded(5), limit: 60 });
    const lessonOrder = bank.lessons!.map(lesson => lesson.id);
    expect(cumulative.length).toBeGreaterThan(0);
    expect(cumulative.every(question => lessonOrder.indexOf(question.tags!.lesson!) <= lessonOrder.indexOf('PC-1.4'))).toBe(true);
    expect(new Set(cumulative.map(question => question.tags?.lesson)).size).toBeGreaterThan(1);
    expect(new Set(cumulative.map(question => question.tags?.concept)).size).toBeGreaterThan(1);
    expect(buildMixedReviewSet(bank, { lessonId: 'PC-1.6', mode: 'chapter', now: Date.parse(NOW) })).toEqual([]);
    const chapter = buildMixedReviewSet(bank, { lessonId: 'PC-1.7', mode: 'chapter', now: Date.parse(NOW), random: seeded(9), limit: 60 });
    expect(chapter.length).toBeGreaterThan(0);
    expect(chapter.every(question => question.tags?.chapter === bank.chapter?.id)).toBe(true);
    expect(new Set(chapter.map(question => question.tags?.lesson)).size).toBeGreaterThan(1);
    expect(new Set(chapter.map(question => question.tags?.concept)).size).toBeGreaterThan(1);
  });

  it('supports a future multi-chapter bank and selects all earlier chapter tags automatically', () => {
    const synthetic = validateBank({
      schema_version: 'math-scratchpad.bank/1.0', bank_id: 'COURSE-ALL', version: 'v1',
      chapters: [
        { id: 'PC-1', number: 1, title: 'Chapter one', source: 'OpenStax', pdfPages: '1–20', lessonIds: ['PC-1.1'] },
        { id: 'PC-2', number: 2, title: 'Chapter two', source: 'OpenStax', pdfPages: '21–40', lessonIds: ['PC-2.1'] },
      ],
      lessons: [
        { id: 'PC-1.1', book: 'OpenStax Precalculus 2e', section: '1.1', title: 'Relations', concepts: [{ id: 'C-1', title: 'Relation', blocks: [], checkQuestionIds: ['Q-1'] }] },
        { id: 'PC-2.1', book: 'OpenStax Precalculus 2e', section: '2.1', title: 'Later lesson', concepts: [{ id: 'C-2', title: 'Later concept', blocks: [], checkQuestionIds: ['Q-2'] }] },
      ],
      questions: [
        { id: 'Q-1', mode: 'text', source: 'Name one ordered pair.', lessonId: 'PC-1.1', conceptId: 'C-1', stage: 'practice', tags: { chapter: 'PC-1', lesson: 'PC-1.1', concept: 'C-1', skill: 'ordered-pairs' } },
        { id: 'Q-2', mode: 'text', source: 'Name one ordered pair.', lessonId: 'PC-2.1', conceptId: 'C-2', stage: 'practice', tags: { chapter: 'PC-2', lesson: 'PC-2.1', concept: 'C-2', skill: 'ordered-pairs' } },
      ],
    });
    expect(synthetic.parseWarnings).toBeUndefined();
    expect(synthetic.chapter).toBeUndefined();
    expect(synthetic.chapters?.map(item => item.id)).toEqual(['PC-1', 'PC-2']);
    const cumulative = buildMixedReviewSet(synthetic, { lessonId: 'PC-2.1', mode: 'lesson', random: seeded(3) });
    expect(cumulative.map(question => question.id).sort()).toEqual(['Q-1', 'Q-2']);
    expect(buildMixedReviewSet(synthetic, { lessonId: 'PC-1.1', mode: 'chapter' })).toEqual(['Q-1'].map(id => synthetic.questions.find(question => question.id === id)!));
    expect(buildMixedReviewSet(synthetic, { lessonId: 'PC-2.1', mode: 'chapter' }).map(question => question.id)).toEqual(['Q-2']);
    expect(buildChapterExportBundle(synthetic, {}, NOW, 'PC-1.1').lessons.map(lesson => lesson.id)).toEqual(['PC-1.1']);
    expect(buildChapterExportBundle(synthetic, {}, NOW, 'PC-2.1').lessons.map(lesson => lesson.id)).toEqual(['PC-2.1']);
  });

  it('prioritizes incorrect, then unseen, then stale items and changes order when shuffled', () => {
    const order = bank.lessons!.map(lesson => lesson.id);
    const candidates = bank.questions.filter(question => question.tags?.lesson && question.stage !== 'learn' && order.indexOf(question.tags.lesson) <= order.indexOf('PC-1.4'));
    const selectedWrong = candidates[0]!;
    const selectedUnseen = candidates[1]!;
    const history: MixedReviewHistory = Object.fromEntries(candidates.map(question => [question.id, { status: 'answered' as const, correctness: 'unknown' as const, updatedAt: NOW }]));
    history[selectedWrong.id] = { status: 'answered', correctness: 'incorrect', updatedAt: NOW };
    delete history[selectedUnseen.id];
    expect(buildMixedReviewSet(bank, { lessonId: 'PC-1.4', mode: 'lesson', history, now: Date.parse(NOW), random: seeded(4), limit: 1 })).toEqual([selectedWrong]);
    delete history[selectedWrong.id];
    const unseenFirst = buildMixedReviewSet(bank, { lessonId: 'PC-1.4', mode: 'lesson', history, now: Date.parse(NOW), random: seeded(4), limit: 1 })[0]!;
    expect(history[unseenFirst.id]).toBeUndefined();

    const staleHistory: MixedReviewHistory = Object.fromEntries(candidates.map(question => [question.id, { status: 'answered' as const, correctness: 'unknown' as const, updatedAt: NOW }]));
    const selectedStale = candidates[2]!;
    staleHistory[selectedStale.id] = { status: 'answered', correctness: 'unknown', updatedAt: new Date(Date.parse(NOW) - 8 * 24 * 60 * 60 * 1000).toISOString() };
    expect(buildMixedReviewSet(bank, { lessonId: 'PC-1.4', mode: 'lesson', history: staleHistory, now: Date.parse(NOW), random: seeded(4), limit: 1 })).toEqual([selectedStale]);

    const allSeen: MixedReviewHistory = Object.fromEntries(candidates.map(question => [question.id, { status: 'answered' as const, correctness: 'unknown' as const, updatedAt: new Date(Date.parse(NOW) - 8 * 24 * 60 * 60 * 1000).toISOString() }]));
    const firstOrder = buildMixedReviewSet(bank, { lessonId: 'PC-1.4', mode: 'lesson', history: allSeen, now: Date.parse(NOW), random: seeded(1), limit: 12 }).map(question => question.id);
    const secondOrder = buildMixedReviewSet(bank, { lessonId: 'PC-1.4', mode: 'lesson', history: allSeen, now: Date.parse(NOW), random: seeded(89), limit: 12 }).map(question => question.id);
    expect(firstOrder).not.toEqual(secondOrder);
  });
});

describe('mixed review persistence and exports', () => {
  it('persists touched mixed items and represents untouched questions as open, without bloating history', () => {
    const questions = bank.questions.filter(question => question.tags?.lesson === 'PC-1.1' && question.stage !== 'learn').slice(0, 2);
    const doc = bankDocument(bank, 'v23-test', questions);
    doc.exercises[0]!.answerType = 'text';
    doc.exercises[0]!.answerText = 'پاسخ اولیه';
    const results = snapshotAttemptedPracticeResults(doc.exercises, questions.map(question => question.id), {}, NOW);
    expect(results[questions[0]!.id]).toMatchObject({ status: 'draft', answer: 'پاسخ اولیه' });
    expect(results).not.toHaveProperty(questions[1]!.id);
  });

  it('round-trips cross-lesson active results without changing old lesson exercise keys', () => {
    const owner = bank.lessons!.find(lesson => lesson.id === 'PC-1.4')!;
    const priorQuestion = bank.questions.find(question => question.tags?.lesson === 'PC-1.1' && question.stage !== 'learn')!;
    const run: MixedReviewRun = {
      id: 'mixed-test-run', mode: 'lesson', questionIds: [priorQuestion.id], startedAt: NOW, updatedAt: NOW,
      results: { [priorQuestion.id]: { status: 'answered', answer: 'پاسخ تمرینی من', steps: [], updatedAt: NOW, submittedAt: NOW } },
    };
    const progress: LessonProgress = { ...progressFor(owner.id), status: 'practising', mixedReviewRuns: [run], activeMixedReviewRunId: run.id };
    const state = emptyLessonProgressState(bank.bank_id, 'v23-test');
    state.progressById[owner.id] = progress;
    expect(saveLessonProgress(bank, 'v23-test', state, localStorage)).toMatchObject({ saved: true });
    const restored = readLessonProgress(bank, 'v23-test', localStorage, NOW);
    expect(restored.persistenceBlocked).toBe(false);
    expect(restored.progressById[owner.id].activeMixedReviewRunId).toBe(run.id);
    expect(restored.progressById[owner.id].mixedReviewRuns?.[0].results[priorQuestion.id]).toMatchObject({ status: 'answered', answer: 'پاسخ تمرینی من' });
    expect(restored.progressById[owner.id].mixedReviewRuns?.[0].results[priorQuestion.id]).not.toHaveProperty('correctness');
  });

  it('exports concept attempt/correct/open counts and mixed answers with tags but no invented grading', () => {
    const lesson = bank.lessons!.find(entry => entry.id === 'PC-1.4')!;
    const concept = lesson.concepts[0]!;
    const extra = bank.questions.find(question => question.id === `${concept.id}-MORE-01`)!;
    const skippedExtra = bank.questions.find(question => question.id === `${concept.id}-MORE-02`)!;
    const prior = bank.questions.find(question => question.tags?.lesson === 'PC-1.1' && question.stage !== 'learn')!;
    const priorSkipped = bank.questions.find(question => question.tags?.lesson === 'PC-1.2' && question.stage !== 'learn')!;
    const finishedRun: MixedReviewRun = {
      id: 'mixed-export-run', mode: 'lesson', questionIds: [prior.id, priorSkipped.id], startedAt: NOW, updatedAt: NOW, finishedAt: NOW,
      results: {
        [prior.id]: { status: 'answered', answer: 'پاسخ مرورم', steps: [], updatedAt: NOW, submittedAt: NOW },
        [priorSkipped.id]: { status: 'skipped', steps: [], updatedAt: NOW },
      },
    };
    const progress: LessonProgress = {
      ...progressFor(lesson.id),
      practiceResults: {
        [extra.id]: { status: 'answered', answer: 'توضیح من', steps: [], updatedAt: NOW, submittedAt: NOW },
        [skippedExtra.id]: { status: 'skipped', steps: [], updatedAt: NOW },
      },
      mixedReviewRuns: [finishedRun],
    };
    const bundle = buildLessonExportBundle(bank, lesson, progress, NOW);
    const activity = bundle.lessons[0].concepts[0].activitySummary;
    expect(activity).toMatchObject({ attempted: 1, skipped: 1, correct: 0, incorrect: 0, correctnessUnknown: 1 });
    expect(activity.open).toBe(activity.total - 2);
    expect(bundle.lessons[0].mixedReviews[0]).toMatchObject({ attempted: 1, skipped: 1, open: 0 });
    expect(bundle.lessons[0].mixedReviews[0].items[0]).toMatchObject({ id: prior.id, studentAnswer: 'پاسخ مرورم', correctness: 'unknown', tags: prior.tags });
    const markdown = lessonExportMarkdown(bundle);
    expect(markdown).toContain('تلاش‌شده: 1');
    expect(markdown).toContain('درستِ تأییدشده: 0');
    expect(markdown).toContain('ردشده: 1');
    expect(markdown).toContain('پاسخ مرورم');
    expect(markdown).toContain('chapter=');
    expect(markdown).toContain('⭐ غیرکتابی (هم‌سطح کتاب)');
    expect(markdown).toContain('modeledOn=');
    expect(markdown).toContain('مدل‌شده از مورد کتاب: `PC-1.4-X');
    expect(markdown).toContain('بدون کلید؛ برای بررسی خروجی را بفرست');
    const chapter = buildChapterExportBundle(bank, { [lesson.id]: progress }, NOW);
    expect(chapter.lessons.find(entry => entry.id === lesson.id)?.mixedReviews).toHaveLength(1);
  });

  it('exports a skipped learning check with its status and timestamp', () => {
    const lesson = bank.lessons!.find(entry => entry.id === 'PC-1.4')!;
    const concept = lesson.concepts[0]!;
    const skippedId = concept.checkQuestionIds[0]!;
    const skippedAt = '2026-10-31T11:00:00.000Z';
    const progress = { ...progressFor(lesson.id), skippedChecks: [{ questionId: skippedId, at: skippedAt }] };
    const exported = buildLessonExportBundle(bank, lesson, progress, NOW).lessons[0]!.concepts[0]!;
    const exportedCheck = [...exported.chunks.flatMap(chunk => chunk.questions), ...exported.unassignedChecks].find(question => question.id === skippedId);
    expect(exportedCheck).toMatchObject({ status: 'skipped', updatedAt: skippedAt, correctness: 'unknown' });
    expect(exportedCheck).not.toHaveProperty('attemptedAt');
  });

  it('combines history from ordinary practice and mixed runs for future spaced selection', () => {
    const oldQuestion = bank.questions.find(question => question.stage !== 'learn' && question.tags?.lesson === 'PC-1.1')!;
    const newQuestion = bank.questions.find(question => question.stage !== 'learn' && question.tags?.lesson === 'PC-1.2')!;
    const historyProgress: LessonProgress = {
      ...progressFor('PC-1.1'),
      practiceResults: { [oldQuestion.id]: { status: 'answered', correctness: 'incorrect', steps: [], updatedAt: NOW } },
      mixedReviewRuns: [{ id: 'mixed-history-run', mode: 'lesson', questionIds: [newQuestion.id], startedAt: NOW, updatedAt: NOW, results: { [newQuestion.id]: { status: 'answered', correctness: 'correct', steps: [], updatedAt: NOW } } }],
    };
    expect(mixedReviewHistory({ 'PC-1.1': historyProgress })).toMatchObject({
      [oldQuestion.id]: { correctness: 'incorrect' }, [newQuestion.id]: { correctness: 'correct' },
    });
  });
});
