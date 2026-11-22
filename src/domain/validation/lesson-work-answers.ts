import type { AnswerType, BankQuestion } from '../entities/drive-bank.types';
import type { LessonWorkAnswer, LessonWorkAnswers } from '../entities/lesson-progress.types';
import type { Lesson } from '../entities/lesson.types';
import type { Step } from '../entities/math-document.types';
import { stepIsBlank } from '../math/math-ast';

export function exampleWorkKey(conceptId: string, blockIndex: number) { return `ex:${conceptId}:${blockIndex}`; }
export function questionWorkKey(questionId: string) { return `q:${questionId}`; }

/** Valid storage keys for work in one lesson: example/guided blocks of its concepts and its practice questions. */
export function allowedWorkKeys(lesson: Lesson, questions: BankQuestion[]): Set<string> {
  const keys = new Set<string>();
  lesson.concepts.forEach(concept => concept.blocks.forEach((block, index) => {
    if (block.type === 'example' || block.type === 'note') keys.add(exampleWorkKey(concept.id, index));
  }));
  for (const question of questions) if (question.lessonId === lesson.id && question.stage !== 'learn') keys.add(questionWorkKey(question.id));
  return keys;
}

/**
 * Restores saved work tolerantly: unknown or invalid entries are dropped one by one so older or
 * damaged work can never invalidate the rest of the lesson progress.
 */
export function normalizeWorkAnswers(
  value: unknown,
  allowed: Set<string>,
  validSteps: (key: string, response: unknown) => Step[] | undefined,
  questionForKey?: (key: string) => Pick<BankQuestion, 'answerType' | 'mode' | 'choices'> | undefined,
): LessonWorkAnswers | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: LessonWorkAnswers = {};
  for (const [key, response] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key) || !response || typeof response !== 'object' || Array.isArray(response)) continue;
    const raw = response as Record<string, unknown>;
    const question = questionForKey?.(key);
    const expected: AnswerType = question?.answerType ?? (question?.mode === 'text' ? 'text' : 'math');
    const legacyRaw = raw.legacyMathSteps;
    const legacyMathSteps = legacyRaw === undefined ? undefined : validSteps(key, { steps: legacyRaw });
    if (legacyRaw !== undefined && !legacyMathSteps) continue;
    const withLegacy = <T extends LessonWorkAnswer>(answer: T): T => legacyMathSteps ? { ...answer, legacyMathSteps } : answer;
    if (raw.type === 'math') {
      const steps = validSteps(key, response);
      if (!steps) continue;
      if (expected === 'math') result[key] = { type: 'math', steps };
      else {
        const legacy = legacyMathSteps ?? steps;
        if (!legacy.some(step => !stepIsBlank(step))) continue;
        result[key] = expected === 'true_false_why'
          ? { type: 'true_false_why', reason: '', legacyMathSteps: legacy }
          : { type: expected, value: '', legacyMathSteps: legacy };
      }
      continue;
    }
    if (raw.type !== expected) continue;
    if ((expected === 'text' || expected === 'find_mistake' || expected === 'choice')
      && typeof raw.value === 'string' && raw.value.length <= 4000
      && (expected !== 'choice' || question?.choices?.includes(raw.value))) {
      result[key] = withLegacy({ type: expected, value: raw.value });
    } else if (expected === 'true_false_why' && (raw.choice === undefined || raw.choice === 'true' || raw.choice === 'false')
      && typeof raw.reason === 'string' && raw.reason.length <= 4000) {
      result[key] = withLegacy({ type: 'true_false_why', ...(raw.choice ? { choice: raw.choice } : {}), reason: raw.reason });
    }
  }
  return Object.keys(result).length ? result : undefined;
}

export function workAnswerHasContent(answer: LessonWorkAnswer | undefined): boolean {
  if (!answer) return false;
  return workAnswerHasCurrentContent(answer) || !!answer.legacyMathSteps?.some(step => !stepIsBlank(step));
}

export function workAnswerHasCurrentContent(answer: LessonWorkAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.type === 'math'
    ? answer.steps.some(step => !stepIsBlank(step))
    : answer.type === 'true_false_why'
      ? !!answer.choice || !!answer.reason.trim()
      : !!answer.value.trim();
}
