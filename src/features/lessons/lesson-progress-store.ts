import { allowedWorkKeys, normalizeWorkAnswers } from './lesson-work-items';
import { validateSession } from '../../persistence';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import type { Lesson, LessonCheckAnswer, LessonChunkAnswer, LessonExampleAttempt, LessonPracticeResult, LessonProgress, LessonStatus } from './types';
import { buildLessonSections } from './lesson-sections';

export const LESSON_PROGRESS_PREFIX = 'math-scratchpad-lesson-progress-v1';
export const LESSON_PROGRESS_SCHEMA = 1;
const MAX_RECORD_LENGTH = 4_000_000;
const safeId = /^[\w.-]{1,80}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
const statuses = new Set<LessonStatus>(['learning', 'practising', 'done']);

export type LessonPanelEvent = { questionId: string; openedAt: string; closedAt: string };
export type ActiveLessonPanel = { questionId: string; openedAt: string };
export type LessonProgressState = {
  bankId: string;
  bankVersion: string;
  progressById: Record<string, LessonProgress>;
  lessonPanelEvents: LessonPanelEvent[];
  activePanelEvent?: ActiveLessonPanel;
  persistenceBlocked: boolean;
  warning: string;
  found: boolean;
};
export type LessonProgressExport = Pick<LessonProgress,
  'lessonId' | 'status' | 'currentSectionIndex' | 'completedSectionIds' | 'completedConceptIds' | 'learnStartedAt' | 'skippedChecks' | 'learnSkipped' | 'learnDoneAt' | 'practiceStartedAt'>;
export type LessonExportData = { lessonProgress: LessonProgressExport[]; lessonPanelEvents: LessonPanelEvent[] };

export function lessonProgressStorageKey(bankId: string, bankVersion: string) {
  return `${LESSON_PROGRESS_PREFIX}:${encodeURIComponent(bankId)}:${encodeURIComponent(bankVersion)}`;
}

