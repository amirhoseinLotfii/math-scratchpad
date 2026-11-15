import { useCallback, useRef, useState } from 'react';
import type { BankQuestion } from '../drive-bank/drive-bank';
import { lessonCheckAnswerComplete, type LessonCheckAnswer, type LessonProgress } from './types';
import { type LessonSection } from './lesson-sections';
import { stepLatex } from '../../model';
import { emitLearnEvent } from '../../sync/events';

import type { RefObject, Dispatch, SetStateAction } from 'react';
import type { LessonEventContextFor, LessonProgressWriter } from './lesson-screen-types';
type Set<T> = Dispatch<SetStateAction<T>>;
type PendingEdits = RefObject<Map<string, ReturnType<typeof setTimeout>>>;

type Options = {
  progressRef: RefObject<LessonProgress>;
  commitProgress: LessonProgressWriter;
  currentSection?: LessonSection;
  makeEventContext: LessonEventContextFor;

  allQuestions: Map<string, BankQuestion>;
  checks: BankQuestion[];
  progress: LessonProgress;
  markSectionGateAttempt: (section: LessonSection | undefined, question?: BankQuestion) => void;
  nextAttemptNo: (id: string) => number;
  pendingAnswerEdits: PendingEdits;
};
export function useLessonGate({
  allQuestions,
  checks,
  currentSection,
  progress,
  progressRef,
  commitProgress,
  makeEventContext,
  markSectionGateAttempt,
  nextAttemptNo,
  pendingAnswerEdits,
}: Options) {
  const [skipQuestion, setSkipQuestion] = useState<BankQuestion | null>(null);
  const skipCheckInvoker = useRef<HTMLElement | null>(null);
  const gateFailedSections = useRef(new Set<string>());
  const isCheckComplete = useCallback(
    (questionId: string) =>
      progress.answeredCheckIds.includes(questionId) || progress.skippedChecks.some((item) => item.questionId === questionId),
    [progress.answeredCheckIds, progress.skippedChecks],
  );
  const conceptComplete = checks.every((question) => isCheckComplete(question.id));

  const setAnswer = useCallback(
    (questionId: string, value: LessonCheckAnswer | null) => {
      const answered = lessonCheckAnswerComplete(value ?? undefined);
      const before = progressRef.current;
      const question = allQuestions.get(questionId);
      const previousAnswer = before.checkAnswers?.[questionId];
      const currentSignature = JSON.stringify(value);
      const previousSignature = JSON.stringify(previousAnswer);
      const checkAnswers = { ...before.checkAnswers };
      if (value) checkAnswers[questionId] = value;
      else delete checkAnswers[questionId];
      const answeredCheckIds = answered
        ? [...new Set([...before.answeredCheckIds, questionId])]
        : before.answeredCheckIds.filter((id) => id !== questionId);
      const skippedChecks = value !== null ? before.skippedChecks.filter((item) => item.questionId !== questionId) : before.skippedChecks;
      commitProgress({
        ...before,
        answeredCheckIds,
        skippedChecks,
        ...(Object.keys(checkAnswers).length ? { checkAnswers } : { checkAnswers: undefined }),
      });
      if (!question || currentSignature === previousSignature) return;
      const context = makeEventContext(question);
      const steps = value?.type === 'math' ? value.steps.map((step) => stepLatex(step).slice(0, 4_000)).slice(0, 40) : undefined;
      const answerText =
        value?.type === 'math'
          ? (steps?.join('\n') ?? '')
          : value?.type === 'true_false_why'
            ? [value.choice ? (value.choice === 'true' ? 'True' : 'False') : '', value.reason].filter(Boolean).join(' — ')
            : (value?.value ?? '');
      const baseFields = {
        itemId: question.id,
        itemType:
          question.answerType === 'choice'
            ? ('mcq' as const)
            : question.answerType === 'true_false_why'
              ? ('true_false_why' as const)
              : question.answerType === 'find_mistake'
                ? ('find_mistake' as const)
                : question.answerType === 'text' || question.mode === 'text'
                  ? ('typed' as const)
                  : ('step_by_step' as const),
        questionText: (question.prompt || question.source).slice(0, 8_000),
        userAnswer: answerText.slice(0, 8_000),
        ...(steps ? { steps } : {}),
        verdict: 'submitted' as const,
        verdictSource: 'none' as const,
      };
      if (answered && !before.answeredCheckIds.includes(questionId)) {
        const attemptNo = nextAttemptNo(questionId);
        emitLearnEvent(context, { ...baseFields, type: 'check_answer', attemptNo });
        markSectionGateAttempt(currentSection, question);
      } else {
        const existing = pendingAnswerEdits.current.get(questionId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          pendingAnswerEdits.current.delete(questionId);
          emitLearnEvent(context, { ...baseFields, type: 'answer_edited', ...(answered ? {} : { note: 'Response cleared.' }) });
        }, 700);
        pendingAnswerEdits.current.set(questionId, timer);
      }
    },
    [allQuestions, commitProgress, currentSection, makeEventContext, markSectionGateAttempt, nextAttemptNo],
  );

  const setConfidence = useCallback(
    (questionId: string, value: 1 | 2 | 3 | 4 | 5) => {
      const before = progressRef.current;
      commitProgress({ ...before, confidenceByCheckId: { ...before.confidenceByCheckId, [questionId]: value } });
      const question = allQuestions.get(questionId);
      if (question)
        emitLearnEvent(makeEventContext(question), {
          type: 'confidence_set',
          itemId: question.id,
          confidence: value,
          questionText: (question.prompt || question.source).slice(0, 8_000),
        });
    },
    [allQuestions, commitProgress, makeEventContext],
  );

  function confirmSkip() {
    if (!skipQuestion) return;
    const before = progressRef.current;
    const skippedChecks = before.skippedChecks.some((item) => item.questionId === skipQuestion.id)
      ? before.skippedChecks
      : [...before.skippedChecks, { questionId: skipQuestion.id, at: new Date().toISOString() }];
    commitProgress({ ...before, skippedChecks });
    emitLearnEvent(makeEventContext(skipQuestion), {
      type: 'check_skipped',
      itemId: skipQuestion.id,
      itemType:
        skipQuestion.answerType === 'choice'
          ? 'mcq'
          : skipQuestion.answerType === 'true_false_why'
            ? 'true_false_why'
            : skipQuestion.answerType === 'find_mistake'
              ? 'find_mistake'
              : skipQuestion.answerType === 'text' || skipQuestion.mode === 'text'
                ? 'typed'
                : 'step_by_step',
      questionText: (skipQuestion.prompt || skipQuestion.source).slice(0, 8_000),
    });
    markSectionGateAttempt(currentSection, skipQuestion);
    if (currentSection && !gateFailedSections.current.has(currentSection.id)) {
      gateFailedSections.current.add(currentSection.id);
      emitLearnEvent(makeEventContext(skipQuestion, currentSection), {
        type: 'gate_failed',
        itemId: currentSection.id,
        questionText: currentSection.title ?? currentSection.id,
        note: 'A quick check was skipped; section navigation remains available after the remaining checks are answered or skipped.',
      });
    }
    setSkipQuestion(null);
  }

  return { skipQuestion, setSkipQuestion, skipCheckInvoker, isCheckComplete, conceptComplete, setAnswer, setConfidence, confirmSkip };
}
