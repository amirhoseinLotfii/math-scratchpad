import type { BankQuestion, DriveBank } from '../../../domain/entities/drive-bank.types';
import { validateSession } from '../../session/persistence/session-validator';
import { buildLessonSections } from '../lesson-sections';
import { allowedWorkKeys, normalizeWorkAnswers, questionWorkKey } from '../lesson-work-items';
import { lessonCheckAnswerComplete, type Lesson, type LessonCheckAnswer, type LessonProgress, type LessonStatus } from '../types';
import { isRecord, isTimestamp, statuses, type ActiveLessonPanel, type LessonPanelEvent } from './progress-types';

function answerType(question: BankQuestion): NonNullable<BankQuestion['answerType']> {
  return question.answerType ?? (question.mode === 'text' ? 'text' : 'math');
}

export function validMathSteps(question: Pick<BankQuestion, 'id' | 'source'>, value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 40) return undefined;
  try {
    const firstId = isRecord(value.steps[0]) && typeof value.steps[0].id === 'string' ? value.steps[0].id : 'invalid-step';
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

export function normalizeProgress(value: unknown, lesson: Lesson, questionById: Map<string, BankQuestion>): LessonProgress | undefined {
  if (!isRecord(value) || value.lessonId !== lesson.id || typeof value.status !== 'string' || !statuses.has(value.status as LessonStatus)) return undefined;
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
  const checkIds = new Set(lesson.concepts.flatMap(concept => concept.checkQuestionIds));
  if (!Array.isArray(value.completedConceptIds) || !Array.isArray(value.answeredCheckIds) || !Array.isArray(value.skippedChecks) || !isRecord(value.revealedSteps)) return undefined;
  if (!value.completedConceptIds.every((id): id is string => typeof id === 'string' && conceptIds.has(id)) || !value.answeredCheckIds.every((id): id is string => typeof id === 'string' && checkIds.has(id))) return undefined;
  const completedConceptIds = value.completedConceptIds as string[];
  const answeredCheckIds = value.answeredCheckIds as string[];
  const skippedChecks: LessonProgress['skippedChecks'] = [];
  for (const item of value.skippedChecks) {
    if (!isRecord(item) || typeof item.questionId !== 'string' || !checkIds.has(item.questionId) || !isTimestamp(item.at)) return undefined;
    skippedChecks.push({ questionId: item.questionId, at: item.at });
  }
  if (answeredCheckIds.some(id => skippedChecks.some(item => item.questionId === id))) return undefined;
  const checkAnswers: Record<string, LessonCheckAnswer> = {};
  if (value.checkAnswers !== undefined) {
    if (!isRecord(value.checkAnswers)) return undefined;
    for (const [questionId, response] of Object.entries(value.checkAnswers)) {
      const question = questionById.get(questionId);
      if (!question || !checkIds.has(questionId) || !isRecord(response) || typeof response.type !== 'string') return undefined;
      const expected = answerType(question);
      if (expected === 'math' && response.type === 'math') {
        const steps = validMathSteps(question, response);
        if (!steps) return undefined;
        checkAnswers[questionId] = { type: 'math', steps };
      } else if (expected === 'text' && response.type === 'text' && typeof response.value === 'string' && response.value.length <= 4000) {
        checkAnswers[questionId] = { type: 'text', value: response.value };
      } else if (expected === 'choice' && response.type === 'choice' && typeof response.value === 'string' && question.choices?.includes(response.value)) {
        checkAnswers[questionId] = { type: 'choice', value: response.value };
      } else if (expected === 'find_mistake' && response.type === 'find_mistake' && typeof response.value === 'string' && response.value.length <= 4000) {
        checkAnswers[questionId] = { type: 'find_mistake', value: response.value };
      } else if (expected === 'true_false_why' && response.type === 'true_false_why'
        && (response.choice === undefined || response.choice === 'true' || response.choice === 'false')
        && typeof response.reason === 'string' && response.reason.length <= 4000) {
        checkAnswers[questionId] = { type: 'true_false_why', ...(response.choice ? { choice: response.choice } : {}), reason: response.reason };
      } else return undefined;
    }
  }
  if (answeredCheckIds.some(id => !lessonCheckAnswerComplete(checkAnswers[id]))) return undefined;
  const confidenceByCheckId: Record<string, 1 | 2 | 3 | 4 | 5> = {};
  if (value.confidenceByCheckId !== undefined) {
    if (!isRecord(value.confidenceByCheckId)) return undefined;
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
    ...(Array.isArray(value.completedPracticeQuestionIds) ? { completedPracticeQuestionIds: [...new Set(value.completedPracticeQuestionIds as string[])] } : {}),
    ...(Array.isArray(value.activePracticeQuestionIds) ? { activePracticeQuestionIds: [...new Set(value.activePracticeQuestionIds as string[])] } : {}),
    completedConceptIds: [...new Set(completedConceptIds)],
    answeredCheckIds: [...new Set(answeredCheckIds)],
    skippedChecks,
    ...(typeof value.summaryOpen === 'boolean' ? { summaryOpen: value.summaryOpen } : {}),
    ...(Object.keys(checkAnswers).length ? { checkAnswers } : {}),
    ...(Object.keys(confidenceByCheckId).length ? { confidenceByCheckId } : {}),
    revealedSteps,
  };
  const workQuestions = new Map([...questionById.values()]
    .filter(question => question.lessonId === lesson.id && question.stage !== 'learn')
    .map(question => [questionWorkKey(question.id), question]));
  const workAnswers = normalizeWorkAnswers(
    value.workAnswers,
    allowedWorkKeys(lesson, [...questionById.values()]),
    (key, response) => validMathSteps({ id: key.replace(/[^\w.-]/g, '_').slice(0, 80), source: '' }, response),
    key => workQuestions.get(key),
  );
  if (workAnswers) progress.workAnswers = workAnswers;
  for (const field of ['learnStartedAt', 'learnDoneAt', 'practiceStartedAt'] as const) {
    if (value[field] !== undefined) {
      if (!isTimestamp(value[field])) return undefined;
      progress[field] = value[field];
    }
  }
  if (value.learnSkipped !== undefined) {
    if (!isRecord(value.learnSkipped) || !isTimestamp(value.learnSkipped.at)) return undefined;
    progress.learnSkipped = { at: value.learnSkipped.at };
  }
  return progress;
}

export function validPanelEvent(value: unknown, bank: DriveBank): value is LessonPanelEvent {
  if (!isRecord(value) || typeof value.questionId !== 'string' || !isTimestamp(value.openedAt) || !isTimestamp(value.closedAt)) return false;
  const question = bank.questions.find(item => item.id === value.questionId);
  return !!question && question.stage !== 'learn' && !!question.lessonId && Date.parse(value.closedAt) >= Date.parse(value.openedAt);
}

export function validActivePanel(value: unknown, bank: DriveBank): value is ActiveLessonPanel {
  if (!isRecord(value) || typeof value.questionId !== 'string' || !isTimestamp(value.openedAt)) return false;
  const question = bank.questions.find(item => item.id === value.questionId);
  return !!question && question.stage !== 'learn' && !!question.lessonId;
}