export function emptyLessonProgressState(bankId: string, bankVersion: string): LessonProgressState {
  return { bankId, bankVersion, progressById: {}, lessonPanelEvents: [], persistenceBlocked: false, warning: '', found: false };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && timestampPattern.test(value) && Number.isFinite(Date.parse(value));
}
function declaredVersionNumber(value: string): number | undefined {
  const match = value.match(/(?:^|[-_])v(\d+)(?:[-_]|$)/i) ?? value.match(/^v(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}
function nowTimestamp() { return new Date().toISOString(); }
function answerType(question: BankQuestion): 'math' | 'text' | 'choice' {
  return question.answerType ?? (question.mode === 'text' ? 'text' : 'math');
}
function validMathSteps(question: BankQuestion, value: unknown) {
  if (!record(value) || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 40) return undefined;
  try {
    const firstId = record(value.steps[0]) && typeof value.steps[0].id === 'string' ? value.steps[0].id : 'invalid-step';
    const restored = validateSession({
      version: 2,
      doc: {
        exercises: [{ id: 'lesson-check-response', source: question.source, mode: 'math', bankQuestionId: question.id, steps: value.steps }],
        exerciseId: 'lesson-check-response',
        cursor: { stepId: firstId, nodeId: 'missing-node', sequenceId: null, index: 0, offset: 0, selected: null },
      },
    });
    return restored.doc.exercises[0].steps;
  } catch { return undefined; }
}

function normalizeProgress(value: unknown, lesson: Lesson, questionById: Map<string, BankQuestion>): LessonProgress | undefined {
  if (!record(value) || value.lessonId !== lesson.id || typeof value.status !== 'string' || !statuses.has(value.status as LessonStatus)) return undefined;
  if (value.summaryOpen !== undefined && typeof value.summaryOpen !== 'boolean') return undefined;
  const index = value.currentConceptIndex;
  if (!Number.isInteger(index) || (lesson.concepts.length === 0 ? index !== 0 : (index as number) < 0 || (index as number) >= lesson.concepts.length)) return undefined;
  const sections = buildLessonSections(lesson);
  const currentConceptId = lesson.concepts[index as number]?.id;
  const derivedSectionIndex = Math.max(0, sections.findIndex(section => section.concepts.some(entry => entry.concept.id === currentConceptId)));
  const sectionIndex = value.currentSectionIndex === undefined ? derivedSectionIndex : value.currentSectionIndex;
  if (!Number.isInteger(sectionIndex) || (sections.length === 0 ? sectionIndex !== 0 : (sectionIndex as number) < 0 || (sectionIndex as number) >= sections.length)) return undefined;
  const sectionIds = new Set(sections.map(section => section.id));
  if (value.completedSectionIds !== undefined && (!Array.isArray(value.completedSectionIds) || !value.completedSectionIds.every((id): id is string => typeof id === 'string' && sectionIds.has(id)))) return undefined;
  if (value.activePracticeSectionId !== undefined && (typeof value.activePracticeSectionId !== 'string' || !sectionIds.has(value.activePracticeSectionId))) return undefined;
  const practiceQuestionIds = new Set([...questionById.values()].filter(question => question.lessonId === lesson.id && question.stage !== 'learn').map(question => question.id));
  for (const field of ['completedPracticeQuestionIds', 'activePracticeQuestionIds'] as const) {
    const ids = value[field];
    const max = field === 'activePracticeQuestionIds' ? 100 : practiceQuestionIds.size;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > max || !ids.every((id): id is string => typeof id === 'string' && practiceQuestionIds.has(id)))) return undefined;
  }
  if (Array.isArray(value.activePracticeQuestionIds) && value.activePracticeQuestionIds.some(id => (value.completedPracticeQuestionIds as unknown[] | undefined)?.includes(id))) return undefined;
  const conceptIds = new Set(lesson.concepts.map(concept => concept.id));
  if (value.activePracticeConceptId !== undefined && (typeof value.activePracticeConceptId !== 'string' || !conceptIds.has(value.activePracticeConceptId))) return undefined;
  const checkIds = new Set(lesson.concepts.flatMap(concept => concept.checkQuestionIds));
  const learningChunks = lesson.concepts.flatMap(concept => concept.learningChunks ?? []);
  const chunkIds = new Set(learningChunks.map(chunk => chunk.id));
  const practiceResultsAllowed = new Set([...practiceQuestionIds]);
  const exampleKeys = new Set<string>();
  lesson.concepts.forEach(concept => concept.blocks.forEach((block, blockIndex) => {
    if (block.type === 'example') exampleKeys.add(`ex:${concept.id}:${blockIndex}`);
  }));
  if (!Array.isArray(value.completedConceptIds) || !Array.isArray(value.answeredCheckIds) || !Array.isArray(value.skippedChecks) || !record(value.revealedSteps)) return undefined;
  if (!value.completedConceptIds.every((id): id is string => typeof id === 'string' && conceptIds.has(id)) || !value.answeredCheckIds.every((id): id is string => typeof id === 'string' && checkIds.has(id))) return undefined;
  const completedConceptIds = value.completedConceptIds as string[];
  const answeredCheckIds = value.answeredCheckIds as string[];
  const skippedChecks: LessonProgress['skippedChecks'] = [];
  for (const item of value.skippedChecks) {
    if (!record(item) || typeof item.questionId !== 'string' || !checkIds.has(item.questionId) || !timestamp(item.at)) return undefined;
    skippedChecks.push({ questionId: item.questionId, at: item.at });
  }
  if (answeredCheckIds.some(id => skippedChecks.some(item => item.questionId === id))) return undefined;
  const checkAnswers: Record<string, LessonCheckAnswer> = {};
  if (value.checkAnswers !== undefined) {
    if (!record(value.checkAnswers)) return undefined;
    for (const [questionId, response] of Object.entries(value.checkAnswers)) {
      const question = questionById.get(questionId);
      if (!question || !checkIds.has(questionId) || !record(response) || typeof response.type !== 'string') return undefined;
      const expected = answerType(question);
      if (expected === 'math' && response.type === 'math') {
        const steps = validMathSteps(question, response);
        if (!steps) return undefined;
        checkAnswers[questionId] = { type: 'math', steps };
      } else if (expected === 'text' && response.type === 'text' && typeof response.value === 'string' && response.value.length <= 4000) {
        checkAnswers[questionId] = { type: 'text', value: response.value };
      } else if (expected === 'choice' && response.type === 'choice' && typeof response.value === 'string' && question.choices?.includes(response.value)) {
        checkAnswers[questionId] = { type: 'choice', value: response.value };
      } else return undefined;
    }
  }
  if (answeredCheckIds.some(id => !Object.hasOwn(checkAnswers, id))) return undefined;

  const completedLearningChunkIds: string[] = [];
  if (value.completedLearningChunkIds !== undefined) {
    if (!Array.isArray(value.completedLearningChunkIds) || !value.completedLearningChunkIds.every((id): id is string => typeof id === 'string' && chunkIds.has(id))) return undefined;
    completedLearningChunkIds.push(...new Set(value.completedLearningChunkIds));
  }
  if (value.currentChunkId !== undefined && (typeof value.currentChunkId !== 'string' || !chunkIds.has(value.currentChunkId))) return undefined;
  if (value.activeConceptPhase !== undefined && !['reading', 'solving', 'summary'].includes(String(value.activeConceptPhase))) return undefined;
  if (value.conceptSummaryId !== undefined && (typeof value.conceptSummaryId !== 'string' || !conceptIds.has(value.conceptSummaryId))) return undefined;

  const chunkAnswers: Record<string, LessonChunkAnswer> = {};
  if (value.chunkAnswers !== undefined) {
    if (!record(value.chunkAnswers)) return undefined;
    const allowedChunkQuestions = new Set(learningChunks.flatMap(chunk => chunk.questionIds));
    for (const [questionId, rawAnswer] of Object.entries(value.chunkAnswers)) {
      if (!allowedChunkQuestions.has(questionId) || !record(rawAnswer) || typeof rawAnswer.value !== 'string' || rawAnswer.value.length > 4000 || !timestamp(rawAnswer.updatedAt)
        || (rawAnswer.submittedAt !== undefined && !timestamp(rawAnswer.submittedAt))) return undefined;
      chunkAnswers[questionId] = { value: rawAnswer.value, updatedAt: rawAnswer.updatedAt, ...(timestamp(rawAnswer.submittedAt) ? { submittedAt: rawAnswer.submittedAt } : {}) };
    }
  }

  const exampleAttempts: Record<string, LessonExampleAttempt> = {};
  if (value.exampleAttempts !== undefined) {
    if (!record(value.exampleAttempts)) return undefined;
    for (const [key, rawAttempt] of Object.entries(value.exampleAttempts)) {
      if (!exampleKeys.has(key) || !record(rawAttempt) || !timestamp(rawAttempt.attemptedAt) || (rawAttempt.comparedAt !== undefined && !timestamp(rawAttempt.comparedAt))) return undefined;
      exampleAttempts[key] = { attemptedAt: rawAttempt.attemptedAt, ...(timestamp(rawAttempt.comparedAt) ? { comparedAt: rawAttempt.comparedAt } : {}) };
    }
  }

  const practiceResults: Record<string, LessonPracticeResult> = {};
  if (value.practiceResults !== undefined) {
    if (!record(value.practiceResults)) return undefined;
    for (const [questionId, rawResult] of Object.entries(value.practiceResults)) {
      if (!practiceResultsAllowed.has(questionId) || !record(rawResult)
        || !['not_started', 'draft', 'answered', 'skipped'].includes(String(rawResult.status))
        || !Array.isArray(rawResult.steps) || rawResult.steps.length > 40
        || !rawResult.steps.every(step => record(step) && typeof step.latex === 'string' && step.latex.length <= 20000 && typeof step.final === 'boolean')
        || !timestamp(rawResult.updatedAt)
        || (rawResult.answer !== undefined && (typeof rawResult.answer !== 'string' || rawResult.answer.length > 4000))
        || (rawResult.startedAt !== undefined && !timestamp(rawResult.startedAt))
        || (rawResult.submittedAt !== undefined && !timestamp(rawResult.submittedAt))) return undefined;
      practiceResults[questionId] = {
        status: rawResult.status as LessonPracticeResult['status'],
        ...(typeof rawResult.answer === 'string' ? { answer: rawResult.answer } : {}),
        steps: rawResult.steps.map(step => ({ latex: (step as { latex: string }).latex, final: (step as { final: boolean }).final })),
        ...(timestamp(rawResult.startedAt) ? { startedAt: rawResult.startedAt } : {}),
        updatedAt: rawResult.updatedAt,
        ...(timestamp(rawResult.submittedAt) ? { submittedAt: rawResult.submittedAt } : {}),
      };
    }
  }
  const confidenceByCheckId: Record<string, 1 | 2 | 3 | 4 | 5> = {};
  if (value.confidenceByCheckId !== undefined) {
    if (!record(value.confidenceByCheckId)) return undefined;
    for (const [questionId, confidence] of Object.entries(value.confidenceByCheckId)) {
      if (!checkIds.has(questionId) || !Number.isInteger(confidence) || (confidence as number) < 1 || (confidence as number) > 5) return undefined;
      confidenceByCheckId[questionId] = confidence as 1 | 2 | 3 | 4 | 5;
    }
  }
  const exampleSteps = new Map<string, number>();
  lesson.concepts.forEach(concept => concept.blocks.forEach((block, blockIndex) => {
    if (block.type === 'example') exampleSteps.set(`${concept.id}:${blockIndex}`, block.steps.length);
  }));
  const revealedSteps: Record<string, number> = {};
  for (const [key, revealed] of Object.entries(value.revealedSteps)) {
    const max = exampleSteps.get(key);
    if (max === undefined || !Number.isInteger(revealed) || (revealed as number) < 0 || (revealed as number) > max) return undefined;
    revealedSteps[key] = revealed as number;
  }
  const progress: LessonProgress = {
    lessonId: lesson.id,
    status: value.status as LessonStatus,
    currentConceptIndex: index as number,
    currentSectionIndex: sectionIndex as number,
    completedSectionIds: [...new Set((value.completedSectionIds ?? []) as string[])],
    ...(typeof value.activePracticeSectionId === 'string' ? { activePracticeSectionId: value.activePracticeSectionId } : {}),
    ...(typeof value.activePracticeConceptId === 'string' ? { activePracticeConceptId: value.activePracticeConceptId } : {}),
    ...(Array.isArray(value.completedPracticeQuestionIds) ? { completedPracticeQuestionIds: [...new Set(value.completedPracticeQuestionIds as string[])] } : {}),
    ...(Array.isArray(value.activePracticeQuestionIds) ? { activePracticeQuestionIds: [...new Set(value.activePracticeQuestionIds as string[])] } : {}),
    completedConceptIds: [...new Set(completedConceptIds)],
    answeredCheckIds: [...new Set(answeredCheckIds)],
    skippedChecks,
    ...(value.currentChunkId !== undefined ? { currentChunkId: value.currentChunkId as string } : {}),
    ...(completedLearningChunkIds.length ? { completedLearningChunkIds } : {}),
    ...(value.activeConceptPhase !== undefined ? { activeConceptPhase: value.activeConceptPhase as LessonProgress['activeConceptPhase'] } : {}),
    ...(typeof value.conceptSummaryId === 'string' ? { conceptSummaryId: value.conceptSummaryId } : {}),
    ...(Object.keys(chunkAnswers).length ? { chunkAnswers } : {}),
    ...(Object.keys(exampleAttempts).length ? { exampleAttempts } : {}),
    ...(Object.keys(practiceResults).length ? { practiceResults } : {}),
    ...(typeof value.summaryOpen === 'boolean' ? { summaryOpen: value.summaryOpen } : {}),
    ...(Object.keys(checkAnswers).length ? { checkAnswers } : {}),
    ...(Object.keys(confidenceByCheckId).length ? { confidenceByCheckId } : {}),
    revealedSteps,
  };
  const workAnswers = normalizeWorkAnswers(value.workAnswers, allowedWorkKeys(lesson, [...questionById.values()]), (key, response) => validMathSteps({ id: key.replace(/[^\w.-]/g, '_').slice(0, 80), mode: 'math', source: '' }, response));
  if (workAnswers) progress.workAnswers = workAnswers;
  for (const field of ['learnStartedAt', 'learnDoneAt', 'practiceStartedAt'] as const) {
    if (value[field] !== undefined) {
      if (!timestamp(value[field])) return undefined;
      progress[field] = value[field];
    }
  }
  if (value.learnSkipped !== undefined) {
    if (!record(value.learnSkipped) || !timestamp(value.learnSkipped.at)) return undefined;
    progress.learnSkipped = { at: value.learnSkipped.at };
  }
  return progress;
}

