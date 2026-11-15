import { useCallback, useEffect, useRef, useState } from 'react';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import { type Lesson, type LessonProgress } from './types';
import { getLearnChecks } from './selectors';
import { type LessonSection } from './lesson-sections';
import { MAX_SESSION_EXERCISES } from '../../model';
import { emitLearnEvent, type LearnEventContext } from '../../sync/events';

import type { RefObject, Dispatch, SetStateAction } from 'react';
import type { LessonEventContextFor, LessonProgressWriter, ReadyLessonProps } from './lesson-screen-types';
type Set<T> = Dispatch<SetStateAction<T>>;

type Options = {
  progressRef: RefObject<LessonProgress>;
  commitProgress: LessonProgressWriter;
  currentSection?: LessonSection;
  makeEventContext: LessonEventContextFor;

  bank: DriveBank;
  lesson: Lesson;
  sections: LessonSection[];
  sectionIndex: number;
  summary: boolean;
  progress: LessonProgress;
  setSectionIndex: Set<number>;
  setSummary: Set<boolean>;
  conceptComplete: boolean;
  isCheckComplete: (id: string) => boolean;
  lessonEventContext: LearnEventContext;
  practiceQuestions: BankQuestion[];
  sectionPracticeQuestions: BankQuestion[];
  onStartPractice: ReadyLessonProps['onStartPractice'];
};
export function useLessonNavigation({
  bank,
  lesson,
  currentSection,
  sections,
  sectionIndex,
  summary,
  progressRef,
  progress,
  commitProgress,
  setSectionIndex,
  setSummary,
  conceptComplete,
  isCheckComplete,
  makeEventContext,
  lessonEventContext,
  practiceQuestions,
  sectionPracticeQuestions,
  onStartPractice,
}: Options) {
  const [skipPracticeOpen, setSkipPracticeOpen] = useState(false);
  const skipCheckInvoker = useRef<HTMLElement | null>(null);
  const skipPracticeInvoker = useRef<HTMLButtonElement>(null);
  const goPrevious = useCallback(() => {
    const nextIndex = summary ? Math.max(0, sections.length - 1) : Math.max(0, sectionIndex - 1);
    if (!summary && sectionIndex === 0) return;
    const before = progressRef.current;
    const nextSection = sections[nextIndex];
    const conceptIndex = nextSection?.concepts[0]?.conceptIndex ?? 0;
    if (before.currentSectionIndex !== nextIndex || before.currentConceptIndex !== conceptIndex || before.summaryOpen !== false) {
      commitProgress({ ...before, currentSectionIndex: nextIndex, currentConceptIndex: conceptIndex, summaryOpen: false });
    }
    setSummary(false);
    setSectionIndex(nextIndex);
  }, [commitProgress, sectionIndex, sections, summary]);

  const goNext = useCallback(() => {
    if (!currentSection || !conceptComplete) return;
    const before = progressRef.current;
    const completedConceptIds = new Set(before.completedConceptIds);
    for (const { concept } of currentSection.concepts) {
      const lastAppearance = sections.map((section) => section.concepts.some((entry) => entry.concept.id === concept.id)).lastIndexOf(true);
      if (lastAppearance !== sectionIndex) continue;
      const allChecksComplete = getLearnChecks(bank, concept.id).every((question) => isCheckComplete(question.id));
      if (allChecksComplete && !completedConceptIds.has(concept.id)) {
        completedConceptIds.add(concept.id);
        emitLearnEvent(makeEventContext(undefined, currentSection, concept.id), {
          type: 'concept_complete',
          itemId: concept.id,
          questionText: concept.title,
        });
      }
    }
    emitLearnEvent(makeEventContext(undefined, currentSection), {
      type: 'gate_passed',
      itemId: currentSection.id,
      questionText: currentSection.title ?? '',
      note: 'Section quick-checks answered or skipped; next section unlocked.',
    });
    emitLearnEvent(makeEventContext(undefined, currentSection), {
      type: 'section_complete',
      itemId: currentSection.id,
      questionText: currentSection.title ?? '',
    });
    const nextIndex = sectionIndex + 1;
    const nextSection = sections[nextIndex];
    if (nextSection) {
      const conceptIndex = nextSection.concepts[0]?.conceptIndex ?? 0;
      commitProgress({
        ...before,
        currentConceptIndex: conceptIndex,
        currentSectionIndex: nextIndex,
        completedConceptIds: [...completedConceptIds],
        summaryOpen: false,
      });
      setSectionIndex(nextIndex);
      return;
    }
    const noPractice = practiceQuestions.length === 0;
    emitLearnEvent(lessonEventContext, { type: 'lesson_complete', itemId: lesson.id, questionText: lesson.title });
    commitProgress({
      ...before,
      currentConceptIndex: currentSection.concepts.at(-1)?.conceptIndex ?? before.currentConceptIndex,
      currentSectionIndex: sectionIndex,
      completedConceptIds: [...completedConceptIds],
      status: noPractice ? 'done' : 'learning',
      summaryOpen: true,
      learnDoneAt: new Date().toISOString(),
    });
    setSummary(true);
  }, [
    bank,
    commitProgress,
    conceptComplete,
    currentSection,
    isCheckComplete,
    lessonEventContext,
    lesson.id,
    lesson.title,
    makeEventContext,
    practiceQuestions.length,
    sectionIndex,
    sections,
  ]);

  function startSectionPractice() {
    if (!currentSection || !sectionPracticeQuestions.length) return;
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = {
      ...before,
      status: 'practising',
      currentSectionIndex: sectionIndex,
      currentConceptIndex: currentSection.concepts[0]?.conceptIndex ?? before.currentConceptIndex,
      activePracticeSectionId: currentSection.id,
      activePracticeQuestionIds: undefined,
      summaryOpen: false,
      practiceStartedAt: now,
    };
    commitProgress(next);
    emitLearnEvent(makeEventContext(undefined, currentSection), {
      type: 'practice_started',
      itemId: currentSection.id,
      note: `${sectionPracticeQuestions.length} section questions`,
    });
    onStartPractice(lesson, next, sectionPracticeQuestions, currentSection.id);
  }

  function confirmSkipToPractice() {
    if (!skipPracticeOpen || !remainingPracticeQuestions.length) return;
    startWholeLessonPractice(true);
  }

  function reviewLesson() {
    const before = progressRef.current;
    if (before.currentConceptIndex !== 0 || before.currentSectionIndex !== 0 || before.summaryOpen !== false)
      commitProgress({ ...before, currentConceptIndex: 0, currentSectionIndex: 0, summaryOpen: false });
    setSummary(false);
    setSectionIndex(0);
  }

  useEffect(() => {
    function handleConceptShortcut(event: globalThis.KeyboardEvent) {
      if (!(event.altKey && (event.ctrlKey || event.metaKey))) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], .lesson-math-editor')) return;
      if (event.key === 'ArrowLeft' && (summary || sectionIndex > 0)) {
        event.preventDefault();
        goPrevious();
      } else if (event.key === 'ArrowRight' && !summary && currentSection && conceptComplete) {
        event.preventDefault();
        goNext();
      }
    }
    window.addEventListener('keydown', handleConceptShortcut);
    return () => window.removeEventListener('keydown', handleConceptShortcut);
  }, [conceptComplete, currentSection, goNext, goPrevious, sectionIndex, summary]);

  const completedPracticeIds = new Set(progress.completedPracticeQuestionIds ?? []);
  const remainingPracticeQuestions = practiceQuestions.filter((question) => !completedPracticeIds.has(question.id));
  const practiceBatch = remainingPracticeQuestions.slice(0, MAX_SESSION_EXERCISES);
  const practiceBatchCount = Math.ceil(practiceQuestions.length / MAX_SESSION_EXERCISES);
  function startWholeLessonPractice(skipLearn = false) {
    if (!practiceBatch.length) return;
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = {
      ...before,
      status: 'practising',
      activePracticeSectionId: undefined,
      activePracticeQuestionIds: practiceBatch.map((question) => question.id),
      summaryOpen: !skipLearn,
      learnDoneAt: before.learnDoneAt ?? now,
      ...(skipLearn ? { learnSkipped: { at: now } } : {}),
      practiceStartedAt: now,
    };
    commitProgress(next);
    if (skipLearn)
      emitLearnEvent(lessonEventContext, {
        type: 'lesson_skip',
        itemId: lesson.id,
        questionText: lesson.title,
        note: 'Learner chose to skip lesson checks and start practice.',
      });
    emitLearnEvent(lessonEventContext, {
      type: 'practice_started',
      itemId: lesson.id,
      note: `${practiceBatch.length} end-of-lesson questions`,
    });
    if (skipLearn) setSkipPracticeOpen(false);
    onStartPractice(lesson, next, practiceBatch);
  }

  return {
    goPrevious,
    goNext,
    reviewLesson,
    startSectionPractice,
    startWholeLessonPractice,
    skipPracticeOpen,
    setSkipPracticeOpen,
    skipPracticeInvoker,
    confirmSkipToPractice,
    remainingPracticeQuestions,
    completedPracticeIds,
    practiceBatchCount,
  };
}
