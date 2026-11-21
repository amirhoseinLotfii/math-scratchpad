import { useEffect, useMemo, useRef } from 'react';
import type { BankQuestion, DriveBank } from '../../features/drive-bank/drive-bank';
import { stepIsBlank, stepLatex, type Exercise } from '../../model';
import type { ScratchState, ScratchStore } from '../../store';
import { ActivityTracker } from '../../sync/activity-tracker';
import { contextForQuestion, emitLearnEvent, type LearnEventContext } from '../../sync/events';
import { useDiagnosticGrading } from './use-diagnostic-grading';

function itemTypeForAnswer(answerType: string) {
  return answerType === 'choice'
    ? ('mcq' as const)
    : answerType === 'true_false_why'
      ? ('true_false_why' as const)
      : answerType === 'find_mistake'
        ? ('find_mistake' as const)
        : answerType === 'text'
          ? ('typed' as const)
          : ('step_by_step' as const);
}

export function useAppTelemetry({
  state,
  store,
  ex,
  loadedBank,
  matchingBank,
  currentBankQuestion,
  answerType,
  lessonScreenId,
  hasReferenceLesson,
  showResults,
  setManual,
}: {
  state: ScratchState;
  store: ScratchStore;
  ex: Exercise;
  loadedBank: { bank: DriveBank; version: string } | null;
  matchingBank: { bank: DriveBank; version: string } | null;
  currentBankQuestion: BankQuestion | undefined;
  answerType: string;
  lessonScreenId: string | undefined;
  hasReferenceLesson: boolean;
  showResults: boolean;
  setManual: (text: string) => void;
}) {
  const sessionId = state.doc.session?.id ?? '';
  const manualTimerPause = useRef(!!ex.timerPaused);
  const trackedExerciseId = useRef(ex.id);
  const practiceAttemptCounts = useRef(new Map<string, number>());

  const grading = useDiagnosticGrading({
    state,
    store,
    ex,
    sessionId,
    showResults,
    practiceAttemptCounts,
    setManual,
  });

  const practiceEventContext = useMemo(
    () =>
      contextForQuestion({
        bankVersion: loadedBank?.version ?? 'unknown',
        session: sessionId || 'unknown',
        chapter: matchingBank?.bank.chapter?.number,
        lesson: currentBankQuestion?.lessonId,
        section: currentBankQuestion?.sectionId,
        concept: currentBankQuestion?.conceptId,
        question: currentBankQuestion,
      }),
    [currentBankQuestion, loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId]
  );

  const sessionEventContext = useMemo<LearnEventContext>(
    () => ({
      bankVersion: loadedBank?.version ?? 'unknown',
      session: sessionId || 'unknown',
      chapter: matchingBank?.bank.chapter?.number ?? 0,
      lesson: 'unknown',
      section: 'unknown',
      concept: 'unknown',
    }),
    [loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId]
  );

  const lessonEventContext = useMemo<LearnEventContext>(
    () => ({
      bankVersion: loadedBank?.version ?? 'unknown',
      session: sessionId || 'unknown',
      chapter: matchingBank?.bank.chapter?.number ?? 0,
      lesson: lessonScreenId ?? 'unknown',
      section: 'unknown',
      concept: 'unknown',
    }),
    [lessonScreenId, loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId]
  );

  const activityTrackerRef = useRef<ActivityTracker | null>(null);
  if (!activityTrackerRef.current)
    activityTrackerRef.current = new ActivityTracker(practiceEventContext);
  const activityTracker = activityTrackerRef.current;
  activityTracker.setBaseContext(practiceEventContext);

  useEffect(() => activityTracker.listen(), [activityTracker]);

  useEffect(() => {
    if (!sessionId) return;
    const scopeId = `session:${sessionId}`;
    activityTracker.startScope({
      id: scopeId,
      openType: 'session_start',
      closeType: 'session_end',
      context: sessionEventContext,
    });
    return () => activityTracker.stopScope(scopeId);
  }, [activityTracker, sessionEventContext, sessionId]);

  useEffect(() => {
    if (manualTimerPause.current) activityTracker.setPaused(true);
  }, [activityTracker]);

  useEffect(() => {
    if (trackedExerciseId.current === ex.id) return;
    trackedExerciseId.current = ex.id;
    manualTimerPause.current = false;
    activityTracker.setPaused(false);
  }, [activityTracker, ex.id]);

  useEffect(() => {
    if (lessonScreenId || hasReferenceLesson) return;
    const question = currentBankQuestion;
    const context = contextForQuestion({
      bankVersion: loadedBank?.version ?? 'unknown',
      session: sessionId,
      chapter: matchingBank?.bank.chapter?.number,
      lesson: question?.lessonId,
      section: question?.sectionId,
      concept: question?.conceptId,
      question,
    });
    const scopeId = `question:${ex.id}`;
    activityTracker.startScope({
      id: scopeId,
      openType: 'question_open',
      closeType: 'question_close',
      context,
      fields: {
        itemId: question?.id ?? ex.id,
        itemType: itemTypeForAnswer(answerType),
        questionText: (ex.prompt || ex.source).slice(0, 8_000),
      },
    });
    return () => activityTracker.stopScope(scopeId);
  }, [
    activityTracker,
    answerType,
    currentBankQuestion,
    ex.id,
    ex.prompt,
    ex.source,
    hasReferenceLesson,
    lessonScreenId,
    loadedBank?.version,
    matchingBank?.bank.chapter?.number,
    sessionId,
  ]);

  function setTrackedTimerPaused(paused: boolean) {
    manualTimerPause.current = paused;
    activityTracker.setPaused(paused);
  }

  function recordPracticeAttempt() {
    if (ex.diagnosticId !== undefined) return;
    const steps = ex.steps
      .filter(step => !stepIsBlank(step))
      .map(step => stepLatex(step).slice(0, 4_000))
      .slice(0, 40);
    const answer =
      answerType === 'true_false_why'
        ? [
            ex.answerChoice ? (ex.answerChoice === 'true' ? 'True' : 'False') : '',
            ex.answerReason ?? '',
          ]
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
      itemType: itemTypeForAnswer(answerType),
      questionText: (ex.prompt || ex.source).slice(0, 8_000),
      ...(answer ? { userAnswer: answer } : {}),
      ...(steps.length ? { steps } : {}),
      verdict: 'submitted',
      verdictSource: 'none',
      attemptNo,
    });
  }

  return {
    sessionId,
    ...grading,
    activityTracker,
    practiceEventContext,
    sessionEventContext,
    lessonEventContext,
    setTrackedTimerPaused,
    recordPracticeAttempt,
  };
}