function validPanelEvent(value: unknown, bank: DriveBank): value is LessonPanelEvent {
  if (!record(value) || typeof value.questionId !== 'string' || !timestamp(value.openedAt) || !timestamp(value.closedAt)) return false;
  const question = bank.questions.find(item => item.id === value.questionId);
  return !!question && question.stage !== 'learn' && !!question.lessonId && Date.parse(value.closedAt) >= Date.parse(value.openedAt);
}
function validActivePanel(value: unknown, bank: DriveBank): value is ActiveLessonPanel {
  if (!record(value) || typeof value.questionId !== 'string' || !timestamp(value.openedAt)) return false;
  const question = bank.questions.find(item => item.id === value.questionId);
  return !!question && question.stage !== 'learn' && !!question.lessonId;
}

function availableStorage(storage?: Storage): Storage | null {
  try { return storage ?? globalThis.localStorage; } catch { return null; }
}

export function readLessonProgress(bank: DriveBank, bankVersion: string, storage?: Storage, now = nowTimestamp()): LessonProgressState {
  const state = emptyLessonProgressState(bank.bank_id, bankVersion);
  const target = availableStorage(storage);
  if (!target) return { ...state, persistenceBlocked: true, warning: 'Learn progress storage is unavailable. Progress will remain in memory until this page closes.' };
  let raw: string | null;
  try { raw = target.getItem(lessonProgressStorageKey(bank.bank_id, bankVersion)); }
  catch { return { ...state, persistenceBlocked: true, warning: 'Learn progress could not be read. Existing data was left untouched; new progress will remain in memory.' }; }
  if (raw === null) return migratePreviousProgress(bank, bankVersion, target, now) ?? state;
  state.found = true;
  if (raw.length > MAX_RECORD_LENGTH) return { ...state, persistenceBlocked: true, warning: 'Saved Learn progress is too large to validate. It was left untouched; this lesson starts fresh in memory.' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { ...state, persistenceBlocked: true, warning: 'Saved Learn progress is invalid. It was left untouched; this lesson starts fresh in memory.' }; }
  if (!record(parsed) || parsed.schemaVersion !== LESSON_PROGRESS_SCHEMA || parsed.bankId !== bank.bank_id || parsed.bankVersion !== bankVersion || !record(parsed.lessons) || !Array.isArray(parsed.lessonPanelEvents)) {
    return { ...state, persistenceBlocked: true, warning: 'Saved Learn progress belongs to another bank version or format. It was left untouched; this lesson starts fresh in memory.' };
  }
  const lessons = new Map((bank.lessons ?? []).map(lesson => [lesson.id, lesson]));
  const questions = new Map(bank.questions.map(question => [question.id, question]));
  let degraded = false;
  for (const [lessonId, rawProgress] of Object.entries(parsed.lessons)) {
    const lesson = lessons.get(lessonId);
    if (!lesson) { degraded = true; continue; }
    const progress = normalizeProgress(rawProgress, lesson, questions);
    if (progress) state.progressById[lessonId] = progress;
    else degraded = true;
  }
  state.lessonPanelEvents = parsed.lessonPanelEvents.filter(event => validPanelEvent(event, bank));
  if (state.lessonPanelEvents.length !== parsed.lessonPanelEvents.length) degraded = true;
  if (parsed.activePanel !== undefined) {
    if (validActivePanel(parsed.activePanel, bank)) {
      state.activePanelEvent = { questionId: parsed.activePanel.questionId, openedAt: parsed.activePanel.openedAt };
      state.lessonPanelEvents.push({ ...state.activePanelEvent, closedAt: now });
      state.activePanelEvent = undefined;
    } else degraded = true;
  }
  if (degraded) {
    state.persistenceBlocked = true;
    state.warning = 'Some saved Learn progress is stale or invalid. Valid progress was restored; the saved record was left untouched.';
  } else if (parsed.activePanel !== undefined) {
    const result = saveLessonProgress(bank, bankVersion, state, target);
    if (!result.saved) state.warning = result.message;
  }
  return state;
}

