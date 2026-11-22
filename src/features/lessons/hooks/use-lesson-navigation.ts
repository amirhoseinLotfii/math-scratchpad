import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { BankQuestion, DriveBank } from '../../../domain/entities/drive-bank.types';
import { emitLearnEvent, type LearnEventContext } from '../../../sync/events';
import { MAX_SESSION_EXERCISES } from '../../math-editor/model/model';
import type { LessonSection } from '../lesson-sections';
import { resolveInitialSectionIndex, resolveInitialSummary, type LessonRestoreTarget } from '../model/lesson-screen-helpers';
import { getLearnChecks } from '../selectors';
import type { Lesson, LessonProgress } from '../types';

export function useLessonNavigation({
  bank,
  lesson,
  sections,
  initialProgress,
  restore,
  split,
  progress,
  progressRef,
  commitProgress,
  practiceQuestions,
  sectionPracticeQuestions,
  isCheckComplete,
  conceptComplete,
  lessonEventContext,
  makeEventContext,
  onStartPractice,
  sectionIndex,
  setSectionIndex,
  summary,
  setSummary,
}: {
  bank: DriveBank;
  lesson: Lesson;
  sections: LessonSection[];
  initialProgress?: LessonProgress;
  restore?: LessonRestoreTarget;
  split: boolean;
  progress: LessonProgress;
  progressRef: MutableRefObject<LessonProgress>;
  commitProgress: (next: LessonProgress) => void;
  practiceQuestions: BankQuestion[];
  sectionPracticeQuestions: BankQuestion[];
  isCheckComplete: (questionId: string) => boolean;
  conceptComplete: boolean;
  lessonEventContext: LearnEventContext;
  makeEventContext: (question?: BankQuestion, section?: LessonSection, conceptId?: string) => LearnEventContext;
  onStartPractice: (lesson: Lesson, progress: LessonProgress, questions: BankQuestion[], sectionId?: string) => void;
  sectionIndex: number;
  setSectionIndex: (next: number) => void;
  summary: boolean;
  setSummary: (next: boolean) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const lessonScrollRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);
  const autoStartedLesson = useRef<string | null>(null);
  const [skipPracticeOpen, setSkipPracticeOpen] = useState(false);
  const skipPracticeInvoker = useRef<HTMLButtonElement>(null);

  const currentSection = sections[sectionIndex];
  const completedPracticeIds = new Set(progress.completedPracticeQuestionIds ?? []);
  const remainingPracticeQuestions = practiceQuestions.filter(question => !completedPracticeIds.has(question.id));
  const practiceBatch = remainingPracticeQuestions.slice(0, MAX_SESSION_EXERCISES);

  useEffect(() => {
    const target = (summary ? summaryHeadingRef : headingRef).current;
    target?.focus({ preventScroll: true });
    // In split mode the section heading lives in the pinned pane header.
    // Reset only the lesson body when the learner changes sections; never move the outer document.
    if (split && !summary) document.querySelector<HTMLElement>('.lesson-split-lesson-scroll')?.scrollTo?.({ top: 0, behavior: 'auto' });
    else target?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [sectionIndex, summary, split]);

  // One-shot restoration for an explicit continue request. It runs after the
  // section heading effect above, so scrolling to the stored anchor wins. It
  // never focuses the math field or opens the keyboard.
  useEffect(() => {
    if (!restore || summary || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const frame = requestAnimationFrame(() => {
      const container = lessonScrollRef.current;
      const anchorId = restore.contentAnchorId;
      if (anchorId) {
        const anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-anchor-id]'));
        const anchor = anchors.find(element => element.dataset.anchorId === anchorId);
        if (anchor) { anchor.scrollIntoView?.({ block: 'start', behavior: 'auto' }); return; }
      }
      if (typeof restore.scrollOffset !== 'number') return;
      if (container) container.scrollTop = restore.scrollOffset;
      else window.scrollTo?.({ top: restore.scrollOffset, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [restore, summary]);

  useEffect(() => {
    if (lesson.concepts.length !== 0 || autoStartedLesson.current === lesson.id) return;
    autoStartedLesson.current = lesson.id;
    const now = new Date().toISOString();
    if (practiceQuestions.length === 0) {
      commitProgress({ ...progressRef.current, status: 'done', learnDoneAt: now });
      return;
    }
    const next: LessonProgress = { ...progressRef.current, status: 'practising', learnDoneAt: now, practiceStartedAt: now };
    commitProgress(next);
    onStartPractice(lesson, next, practiceQuestions);
  }, [commitProgress, lesson, onStartPractice, practiceQuestions, progressRef]);

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
  }, [commitProgress, progressRef, sectionIndex, sections, setSectionIndex, setSummary, summary]);

  const goNext = useCallback(() => {
    if (!currentSection || !conceptComplete) return;
    const before = progressRef.current;
    const completedConceptIds = new Set(before.completedConceptIds);
    for (const { concept } of currentSection.concepts) {
      const lastAppearance = sections.map(section => section.concepts.some(entry => entry.concept.id === concept.id)).lastIndexOf(true);
      if (lastAppearance !== sectionIndex) continue;
      const allChecksComplete = getLearnChecks(bank, concept.id).every(question => isCheckComplete(question.id));
      if (allChecksComplete && !completedConceptIds.has(concept.id)) {
        completedConceptIds.add(concept.id);
        emitLearnEvent(makeEventContext(undefined, currentSection, concept.id), { type: 'concept_complete', itemId: concept.id, questionText: concept.title });
      }
    }
    emitLearnEvent(makeEventContext(undefined, currentSection), { type: 'gate_passed', itemId: currentSection.id, questionText: currentSection.title ?? '', note: 'Section quick-checks answered or skipped; next section unlocked.' });
    emitLearnEvent(makeEventContext(undefined, currentSection), { type: 'section_complete', itemId: currentSection.id, questionText: currentSection.title ?? '' });
    const nextIndex = sectionIndex + 1;
    const nextSection = sections[nextIndex];
    if (nextSection) {
      const conceptIndex = nextSection.concepts[0]?.conceptIndex ?? 0;
      commitProgress({ ...before, currentConceptIndex: conceptIndex, currentSectionIndex: nextIndex, completedConceptIds: [...completedConceptIds], summaryOpen: false });
      setSectionIndex(nextIndex);
      return;
    }
    const noPractice = practiceQuestions.length === 0;
    emitLearnEvent(lessonEventContext, { type: 'lesson_complete', itemId: lesson.id, questionText: lesson.title });
    commitProgress({ ...before, currentConceptIndex: currentSection.concepts.at(-1)?.conceptIndex ?? before.currentConceptIndex, currentSectionIndex: sectionIndex, completedConceptIds: [...completedConceptIds], status: noPractice ? 'done' : 'learning', summaryOpen: true, learnDoneAt: new Date().toISOString() });
    setSummary(true);
  }, [bank, commitProgress, conceptComplete, currentSection, isCheckComplete, lesson.id, lesson.title, lessonEventContext, makeEventContext, practiceQuestions.length, progressRef, sectionIndex, sections, setSectionIndex, setSummary]);

  function startSectionPractice() {
    if (!currentSection || !sectionPracticeQuestions.length) return;
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = { ...before, status: 'practising', currentSectionIndex: sectionIndex, currentConceptIndex: currentSection.concepts[0]?.conceptIndex ?? before.currentConceptIndex, activePracticeSectionId: currentSection.id, activePracticeQuestionIds: undefined, summaryOpen: false, practiceStartedAt: now };
    commitProgress(next);
    emitLearnEvent(makeEventContext(undefined, currentSection), { type: 'practice_started', itemId: currentSection.id, note: `${sectionPracticeQuestions.length} section questions` });
    onStartPractice(lesson, next, sectionPracticeQuestions, currentSection.id);
  }

  function startWholeLessonPractice(skipLearn = false) {
    if (!practiceBatch.length) return;
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = { ...before, status: 'practising', activePracticeSectionId: undefined, activePracticeQuestionIds: practiceBatch.map(question => question.id), summaryOpen: !skipLearn, learnDoneAt: before.learnDoneAt ?? now, ...(skipLearn ? { learnSkipped: { at: now } } : {}), practiceStartedAt: now };
    commitProgress(next);
    if (skipLearn) emitLearnEvent(lessonEventContext, { type: 'lesson_skip', itemId: lesson.id, questionText: lesson.title, note: 'Learner chose to skip lesson checks and start practice.' });
    emitLearnEvent(lessonEventContext, { type: 'practice_started', itemId: lesson.id, note: `${practiceBatch.length} end-of-lesson questions` });
    if (skipLearn) setSkipPracticeOpen(false);
    onStartPractice(lesson, next, practiceBatch);
  }

  function confirmSkipToPractice() {
    if (!skipPracticeOpen || !remainingPracticeQuestions.length) return;
    startWholeLessonPractice(true);
  }

  function reviewLesson() {
    const before = progressRef.current;
    if (before.currentConceptIndex !== 0 || before.currentSectionIndex !== 0 || before.summaryOpen !== false) commitProgress({ ...before, currentConceptIndex: 0, currentSectionIndex: 0, summaryOpen: false });
    setSummary(false);
    setSectionIndex(0);
  }

  useEffect(() => {
    function handleConceptShortcut(event: globalThis.KeyboardEvent) {
      if (!(event.altKey && (event.ctrlKey || event.metaKey))) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], .lesson-math-editor')) return;
      if (event.key === 'ArrowLeft' && (summary || sectionIndex > 0)) { event.preventDefault(); goPrevious(); }
      else if (event.key === 'ArrowRight' && !summary && currentSection && conceptComplete) { event.preventDefault(); goNext(); }
    }
    window.addEventListener('keydown', handleConceptShortcut);
    return () => window.removeEventListener('keydown', handleConceptShortcut);
  }, [conceptComplete, currentSection, goNext, goPrevious, sectionIndex, summary]);

  return {
    headingRef, summaryHeadingRef, lessonScrollRef,
    skipPracticeOpen, setSkipPracticeOpen, skipPracticeInvoker,
    goPrevious, goNext, startSectionPractice, startWholeLessonPractice,
    confirmSkipToPractice, reviewLesson, remainingPracticeQuestions, completedPracticeIds,
  };
}

export { resolveInitialSectionIndex, resolveInitialSummary };
