import { useRef, useState } from 'react';
import { actions } from '../store';

import { isoLocal } from '../model';
import { archiveSession, bankDocument } from '../features/drive-bank/drive-bank';
import type { Lesson } from '../features/lessons/types';
import { buildLessonSections } from '../features/lessons/lesson-sections';
import { initialKeyboardOpen } from '../shared/lib/ui-prefs';
import { contextForQuestion, emitLearnEvent } from '../sync/events';

import type { Dispatch, SetStateAction } from 'react';
import { freshLessonProgress, type LessonFlowOptions } from './lesson-flow-options';
type Set<T> = Dispatch<SetStateAction<T>>;
type ReferenceOptions = Pick<
  LessonFlowOptions,
  | 'store'
  | 'dispatch'
  | 'bankSession'
  | 'matchingBank'
  | 'currentBankQuestion'
  | 'sessionId'
  | 'activityTracker'
  | 'setShowResults'
  | 'setManual'
  | 'setComplete'
  | 'switchQuestion'
> & {
  setLessonScreen: Set<Lesson | null>;
  setPracticeLessonId: Set<string | null>;
  setPracticeStartError: Set<string>;
};
export function useLessonReference({
  store,
  dispatch,
  bankSession,
  matchingBank,
  currentBankQuestion,
  sessionId,
  activityTracker,
  setLessonScreen,
  setPracticeLessonId,
  setPracticeStartError,
  setShowResults,
  setManual,
  setComplete,
  switchQuestion,
}: ReferenceOptions) {
  const { loadedBank, lessonProgressRef, updateLessonProgressState, rememberLessonProgress } = bankSession;
  const [referenceLesson, setReferenceLesson] = useState<Lesson | null>(null),
    [referenceWasRunning, setReferenceWasRunning] = useState(false);
  const referenceScopeId = useRef<string | null>(null);
  function openReference(lesson: Lesson) {
    const current = store.getState().doc.exercises.find((item) => item.id === store.getState().doc.exerciseId);
    const wasRunning = !!current && !current.timerPaused && Number.isFinite(current.timerRunningSince);
    setReferenceWasRunning(wasRunning);
    if (currentBankQuestion && currentBankQuestion.stage !== 'learn') {
      const progress = lessonProgressRef.current;
      updateLessonProgressState({ ...progress, activePanelEvent: { questionId: currentBankQuestion.id, openedAt: isoLocal() } });
    }
    if (wasRunning && current) dispatch(actions.timerPause({ exerciseId: current.id, now: Date.now(), paused: true }));
    const scopeId = `lesson-reference:${lesson.id}`;
    const context = contextForQuestion({
      bankVersion: loadedBank?.version ?? 'unknown',
      session: sessionId || 'unknown',
      chapter: matchingBank?.bank.chapter?.number,
      lesson: lesson.id,
    });
    if (referenceScopeId.current) activityTracker.stopScope(referenceScopeId.current);
    referenceScopeId.current = scopeId;
    activityTracker.startScope({
      id: scopeId,
      openType: 'lesson_open',
      closeType: 'lesson_close',
      context,
      fields: { itemId: lesson.id, questionText: lesson.title },
    });
    emitLearnEvent(context, {
      type: 'chunk_read',
      itemId: lesson.id,
      questionText: lesson.title,
      note: 'Read-only lesson reference opened.',
    });
    setReferenceLesson(lesson);
  }
  function closeReference(targetExerciseId?: string) {
    if (referenceScopeId.current) activityTracker.stopScope(referenceScopeId.current);
    referenceScopeId.current = null;
    setReferenceLesson(null);
    const progress = lessonProgressRef.current;
    if (progress.activePanelEvent) {
      const closedAt = isoLocal();
      updateLessonProgressState({
        ...progress,
        activePanelEvent: undefined,
        lessonPanelEvents: [
          ...progress.lessonPanelEvents,
          {
            ...progress.activePanelEvent,
            closedAt: closedAt < progress.activePanelEvent.openedAt ? progress.activePanelEvent.openedAt : closedAt,
          },
        ],
      });
    }
    if (referenceWasRunning && !targetExerciseId) {
      const current = store.getState().doc.exercises.find((item) => item.id === store.getState().doc.exerciseId);
      if (current?.timerPaused) dispatch(actions.timerPause({ exerciseId: current.id, now: Date.now(), paused: false }));
    }
    setReferenceWasRunning(false);
    if (targetExerciseId) switchQuestion(targetExerciseId);
  }
  function openInteractiveLessonFromReference(sectionId: string) {
    const lesson = referenceLesson;
    if (!lesson) return;
    closeReference();
    const sections = buildLessonSections(lesson);
    const currentSectionIndex = Math.max(
      0,
      sections.findIndex((section) => section.id === sectionId),
    );
    const progress = lessonProgressRef.current.progressById[lesson.id] ?? freshLessonProgress(lesson.id);
    const section = sections[currentSectionIndex];
    rememberLessonProgress({
      ...progress,
      currentSectionIndex,
      currentConceptIndex: section?.concepts[0]?.conceptIndex ?? progress.currentConceptIndex,
      summaryOpen: false,
    });
    setLessonScreen(lesson);
    setShowResults(false);
  }
  async function startReferencePracticeQuestion(questionId: string) {
    const targetBank = loadedBank;
    const question = targetBank?.bank.questions.find((item) => item.id === questionId);
    const lesson = question?.lessonId ? targetBank?.bank.lessons?.find((item) => item.id === question.lessonId) : undefined;
    if (!targetBank || !question || !lesson) return;
    const existing = store.getState().doc.exercises.find((item) => item.bankQuestionId === questionId);
    if (existing) {
      closeReference(existing.id);
      return;
    }
    try {
      const doc = bankDocument(targetBank.bank, targetBank.version, [question]);
      const before = store.getState();
      closeReference();
      await archiveSession(before);
      dispatch(actions.load({ doc }));
      dispatch(actions.keyboard(initialKeyboardOpen(false)));
      dispatch(actions.notice('Lesson practice started.'));
      const progress = lessonProgressRef.current.progressById[lesson.id] ?? freshLessonProgress(lesson.id);
      rememberLessonProgress({
        ...progress,
        status: 'practising',
        activePracticeSectionId: undefined,
        activePracticeQuestionIds: [question.id],
        summaryOpen: true,
        practiceStartedAt: new Date().toISOString(),
      });
      setPracticeLessonId(lesson.id);
      setPracticeStartError('');
      setLessonScreen(null);
      setShowResults(false);
      setManual('');
      setComplete(false);
    } catch (error) {
      setPracticeStartError(
        error instanceof Error ? error.message : 'Could not open this practice question. The current session was kept.',
      );
    }
  }
  async function openQuestionFromReference(questionId: string) {
    const existing = store.getState().doc.exercises.find((item) => item.bankQuestionId === questionId);
    if (existing) closeReference(existing.id);
    else await startReferencePracticeQuestion(questionId);
  }
  return { referenceLesson, openReference, closeReference, openInteractiveLessonFromReference, openQuestionFromReference };
}
