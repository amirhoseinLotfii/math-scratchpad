import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DriveBank } from '../drive-bank/drive-bank';
import { type Lesson, type LessonProgress } from './types';
import { getPracticeQuestions } from './selectors';
import { buildLessonSections } from './lesson-sections';

import type { ReadyLessonProps, LessonRestoreTarget } from './lesson-screen-types';

type Options = {
  bank: DriveBank;
  lesson: Lesson;
  initialProgress?: LessonProgress;
  restore?: LessonRestoreTarget;
  onProgress?: ReadyLessonProps['onProgress'];
  onStartPractice: ReadyLessonProps['onStartPractice'];
};
function newProgress(lessonId: string): LessonProgress {
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

export function useLessonProgress({ bank, lesson, initialProgress, restore, onProgress, onStartPractice }: Options) {
  const sections = useMemo(() => buildLessonSections(lesson), [lesson]);
  const practiceQuestions = useMemo(() => getPracticeQuestions(bank, lesson.id), [bank, lesson.id]);
  const initialSectionIndex = useMemo(() => {
    // An explicit continue request wins over stored lesson progress: the learner
    // asked for the section they were reading, not the first unfinished one.
    if (restore?.sectionId) {
      const restored = sections.findIndex((section) => section.id === restore.sectionId);
      if (restored >= 0) return restored;
    }
    const saved = initialProgress?.currentSectionIndex;
    if (Number.isInteger(saved) && saved! >= 0 && saved! < sections.length) return saved!;
    const conceptId = lesson.concepts[initialProgress?.currentConceptIndex ?? 0]?.id;
    const found = sections.findIndex((section) => section.concepts.some((entry) => entry.concept.id === conceptId));
    return Math.max(0, found);
  }, [initialProgress, lesson.concepts, restore?.sectionId, sections]);
  const [progress, setProgress] = useState<LessonProgress>(() => initialProgress ?? newProgress(lesson.id));
  const progressRef = useRef(progress);
  const [sectionIndex, setSectionIndex] = useState(initialSectionIndex);
  const [summary, setSummary] = useState(
    initialProgress?.summaryOpen ??
      (lesson.concepts.length === 0 ||
        initialProgress?.status === 'done' ||
        (!!initialProgress?.learnDoneAt &&
          lesson.concepts.length > 0 &&
          lesson.concepts.every((concept) => initialProgress.completedConceptIds.includes(concept.id)))),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const autoStartedLesson = useRef<string | null>(null);
  const commitProgress = useCallback(
    (next: LessonProgress) => {
      progressRef.current = next;
      setProgress(next);
      onProgress?.(next);
    },
    [onProgress],
  );

  const currentSection = sections[sectionIndex];
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
  }, [commitProgress, lesson, onStartPractice, practiceQuestions]);

  return {
    sections,
    practiceQuestions,
    progress,
    progressRef,
    sectionIndex,
    setSectionIndex,
    summary,
    setSummary,
    currentSection,
    commitProgress,
    headingRef,
    summaryHeadingRef,
  };
}
