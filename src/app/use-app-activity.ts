import { useEffect, useMemo, useRef } from 'react';

import { type BankQuestion, type DriveBank } from '../features/drive-bank/drive-bank';
import type { Lesson } from '../features/lessons/types';
import { ActivityTracker } from '../sync/activity-tracker';
import { contextForQuestion, type LearnEventContext } from '../sync/events';

import type { Exercise } from '../model';
import type { RefObject } from 'react';
type LoadedBank = { bank: DriveBank; version: string };

type ActivityQuestion = {
  currentBankQuestion?: BankQuestion;
  loadedBank: LoadedBank | null;
  matchingBank: LoadedBank | null;
  sessionId: string;
  ex: Exercise;
  answerType: NonNullable<BankQuestion['answerType']>;
};

export function useAppActivity({
  currentBankQuestion,
  loadedBank,
  matchingBank,
  sessionId,
  ex,
  manualTimerPause,
  trackedExerciseId,
}: ActivityQuestion & { manualTimerPause: RefObject<boolean>; trackedExerciseId: RefObject<string> }) {
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
    [currentBankQuestion, loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId],
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
    [loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId],
  );
  const activityTrackerRef = useRef<ActivityTracker | null>(null);
  if (!activityTrackerRef.current) activityTrackerRef.current = new ActivityTracker(practiceEventContext);
  const activityTracker = activityTrackerRef.current;
  activityTracker.setBaseContext(practiceEventContext);
  const practiceAttemptCounts = useRef(new Map<string, number>());
  useEffect(() => activityTracker.listen(), [activityTracker]);
  useEffect(() => {
    if (!sessionId) return;
    const scopeId = `session:${sessionId}`;
    activityTracker.startScope({ id: scopeId, openType: 'session_start', closeType: 'session_end', context: sessionEventContext });
    return () => activityTracker.stopScope(scopeId);
  }, [activityTracker, sessionId]);
  useEffect(() => {
    if (manualTimerPause.current) activityTracker.setPaused(true);
  }, [activityTracker]);
  useEffect(() => {
    if (trackedExerciseId.current === ex.id) return;
    trackedExerciseId.current = ex.id;
    manualTimerPause.current = false;
    activityTracker.setPaused(false);
  }, [activityTracker, ex.id]);

  return { activityTracker, practiceEventContext, sessionEventContext, practiceAttemptCounts };
}

export function useAppActivityScopes({
  activityTracker,
  lessonScreen,
  referenceLesson,
  currentBankQuestion,
  loadedBank,
  matchingBank,
  sessionId,
  ex,
  answerType,
}: ActivityQuestion & { activityTracker: ActivityTracker; lessonScreen: Lesson | null; referenceLesson: Lesson | null }) {
  useEffect(() => {
    if (lessonScreen || referenceLesson) return;
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
    const itemType =
      answerType === 'choice'
        ? 'mcq'
        : answerType === 'true_false_why'
          ? 'true_false_why'
          : answerType === 'find_mistake'
            ? 'find_mistake'
            : answerType === 'text'
              ? 'typed'
              : 'step_by_step';
    activityTracker.startScope({
      id: scopeId,
      openType: 'question_open',
      closeType: 'question_close',
      context,
      fields: {
        itemId: question?.id ?? ex.id,
        itemType,
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
    lessonScreen,
    loadedBank?.version,
    matchingBank?.bank.chapter?.number,
    referenceLesson,
    sessionId,
  ]);
}
