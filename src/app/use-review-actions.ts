import { useRef, useState } from 'react';
import { actions } from '../store';
import { stepIsBlank, stepLatex } from '../model';
import { fingerprint, reviewMessage, writeClipboard } from '../review';

import { type BankQuestion } from '../features/drive-bank/drive-bank';
import { emitLearnEvent, type LearnEventContext } from '../sync/events';

import type { AppDispatch, ScratchStore } from '../store';
import type { Exercise } from '../model';
import type { RefObject, Dispatch, SetStateAction } from 'react';
type Set<T> = Dispatch<SetStateAction<T>>;

type Decision = 'next' | 'complete' | 'copy';
type ReviewOptions = {
  store: ScratchStore;
  dispatch: AppDispatch;
  ex: Exercise;
  answerType: NonNullable<BankQuestion['answerType']>;
  currentBankQuestion?: BankQuestion;
  practiceAttemptCounts: RefObject<Map<string, number>>;
  practiceEventContext: LearnEventContext;
  markLessonPracticeDone: () => boolean;
  setShowResults: Set<boolean>;
  setManual: Set<string>;
  setComplete: Set<boolean>;
};
export function useReviewActions({
  store,
  dispatch,
  ex,
  answerType,
  currentBankQuestion,
  practiceAttemptCounts,
  practiceEventContext,
  markLessonPracticeDone,
  setShowResults,
  setManual,
  setComplete,
}: ReviewOptions) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const manualRef = useRef<HTMLTextAreaElement>(null);
  const invoker = useRef<HTMLElement | null>(null);
  const decisionRef = useRef<Decision | null>(null),
    copyBusy = useRef(false);
  async function copyReview() {
    if (copyBusy.current) return;
    copyBusy.current = true;
    setBusy(true);
    const doc = store.getState().doc,
      snapshot = fingerprint(doc),
      id = doc.exerciseId;
    try {
      const text = reviewMessage(doc);
      if (await writeClipboard(text)) {
        dispatch(actions.copied({ exerciseId: id, snapshot }));
        setManual('');
      } else {
        setManual(text);
        dispatch(actions.notice('Clipboard blocked. Select the review message and copy it manually.'));
      }
    } finally {
      copyBusy.current = false;
      setBusy(false);
    }
  }
  function recordPracticeAttempt() {
    if (ex.diagnosticId !== undefined) return; // The diagnostic result event is emitted after the reliable checker runs.
    const steps = ex.steps
      .filter((step) => !stepIsBlank(step))
      .map((step) => stepLatex(step).slice(0, 4_000))
      .slice(0, 40);
    const answer =
      answerType === 'true_false_why'
        ? [ex.answerChoice ? (ex.answerChoice === 'true' ? 'True' : 'False') : '', ex.answerReason ?? '']
            .filter(Boolean)
            .join(' — ')
            .slice(0, 8_000)
        : (ex.answerText ?? '').slice(0, 8_000);
    if (!answer && !steps.length) return;
    const itemId = currentBankQuestion?.id ?? ex.id;
    const attemptNo = (practiceAttemptCounts.current.get(itemId) ?? 0) + 1;
    practiceAttemptCounts.current.set(itemId, attemptNo);
    emitLearnEvent(practiceEventContext, {
      type: currentBankQuestion?.stage === 'learn' ? 'check_answer' : 'exercise_attempt',
      itemId,
      itemType:
        answerType === 'choice'
          ? 'mcq'
          : answerType === 'true_false_why'
            ? 'true_false_why'
            : answerType === 'find_mistake'
              ? 'find_mistake'
              : answerType === 'text'
                ? 'typed'
                : 'step_by_step',
      questionText: (ex.prompt || ex.source).slice(0, 8_000),
      ...(answer ? { userAnswer: answer } : {}),
      ...(steps.length ? { steps } : {}),
      verdict: 'submitted',
      verdictSource: 'none',
      attemptNo,
    });
  }
  function commit(action: Decision) {
    recordPracticeAttempt();
    if (action === 'next') {
      dispatch(actions.adjacentExercise(1));
      setManual('');
      setShowResults(false);
    } else if (action === 'complete') {
      if (!markLessonPracticeDone()) setComplete(true);
    } else void copyReview();
  }
  function request(action: Decision) {
    if (ex.skipped || (action === 'copy' && ex.confidence)) {
      commit(action);
      return;
    }
    if (decisionRef.current) return;
    invoker.current = document.activeElement as HTMLElement;
    decisionRef.current = action;
    setDecision(action);
  }
  function cancelDecision() {
    decisionRef.current = null;
    setDecision(null);
  }
  function confirmDecision(value: 'low' | 'medium' | 'high') {
    const action = decisionRef.current;
    if (!action) return;
    decisionRef.current = null;
    if (action !== 'copy') dispatch(actions.autoFinal());
    dispatch(actions.setConfidence(value));
    setDecision(null);
    commit(action);
  }

  return { decision, busy, manualRef, invoker, copyReview, request, cancelDecision, confirmDecision };
}
