import { useMemo, useState, type MutableRefObject } from 'react';
import type { BankQuestion, DriveBank } from '../../features/drive-bank/drive-bank';
import {
  readLessonProgress,
  type LessonProgressState,
} from '../../features/lessons/lesson-progress-store';
import type { LessonRestoreTarget } from '../../features/lessons/lesson-screen';
import { buildLessonSections } from '../../features/lessons/lesson-sections';
import type { Lesson, LessonProgress } from '../../features/lessons/types';
import { useOptionalReadingPositionContext } from '../../features/progress/reading-position-context';
import type { ScratchStore } from '../../store';
import type { ActivityTracker } from '../../sync/activity-tracker';
import { getLearningStorage } from '../../sync/browser-db';
import { useLessonPracticeFlow } from './use-lesson-practice';
import { freshLessonProgress, useLessonReference } from './use-lesson-reference';

const lastOpenedLessonKey = (bankId: string, version: string) =>
  `math-scratchpad-last-open-lesson-v1:${encodeURIComponent(bankId)}:${encodeURIComponent(version)}`;

export function useLessonOrchestration({
  store,
  loadedBank,
  matchingBank,
  currentBankQuestion,
  lessonProgressById,
  lessonProgressRef,
  updateLessonProgressState,
  rememberLessonProgress,
  activityTracker,
  sessionId,
  exam,
  menuInvoker,
  setActiveInspector,
  onSwitchQuestion,
  onResetPracticeView,
}: {
  store: ScratchStore;
  loadedBank: { bank: DriveBank; version: string } | null;
  matchingBank: { bank: DriveBank; version: string } | null;
  currentBankQuestion: BankQuestion | undefined;
  lessonProgressById: Record<string, LessonProgress>;
  lessonProgressRef: MutableRefObject<LessonProgressState>;
  updateLessonProgressState: (state: LessonProgressState) => void;
  rememberLessonProgress: (progress: LessonProgress) => void;
  activityTracker: ActivityTracker;
  sessionId: string;
  exam: boolean;
  menuInvoker: MutableRefObject<HTMLButtonElement | null>;
  setActiveInspector: (inspector: 'drive' | 'sync' | null) => void;
  onSwitchQuestion: (id: string) => void;
  onResetPracticeView: () => void;
}) {
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  const [lessonScreen, setLessonScreen] = useState<Lesson | null>(null);
  const [practiceLessonId, setPracticeLessonId] = useState<string | null>(null);
  const [practiceStartError, setPracticeStartError] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<LessonRestoreTarget | null>(null);
  const readingPosition = useOptionalReadingPositionContext();

  const refHooks = useLessonReference({
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
  });

  const activePracticeLessonId =
    practiceLessonId ??
    (currentBankQuestion?.stage !== 'learn' &&
    currentBankQuestion?.lessonId &&
    lessonProgressById[currentBankQuestion.lessonId]?.status === 'practising'
      ? currentBankQuestion.lessonId
      : null);

  const practiceFlow = useLessonPracticeFlow({
    store,
    loadedBank,
    lessonProgressRef,
    activePracticeLessonId,
    rememberLessonProgress,
    setLessonScreen,
    setPracticeLessonId,
    setPracticeStartError,
    onResetPracticeView,
  });

  const resumeCandidate = useMemo(() => {
    const saved = readingPosition?.position;
    if (!loadedBank || !saved?.lessonId || lessonScreen || exam || activePracticeLessonId)
      return null;
    if (saved.contentVersion !== loadedBank.version) return null;
    const lesson = loadedBank.bank.lessons?.find(item => item.id === saved.lessonId);
    if (!lesson) return null;
    const sections = buildLessonSections(lesson);
    const sectionIndex = saved.sectionId
      ? sections.findIndex(item => item.id === saved.sectionId)
      : -1;
    const section = sectionIndex >= 0 ? sections[sectionIndex] : undefined;
    return {
      lesson,
      saved,
      sectionIndex: sectionIndex >= 0 ? sectionIndex : undefined,
      sectionTitle: section?.title || section?.concepts[0]?.concept.title,
      chapterLabel:
        loadedBank.bank.chapter?.title ??
        (loadedBank.bank.chapter?.number != null
          ? `Chapter ${loadedBank.bank.chapter.number}`
          : undefined),
      sectionCount: sections.length,
      completedSections: lessonProgressById[lesson.id]?.completedSectionIds?.length ?? 0,
    };
  }, [
    activePracticeLessonId,
    exam,
    lessonProgressById,
    lessonScreen,
    loadedBank,
    readingPosition?.position,
  ]);

  function resumeBankLesson(bank: DriveBank, version: string) {
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
    const unfinished = active.filter(lesson => {
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
    const target = recent.find(lesson => lesson.id === storedId) ?? recent[0];
    if (target) {
      setLessonPickerOpen(false);
      setLessonScreen(target);
    } else {
      setLessonScreen(null);
      setLessonPickerOpen(true);
    }
  }

  function openLesson(lesson: Lesson) {
    setRestoreTarget(null);
    const before = lessonProgressById[lesson.id];
    if (!before) rememberLessonProgress(freshLessonProgress(lesson.id));
    if (loadedBank) {
      try {
        getLearningStorage().setItem(
          lastOpenedLessonKey(loadedBank.bank.bank_id, loadedBank.version),
          lesson.id
        );
      } catch {
        /* optional preference */
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

  function continueLearning() {
    if (!resumeCandidate) return;
    openLesson(resumeCandidate.lesson);
    setRestoreTarget({
      sectionId: resumeCandidate.saved.sectionId,
      contentAnchorId: resumeCandidate.saved.contentAnchorId,
      scrollOffset: resumeCandidate.saved.scrollOffset,
    });
  }

  return {
    lessonPickerOpen,
    setLessonPickerOpen,
    lessonScreen,
    setLessonScreen,
    activePracticeLessonId,
    practiceStartError,
    restoreTarget,
    resumeCandidate,
    resumeBankLesson,
    openLesson,
    closeLesson,
    continueLearning,
    ...practiceFlow,
    ...refHooks,
  };
}
