import type { MutableRefObject } from 'react';
import {
  archiveSession,
  bankDocument,
  type BankQuestion,
  type DriveBank,
} from '../../features/drive-bank/drive-bank';
import type { LessonProgressState } from '../../features/lessons/lesson-progress-store';
import { getPracticeQuestions } from '../../features/lessons/selectors';
import type { Lesson, LessonProgress } from '../../features/lessons/types';
import { initialKeyboardOpen } from '../../shared/lib/ui-prefs';
import { actions, type ScratchStore } from '../../store';

export function useLessonPracticeFlow({
  store,
  loadedBank,
  lessonProgressRef,
  activePracticeLessonId,
  rememberLessonProgress,
  setLessonScreen,
  setPracticeLessonId,
  setPracticeStartError,
  onResetPracticeView,
}: {
  store: ScratchStore;
  loadedBank: { bank: DriveBank; version: string } | null;
  lessonProgressRef: MutableRefObject<LessonProgressState>;
  activePracticeLessonId: string | null;
  rememberLessonProgress: (progress: LessonProgress) => void;
  setLessonScreen: (lesson: Lesson | null) => void;
  setPracticeLessonId: (id: string | null) => void;
  setPracticeStartError: (message: string) => void;
  onResetPracticeView: () => void;
}) {
  async function startLessonPractice(
    lesson: Lesson,
    progress: LessonProgress,
    selectedQuestions: BankQuestion[],
    sectionId?: string
  ) {
    const targetBank = loadedBank;
    if (!targetBank) {
      setPracticeStartError(
        'The lesson bank is not available for this session. Reconnect to the same bank version and try again.'
      );
      return;
    }
    const questions = selectedQuestions.length
      ? selectedQuestions
      : sectionId
        ? []
        : getPracticeQuestions(targetBank.bank, lesson.id);
    if (!questions.length) {
      setPracticeStartError('No practice questions yet');
      return;
    }
    try {
      const doc = bankDocument(targetBank.bank, targetBank.version, questions);
      await archiveSession(store.getState());
      store.dispatch(actions.load({ doc }));
      store.dispatch(actions.keyboard(initialKeyboardOpen(false)));
      store.dispatch(actions.notice('Lesson practice started.'));
      rememberLessonProgress(progress);
      setPracticeLessonId(lesson.id);
      setPracticeStartError('');
      setLessonScreen(null);
      onResetPracticeView();
    } catch (error) {
      setPracticeStartError(
        error instanceof Error
          ? error.message
          : 'Could not start lesson practice. The current session was kept.'
      );
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
      const lesson = loadedBank?.bank.lessons?.find(item => item.id === activePracticeLessonId);
      if (lesson) setLessonScreen(lesson);
      setPracticeLessonId(null);
      return !!lesson;
    }
    if (progress?.activePracticeQuestionIds?.length && loadedBank) {
      const completedPracticeQuestionIds = [
        ...new Set([
          ...(progress.completedPracticeQuestionIds ?? []),
          ...progress.activePracticeQuestionIds,
        ]),
      ];
      const lesson = loadedBank.bank.lessons?.find(item => item.id === activePracticeLessonId);
      const allPracticeQuestions = getPracticeQuestions(loadedBank.bank, activePracticeLessonId);
      const hasRemainingPractice = allPracticeQuestions.some(
        question => !completedPracticeQuestionIds.includes(question.id)
      );
      rememberLessonProgress({
        ...progress,
        status: hasRemainingPractice ? 'learning' : 'done',
        completedPracticeQuestionIds,
        activePracticeQuestionIds: undefined,
        activePracticeSectionId: undefined,
        summaryOpen: true,
      });
      if (hasRemainingPractice && lesson) {
        setLessonScreen(lesson);
        setPracticeLessonId(null);
        return true;
      }
    } else if (progress) {
      rememberLessonProgress({
        ...progress,
        status: 'done',
        summaryOpen: true,
        activePracticeSectionId: undefined,
        activePracticeQuestionIds: undefined,
      });
    }
    setPracticeLessonId(null);
    return false;
  }

  return { startLessonPractice, markLessonPracticeDone };
}