export function saveLessonProgress(bank: DriveBank, bankVersion: string, state: LessonProgressState, storage?: Storage): { saved: boolean; message: string } {
  if (state.persistenceBlocked) return { saved: false, message: state.warning || 'Saved Learn progress is protected and was not overwritten.' };
  const target = availableStorage(storage);
  if (!target) return { saved: false, message: 'Learn progress could not be saved; it remains available only until this page closes.' };
  const lessons: Record<string, LessonProgress> = {};
  const lessonById = new Map((bank.lessons ?? []).map(lesson => [lesson.id, lesson]));
  const questionById = new Map(bank.questions.map(question => [question.id, question]));
  for (const [lessonId, progress] of Object.entries(state.progressById)) {
    const lesson = lessonById.get(lessonId);
    const normalized = lesson && normalizeProgress(progress, lesson, questionById);
    if (!normalized) return { saved: false, message: 'Learn progress could not be validated and was not written.' };
    lessons[lessonId] = normalized;
  }
  const events = state.lessonPanelEvents.filter(event => validPanelEvent(event, bank));
  if (events.length !== state.lessonPanelEvents.length || (state.activePanelEvent && !validActivePanel(state.activePanelEvent, bank))) {
    return { saved: false, message: 'Lesson reference history could not be validated and was not written.' };
  }
  const payload = {
    schemaVersion: LESSON_PROGRESS_SCHEMA,
    bankId: bank.bank_id,
    bankVersion,
    updatedAt: nowTimestamp(),
    lessons,
    lessonPanelEvents: events,
    ...(state.activePanelEvent ? { activePanel: state.activePanelEvent } : {}),
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_RECORD_LENGTH) return { saved: false, message: 'Learn progress is too large to save; it remains available in memory.' };
  try {
    const key = lessonProgressStorageKey(bank.bank_id, bankVersion);
    target.setItem(key, serialized);
    if (target.getItem(key) !== serialized) throw Error('Storage did not preserve the saved value.');
    return { saved: true, message: '' };
  } catch {
    return { saved: false, message: 'Learn progress could not be saved; it remains available only until this page closes.' };
  }
}

