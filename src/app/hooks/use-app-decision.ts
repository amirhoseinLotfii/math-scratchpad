import { useRef, useState } from 'react';
import { clearAppStorage } from '../../features/session/persistence/persistent-store';
import type { Exercise } from '../../model';
import { actions, type ScratchStore } from '../../store';
import { emitLearnEvent, type LearnEventContext } from '../../sync/events';
import type { Decision } from '../components/practice-workspace';
import type { ResetKind } from '../dialogs-host';

export function useAppDecision({
  ex,
  store,
  dispatch,
  sessionEventContext,
  sessionId,
  recordPracticeAttempt,
  markLessonPracticeDone,
  copyReview,
  setManual,
  setShowResults,
}: {
  ex: Exercise;
  store: ScratchStore;
  dispatch: ScratchStore['dispatch'];
  sessionEventContext: LearnEventContext;
  sessionId: string;
  recordPracticeAttempt: () => void;
  markLessonPracticeDone: () => boolean;
  copyReview: () => Promise<void>;
  setManual: (value: string) => void;
  setShowResults: (value: boolean) => void;
}) {
  const [resetKind, setResetKind] = useState<ResetKind | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [complete, setComplete] = useState(false);
  const invoker = useRef<HTMLElement | null>(null);
  const decisionRef = useRef<Decision | null>(null);

  function confirmReset() {
    const kind = resetKind;
    setResetKind(null);
    if (kind === 'session') {
      emitLearnEvent(sessionEventContext, {
        type: 'session_reset',
        itemId: sessionId || undefined,
      });
      dispatch(actions.resetSession());
      setShowResults(false);
      setManual('');
    } else if (kind === 'all') {
      emitLearnEvent(sessionEventContext, {
        type: 'session_reset',
        itemId: sessionId || undefined,
        note: 'All local storage cleared.',
      });
      if (store.clearStorage) store.clearStorage();
      else clearAppStorage();
      window.location.reload();
    }
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

  function confirmDecision(value: 'low' | 'medium' | 'high') {
    const action = decisionRef.current;
    if (!action) return;
    decisionRef.current = null;
    if (action !== 'copy') dispatch(actions.autoFinal());
    dispatch(actions.setConfidence(value));
    setDecision(null);
    commit(action);
  }

  return {
    resetKind,
    setResetKind,
    decision,
    setDecision,
    decisionRef,
    complete,
    setComplete,
    invoker,
    confirmReset,
    request,
    confirmDecision,
  };
}
