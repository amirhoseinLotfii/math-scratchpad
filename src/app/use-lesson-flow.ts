import { useMemo, useRef, useState } from 'react';
import { actions } from '../store';
import { flushPersistedSession } from '../features/session/persistence/persistent-store';
import { archiveSession, bankDocument, type BankQuestion, type DriveBank } from '../features/drive-bank/drive-bank';
import { getPracticeQuestions } from '../features/lessons/selectors';
import type { Lesson, LessonProgress } from '../features/lessons/types';
import type { LessonRestoreTarget } from '../features/lessons/lesson-screen-types';
import { buildLessonSections } from '../features/lessons/lesson-sections';
import { readLessonProgress } from '../features/lessons/lesson-progress-store';
import { initialKeyboardOpen } from '../shared/lib/ui-prefs';
import { getAuthenticatedServerStorage, getLearningStorage } from '../sync/browser-db';
import { useOptionalReadingPositionContext } from '../features/progress/reading-position-context';
import { useLessonReference } from './use-lesson-reference';
import { freshLessonProgress, type LessonFlowOptions } from './lesson-flow-options';
export function useLessonFlow({
  store,
  dispatch,
  bankSession,
  matchingBank,
  currentBankQuestion,
  sessionId,
  activityTracker,
  exam,
  menuInvoker,
  setActiveInspector,
  setDriveBankInitialized,
  setShowResults,
  setManual,
  setComplete,
  switchQuestion,
}: LessonFlowOptions) {
  const { loadedBank, lessonProgressById, lessonProgressRef, rememberLessonProgress } = bankSession;
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false),
    [lessonScreen, setLessonScreen] = useState<Lesson | null>(null);
  const [practiceLessonId, setPracticeLessonId] = useState<string | null>(null),
    [practiceStartError, setPracticeStartError] = useState('');
  const lessonButton = useRef<HTMLButtonElement>(null);
  const activePracticeLessonId =
    practiceLessonId ??
    (currentBankQuestion?.stage !== 'learn' &&
    currentBankQuestion?.lessonId &&
    lessonProgressById[currentBankQuestion.lessonId]?.status === 'practising'
      ? currentBankQuestion.lessonId
      : null);
  const lessons = loadedBank?.bank.lessons ?? [];
  const readingPosition = useOptionalReadingPositionContext();
  const [restoreTarget, setRestoreTarget] = useState<LessonRestoreTarget | null>(null);
  // The landing-screen offer to resume. Only a position recorded against the
  // loaded bank version is trusted; a stale bank must not send the learner to a
  // lesson that no longer matches the content. Suppressed during a timed
  // diagnostic and during lesson practice, where the learner is mid-flow.
  const resumeCandidate = useMemo(() => {
    const saved = readingPosition?.position;
    if (!loadedBank || !saved?.lessonId || lessonScreen || exam || activePracticeLessonId) return null;
    if (saved.contentVersion !== loadedBank.version) return null;
    const lesson = loadedBank.bank.lessons?.find((item) => item.id === saved.lessonId);
    if (!lesson) return null;
    const sections = buildLessonSections(lesson);
    const sectionIndex = saved.sectionId ? sections.findIndex((item) => item.id === saved.sectionId) : -1;
    const section = sectionIndex >= 0 ? sections[sectionIndex] : undefined;
    return {
      lesson,
      saved,
      sectionIndex: sectionIndex >= 0 ? sectionIndex : undefined,
      sectionTitle: section?.title || section?.concepts[0]?.concept.title,
      chapterLabel:
        loadedBank.bank.chapter?.title ??
        (loadedBank.bank.chapter?.number != null ? `Chapter ${loadedBank.bank.chapter.number}` : undefined),
      sectionCount: sections.length,
      completedSections: lessonProgressById[lesson.id]?.completedSectionIds?.length ?? 0,
    };
  }, [activePracticeLessonId, exam, lessonProgressById, lessonScreen, loadedBank, readingPosition?.position]);
  const lastOpenedLessonKey = (bankId: string, version: string) =>
    `math-scratchpad-last-open-lesson-v1:${encodeURIComponent(bankId)}:${encodeURIComponent(version)}`;
  function resumeBankLesson(bank: DriveBank, version: string) {
    // Banks without lessons stay in the Drive panel so their question batch can be opened explicitly.
    if (!bank.lessons?.length) {
      setLessonScreen(null);
      setLessonPickerOpen(false);
      return;
    }
    setActiveInspector(null);
    const restored = readLessonProgress(bank, version);
    const active = bank.lessons ?? [];
    let storedId: string | null = null;
    try {
      storedId = getLearningStorage().getItem(lastOpenedLessonKey(bank.bank_id, version));
    } catch {
      /* optional preference */
    }
    const unfinished = active.filter((lesson) => {
      const item = restored.progressById[lesson.id];
      return item && item.status !== 'done';
    });
    const recent = unfinished.sort((a, b) => {
      const date = (lesson: Lesson) => {
        const item = restored.progressById[lesson.id];
        return item?.practiceStartedAt ?? item?.learnDoneAt ?? item?.learnStartedAt ?? '';
      };
      return date(b).localeCompare(date(a));
    });
    const target = recent.find((lesson) => lesson.id === storedId) ?? recent[0];
    if (target) {
      setLessonPickerOpen(false);
      setLessonScreen(target);
    } else {
      setLessonScreen(null);
      setLessonPickerOpen(true);
    }
  }
  function openLesson(lesson: Lesson) {
    const previousChapter = (lessonScreen?.section ?? store.getState().doc.session?.chapter?.toString())?.split('.')[0];
    if (previousChapter && previousChapter !== lesson.section.split('.')[0]) {
      void flushPersistedSession()
        .then(() => getAuthenticatedServerStorage()?.flush())
        .catch(() => {});
    }
    setRestoreTarget(null);
    const before = lessonProgressById[lesson.id];
    if (!before) rememberLessonProgress(freshLessonProgress(lesson.id));
    if (loadedBank) {
      try {
        getLearningStorage().setItem(lastOpenedLessonKey(loadedBank.bank.bank_id, loadedBank.version), lesson.id);
      } catch {
        /* optional preference; core progress still persists */
      }
    }
    setLessonPickerOpen(false);
    setLessonScreen(lesson);
  }
  function closeLesson() {
    setRestoreTarget(null);
    setLessonScreen(null);
    requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true }));
  }
  /** Opens the saved lesson/section and asks the lesson screen to scroll to it once. */
  function continueLearning() {
    const candidate = resumeCandidate;
    if (!candidate) return;
    openLesson(candidate.lesson);
    setRestoreTarget({
      sectionId: candidate.saved.sectionId,
      contentAnchorId: candidate.saved.contentAnchorId,
      scrollOffset: candidate.saved.scrollOffset,
    });
  }
  const { referenceLesson, openReference, closeReference, openInteractiveLessonFromReference, openQuestionFromReference } =
    useLessonReference({
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
    });
  function openDriveBank() {
    setDriveBankInitialized(true);
    setActiveInspector('drive');
  }
  function loadBankFromLessons() {
    setLessonPickerOpen(false);
    openDriveBank();
  }
  async function startLessonPractice(lesson: Lesson, progress: LessonProgress, selectedQuestions: BankQuestion[], sectionId?: string) {
    const targetBank = loadedBank;
    if (!targetBank) {
      setPracticeStartError('The lesson bank is not available for this session. Reconnect to the same bank version and try again.');
      return;
    }
    const questions = selectedQuestions.length ? selectedQuestions : sectionId ? [] : getPracticeQuestions(targetBank.bank, lesson.id);
    if (!questions.length) {
      setPracticeStartError('No practice questions yet');
      return;
    }
    try {
      const doc = bankDocument(targetBank.bank, targetBank.version, questions);
      await archiveSession(store.getState());
      dispatch(actions.load({ doc }));
      dispatch(actions.keyboard(initialKeyboardOpen(false)));
      dispatch(actions.notice('Lesson practice started.'));
      rememberLessonProgress(progress);
      setPracticeLessonId(lesson.id);
      setPracticeStartError('');
      setLessonScreen(null);
      setShowResults(false);
      setManual('');
      setComplete(false);
    } catch (error) {
      setPracticeStartError(error instanceof Error ? error.message : 'Could not start lesson practice. The current session was kept.');
    }
  }
  function markLessonPracticeDone(): boolean {
    if (!activePracticeLessonId) return false;
    const progress = lessonProgressRef.current.progressById[activePracticeLessonId];
    if (progress?.activePracticeSectionId) {
      const sectionId = progress.activePracticeSectionId;
      rememberLessonProgress({
        ...progress,
        status: 'learning',
        activePracticeSectionId: undefined,
        activePracticeQuestionIds: undefined,
        completedSectionIds: [...new Set([...(progress.completedSectionIds ?? []), sectionId])],
        summaryOpen: false,
      });
      const lesson = loadedBank?.bank.lessons?.find((item) => item.id === activePracticeLessonId);
      if (lesson) setLessonScreen(lesson);
      setPracticeLessonId(null);
      return !!lesson;
    }
    if (progress?.activePracticeQuestionIds?.length && loadedBank) {
      const completedPracticeQuestionIds = [
        ...new Set([...(progress.completedPracticeQuestionIds ?? []), ...progress.activePracticeQuestionIds]),
      ];
      const lesson = loadedBank.bank.lessons?.find((item) => item.id === activePracticeLessonId);
      const allPracticeQuestions = getPracticeQuestions(loadedBank.bank, activePracticeLessonId);
      const hasRemainingPractice = allPracticeQuestions.some((question) => !completedPracticeQuestionIds.includes(question.id));
      const next: LessonProgress = {
        ...progress,
        status: hasRemainingPractice ? 'learning' : 'done',
        completedPracticeQuestionIds,
        activePracticeQuestionIds: undefined,
        activePracticeSectionId: undefined,
        summaryOpen: true,
      };
      rememberLessonProgress(next);
      if (hasRemainingPractice && lesson) {
        setLessonScreen(lesson);
        setPracticeLessonId(null);
        return true;
      }
    } else if (progress)
      rememberLessonProgress({
        ...progress,
        status: 'done',
        summaryOpen: true,
        activePracticeSectionId: undefined,
        activePracticeQuestionIds: undefined,
      });
    setPracticeLessonId(null);
    return false;
  }

  return {
    lessonPickerOpen,
    setLessonPickerOpen,
    lessonScreen,
    referenceLesson,
    practiceStartError,
    lessonButton,
    activePracticeLessonId,
    lessons,
    restoreTarget,
    resumeCandidate,
    resumeBankLesson,
    openLesson,
    closeLesson,
    continueLearning,
    openReference,
    closeReference,
    openInteractiveLessonFromReference,
    openQuestionFromReference,
    openDriveBank,
    loadBankFromLessons,
    startLessonPractice,
    markLessonPracticeDone,
  };
}