/** Copy stable progress into a revised bank version while retaining every older record. */
function migratePreviousProgress(bank: DriveBank, bankVersion: string, storage: Storage, now: string): LessonProgressState | undefined {
  const prefix = `${LESSON_PROGRESS_PREFIX}:${encodeURIComponent(bank.bank_id)}:`;
  const currentKey = lessonProgressStorageKey(bank.bank_id, bankVersion);
  const candidates: Array<{ key: string; version: string; updatedAt: string }> = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix) || key === currentKey) continue;
      const raw = storage.getItem(key);
      if (!raw || raw.length > MAX_RECORD_LENGTH) continue;
      const value: unknown = JSON.parse(raw);
      if (!record(value) || value.schemaVersion !== LESSON_PROGRESS_SCHEMA || value.bankId !== bank.bank_id || typeof value.bankVersion !== 'string' || value.bankVersion === bankVersion) continue;
      candidates.push({ key, version: value.bankVersion, updatedAt: timestamp(value.updatedAt) ? value.updatedAt : '' });
    }
  } catch { return undefined; }
  candidates.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  for (const candidate of candidates) {
    const currentVersionNumber = declaredVersionNumber(bank.version);
    const previousVersionNumber = declaredVersionNumber(candidate.version);
    if (currentVersionNumber === undefined || previousVersionNumber === undefined || currentVersionNumber <= previousVersionNumber) continue;
    const previous = readLessonProgress(bank, candidate.version, storage, now);
    if (previous.persistenceBlocked || (!Object.keys(previous.progressById).length && !previous.lessonPanelEvents.length)) continue;
    const migrated: LessonProgressState = { ...previous, bankVersion, found: true };
    const result = saveLessonProgress(bank, bankVersion, migrated, storage);
    if (result.saved) return migrated;
  }
  return undefined;
}

