import { useRef, useState, type MutableRefObject } from 'react';
import { archiveSession, bankDocument, type BankQuestion, type DriveBank } from '../../features/drive-bank/drive-bank';
import { buildLessonSections } from '../../features/lessons/lesson-sections';
import type { LessonProgressState } from '../../features/lessons/lesson-progress-store';
import type { Lesson, LessonProgress } from '../../features/lessons/types';
import { isoLocal } from '../../model';
import { initialKeyboardOpen } from '../../shared/lib/ui-prefs';
import { actions, type ScratchStore } from '../../store';
import type { ActivityTracker } from '../../sync/activity-tracker';
import { contextForQuestion, emitLearnEvent } from '../../sync/events';

export function freshLessonProgress(lessonId: string): LessonProgress {
  return {
    lessonId,
    status: 'learning',
    currentConceptIndex: 0,
    currentSectionIndex: 0,
    completedConceptIds: [],
    completedSectionIds: [],
    answeredCheckIds: [],
    skippedChecks: [],
    summaryOpen: false,
    revealedSteps: {},
    learnStartedAt: new Date().toISOString(),
  };
}

export function useLessonReference({
  store,
  loadedBank,
  matchingBank,
  currentBankQuestion,
  lessonProgressRef,
  updateLessonProgressState,
  rememberLessonProgress,
  activityTracker,
  sessionId,
  setLessonScreen,
  setPracticeLessonId,
  setPracticeStartError,
  onSwitchQuestion,
  onResetPracticeView,
}: {
  store: ScratchStore;
  loadedBank: { bank: DriveBank; version: string } | null;
  matchingBank: { bank: DriveBank; version: string } | null;
  currentBankQuestion: BankQuestion | undefined;
  lessonProgressRef: MutableRefObject<LessonProgressState>;
  updateLessonProgressState: (state: LessonProgressState) => void;
  rememberLessonProgress: (progress: LessonProgress) => void;
  activityTracker: ActivityTracker;
  sessionId: string;
  setLessonScreen: (lesson: Lesson | null) => void;
  setPracticeLessonId: (id: string | null) => void;
  setPracticeStartError: (err: string) => void;
  onSwitchQuestion: (id: string) => void;
  onResetPracticeView: () => void;
}) {
  const [referenceLesson, setReferenceLesson] = useState<Lesson | null>(null);
  const [referenceWasRunning, setReferenceWasRunning] = useState(false);
  const referenceScopeId = useRef<string | null>(null);

  function openReference(lesson: Lesson) {
    const current = store
      .getState()
      .doc.exercises.find(item => item.id === store.getState().doc.exerciseId);
    const wasRunning =
      !!current && !current.timerPaused && Number.isFinite(current.timerRunningSince);
    setReferenceWasRunning(wasRunning);
    if (currentBankQuestion && currentBankQuestion.stage !== 'learn') {
      const progress = lessonProgressRef.current;
      updateLessonProgressState({
        ...progress,
        activePanelEvent: { questionId: currentBankQuestion.id, openedAt: isoLocal() },
      });
    }
    if (wasRunning && current)
      store.dispatch(actions.timerPause({ exerciseId: current.id, now: Date.now(), paused: true }));
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
            closedAt:
              closedAt < progress.activePanelEvent.openedAt
                ? progress.activePanelEvent.openedAt
                : closedAt,
          },
        ],
      });
    }
    if (referenceWasRunning && !targetExerciseId) {
      const current = store
        .getState()
        .doc.exercises.find(item => item.id === store.getState().doc.exerciseId);
      if (current?.timerPaused)
        store.dispatch(
          actions.timerPause({ exerciseId: current.id, now: Date.now(), paused: false })
        );
    }
    setReferenceWasRunning(false);
    if (targetExerciseId) onSwitchQuestion(targetExerciseId);
  }

  function openInteractiveLessonFromReference(sectionId: string) {
    const lesson = referenceLesson;
    if (!lesson) return;
    closeReference();
    const sections = buildLessonSections(lesson);
    const currentSectionIndex = Math.max(
      0,
      sections.findIndex(section => section.id === sectionId)
    );
    const progress =
      lessonProgressRef.current.progressById[lesson.id] ?? freshLessonProgress(lesson.id);
    const section = sections[currentSectionIndex];
    rememberLessonProgress({
      ...progress,
      currentSectionIndex,
      currentConceptIndex: section?.concepts[0]?.conceptIndex ?? progress.currentConceptIndex,
      summaryOpen: false,
    });
    setLessonScreen(lesson);
    onResetPracticeView();
  }

  async function openQuestionFromReference(questionId: string) {
    const existing = store
      .getState()
      .doc.exercises.find(item => item.bankQuestionId === questionId);
    if (existing) {
      closeReference(existing.id);
      return;
    }
    const targetBank = loadedBank;
    const question = targetBank?.bank.questions.find(item => item.id === questionId);
    const lesson = question?.lessonId
      ? targetBank?.bank.lessons?.find(item => item.id === question.lessonId)
      : undefined;
    if (!targetBank || !question || !lesson) return;
    try {
      const doc = bankDocument(targetBank.bank, targetBank.version, [question]);
      const before = store.getState();
      closeReference();
      await archiveSession(before);
      store.dispatch(actions.load({ doc }));
      store.dispatch(actions.keyboard(initialKeyboardOpen(false)));
      store.dispatch(actions.notice('Lesson practice started.'));
      const progress =
        lessonProgressRef.current.progressById[lesson.id] ?? freshLessonProgress(lesson.id);
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
      onResetPracticeView();
    } catch (error) {
      setPracticeStartError(
        error instanceof Error
          ? error.message
          : 'Could not open this practice question. The current session was kept.'
      );
    }
  }

  return {
    referenceLesson,
    openReference,
    closeReference,
    openInteractiveLessonFromReference,
    openQuestionFromReference,
  };
}
