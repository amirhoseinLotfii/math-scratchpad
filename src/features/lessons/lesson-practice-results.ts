import { stepIsBlank, stepLatex, type Exercise } from '../../model';
import { questionStatus } from '../workspace/model/workspace-layout';
import type { LessonPracticeResult } from './types';

/** Snapshot answers from the existing session editor without inventing correctness. */
export function snapshotLessonPracticeResults(
  exercises: Exercise[],
  questionIds: string[],
  previous: Record<string, LessonPracticeResult> = {},
  now = new Date().toISOString(),
): Record<string, LessonPracticeResult> {
  const byQuestionId = new Map(exercises.flatMap(exercise => exercise.bankQuestionId ? [[exercise.bankQuestionId, exercise] as const] : []));
  const next = { ...previous };
  for (const questionId of questionIds) {
    const exercise = byQuestionId.get(questionId);
    if (!exercise) continue;
    const status = exercise.skipped ? 'skipped'
      : questionStatus(exercise) === 'Answered' ? 'answered'
        : exercise.steps.some(step => !stepIsBlank(step)) || !!exercise.answerText?.trim() ? 'draft'
          : 'not_started';
    const steps = exercise.steps.map(step => ({ latex: stepLatex(step), final: step.final }));
    const candidate: LessonPracticeResult = {
      status,
      ...(exercise.answerText !== undefined ? { answer: exercise.answerText } : {}),
      steps,
      ...(exercise.startedAt ? { startedAt: exercise.startedAt } : {}),
      updatedAt: now,
      ...(exercise.submittedAt && status === 'answered' ? { submittedAt: exercise.submittedAt } : {}),
    };
    const old = previous[questionId];
    const unchanged = old && old.status === candidate.status && old.answer === candidate.answer
      && old.startedAt === candidate.startedAt && old.submittedAt === candidate.submittedAt
      && old.steps.length === candidate.steps.length
      && old.steps.every((step, index) => step.latex === candidate.steps[index]?.latex && step.final === candidate.steps[index]?.final);
    next[questionId] = unchanged ? old : candidate;
  }
  return next;
}

/** Mixed runs only retain items the learner has touched; missing entries remain explicitly open. */
export function snapshotAttemptedPracticeResults(
  exercises: Exercise[],
  questionIds: string[],
  previous: Record<string, LessonPracticeResult> = {},
  now = new Date().toISOString(),
): Record<string, LessonPracticeResult> {
  const next = snapshotLessonPracticeResults(exercises, questionIds, previous, now);
  for (const questionId of questionIds) if (next[questionId]?.status === 'not_started') delete next[questionId];
  return next;
}