function exportableProgress(value: unknown): LessonProgressExport | undefined {
  if (!record(value) || typeof value.lessonId !== 'string' || !safeId.test(value.lessonId) || typeof value.status !== 'string' || !statuses.has(value.status as LessonStatus)) return undefined;
  if (!Array.isArray(value.completedConceptIds) || !Array.isArray(value.skippedChecks)) return undefined;
  const completedConceptIds = value.completedConceptIds.filter((id): id is string => typeof id === 'string' && safeId.test(id));
  const skippedChecks = value.skippedChecks.flatMap(item => record(item) && typeof item.questionId === 'string' && safeId.test(item.questionId) && timestamp(item.at) ? [{ questionId: item.questionId, at: item.at }] : []);
  const result: LessonProgressExport = { lessonId: value.lessonId, status: value.status as LessonStatus, completedConceptIds: [...new Set(completedConceptIds)], skippedChecks };
  if (Number.isInteger(value.currentSectionIndex) && (value.currentSectionIndex as number) >= 0) result.currentSectionIndex = value.currentSectionIndex as number;
  if (Array.isArray(value.completedSectionIds)) result.completedSectionIds = [...new Set(value.completedSectionIds.filter((id): id is string => typeof id === 'string' && safeId.test(id)))];
  for (const field of ['learnStartedAt', 'learnDoneAt', 'practiceStartedAt'] as const) if (timestamp(value[field])) result[field] = value[field];
  if (record(value.learnSkipped) && timestamp(value.learnSkipped.at)) result.learnSkipped = { at: value.learnSkipped.at };
  return result;
}

/** Reads only the export-safe progress fields; Learn check responses never leave the separate store. */
export function readLessonExportData(bankId: string, bankVersion: string, storage?: Storage): { found: boolean; data?: LessonExportData } {
  const target = availableStorage(storage);
  if (!target) return { found: false };
  try {
    const raw = target.getItem(lessonProgressStorageKey(bankId, bankVersion));
    if (!raw || raw.length > MAX_RECORD_LENGTH) return { found: false };
    const parsed: unknown = JSON.parse(raw);
    if (!record(parsed) || parsed.schemaVersion !== LESSON_PROGRESS_SCHEMA || parsed.bankId !== bankId || parsed.bankVersion !== bankVersion || !record(parsed.lessons) || !Array.isArray(parsed.lessonPanelEvents)) return { found: false };
    const lessonProgress = Object.values(parsed.lessons).map(exportableProgress).filter((progress): progress is LessonProgressExport => !!progress);
    const lessonPanelEvents = parsed.lessonPanelEvents.filter(event => record(event) && typeof event.questionId === 'string' && safeId.test(event.questionId) && timestamp(event.openedAt) && timestamp(event.closedAt) && Date.parse(event.closedAt) >= Date.parse(event.openedAt)) as LessonPanelEvent[];
    return { found: true, data: { lessonProgress, lessonPanelEvents } };
  } catch { return { found: false }; }
}

export function lessonExportDataFromState(state: LessonProgressState): LessonExportData {
  return {
    lessonProgress: Object.values(state.progressById).map(exportableProgress).filter((progress): progress is LessonProgressExport => !!progress),
    lessonPanelEvents: state.lessonPanelEvents.map(event => ({ ...event })),
  };
}
