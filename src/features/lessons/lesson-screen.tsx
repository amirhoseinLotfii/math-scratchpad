import { LessonAvailability } from './lesson-availability';
import { useLessonRenderers } from './use-lesson-renderers';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getPracticeQuestionOrigin, getSectionLearnChecks, getSectionPracticeQuestions } from './selectors';
import { lessonUiLanguage, localizeLessonDigits } from './lesson-content';
import { LessonKeyboardContext } from './lesson-math-check';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import { sectionAnchorId } from '../progress/reading-position-anchors';
import { useOptionalReadingPositionContext } from '../progress/reading-position-context';
import { buildSectionWorkItems, resolveSelectedWorkItem } from './lesson-work-items';

import { LessonPanes } from './lesson-panes';
import type { ReadyLessonProps, LessonScreenProps } from './lesson-screen-types';
import { LessonHeader } from './lesson-header';
import { LessonSummary } from './lesson-summary';
import { LessonSkipDialogs } from './lesson-skip-dialogs';
import { useLessonProgress } from './use-lesson-progress';
import { useLessonActivity } from './use-lesson-activity';
import { useLessonPanes } from './use-lesson-panes';
import { useLessonNavigation } from './use-lesson-navigation';
import { useLessonWork } from './use-lesson-work';
import { useLessonGate } from './use-lesson-gate';
export type { LessonRestoreTarget } from './lesson-screen-types';
function ReadyLessonScreen({
  bank,
  lesson,
  initialProgress,
  restore,
  onBack,
  onProgress,
  onStartPractice,
  practiceError,
  progressMessage,
  activityTracker,
  eventContext,
}: ReadyLessonProps) {
  const layout = useWorkspaceLayout(),
    phone = layout === 'phone';
  const uiLang = lessonUiLanguage(lesson),
    fa = uiLang === 'fa';
  const trackPosition = useOptionalReadingPositionContext()?.trackPosition;
  const {
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
  } = useLessonProgress({ bank, lesson, initialProgress, restore, onProgress, onStartPractice });
  const pane = useLessonPanes({ initialProgress, restore, summary, sectionIndex, headingRef, summaryHeadingRef, fa });
  const { split, selectedWorkKey, setSelectedWorkKey } = pane;
  const pendingAnswerEdits = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingWorkEdits = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Depend on the stable writer, not the context object: the provider re-renders
  // whenever a position is saved, and an object dependency would loop.
  useEffect(() => {
    if (!trackPosition) return;
    void trackPosition({
      chapterId: bank.chapter?.id ?? (bank.chapter?.number != null ? String(bank.chapter.number) : bank.bank_id),
      lessonId: lesson.id,
      sectionId: currentSection?.id,
      contentAnchorId: currentSection ? sectionAnchorId(currentSection.id) : undefined,
      contentVersion: bank.version,
      lastActivity: 'reading',
    });
  }, [bank.bank_id, bank.chapter?.id, bank.chapter?.number, bank.version, currentSection, lesson.id, trackPosition]);
  const checks = useMemo(
    () => (currentSection ? getSectionLearnChecks(bank, lesson, sections, sectionIndex) : []),
    [bank, lesson, sections, sectionIndex, currentSection],
  );
  const sectionPracticeQuestions = useMemo(
    () => (currentSection ? getSectionPracticeQuestions(bank, lesson, sections, sectionIndex) : []),
    [bank, lesson, sections, sectionIndex, currentSection],
  );
  const workItems = useMemo(
    () => buildSectionWorkItems(currentSection, checks, sectionPracticeQuestions),
    [currentSection, checks, sectionPracticeQuestions],
  );
  const selectedWorkItem = resolveSelectedWorkItem(workItems, selectedWorkKey);
  const allQuestions = useMemo(() => new Map(bank.questions.map((question) => [question.id, question])), [bank.questions]);

  const {
    lessonEventContext,
    makeEventContext,
    nextAttemptNo,
    markSectionGateAttempt,
    engageCheck,
    leaveCheck,
    engageWorkItem,
    leaveWorkItem,
  } = useLessonActivity({
    bank,
    lesson,
    currentSection,
    summary,
    activityTracker,
    eventContext,
    allQuestions,
    pendingAnswerEdits,
    pendingWorkEdits,
  });
  const { getMathStore, getWorkStore, setWork } = useLessonWork({
    phone,
    progressRef,
    commitProgress,
    workItems,
    currentSection,
    makeEventContext,
    nextAttemptNo,
    pendingWorkEdits,
  });
  const { skipQuestion, setSkipQuestion, skipCheckInvoker, isCheckComplete, conceptComplete, setAnswer, setConfidence, confirmSkip } =
    useLessonGate({
      allQuestions,
      checks,
      currentSection,
      progress,
      progressRef,
      commitProgress,
      makeEventContext,
      markSectionGateAttempt,
      nextAttemptNo,
      pendingAnswerEdits,
    });
  const {
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
  } = useLessonNavigation({
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
  });
  const currentSectionPages = currentSection?.startPage
    ? currentSection.startPage === currentSection.endPage
      ? localizeLessonDigits(currentSection.startPage)
      : `${localizeLessonDigits(currentSection.startPage)}–${localizeLessonDigits(currentSection.endPage ?? currentSection.startPage + 1)}`
    : '';
  const sectionBookQuestions = sectionPracticeQuestions.filter(
    (question) => getPracticeQuestionOrigin(question, lesson.id) === 'textbook',
  ).length;
  const sectionGeneratedQuestions = sectionPracticeQuestions.filter(
    (question) => getPracticeQuestionOrigin(question, lesson.id) === 'generated',
  ).length;
  const wholeBookQuestions = practiceQuestions.filter((question) => getPracticeQuestionOrigin(question, lesson.id) === 'textbook').length;
  const wholeGeneratedQuestions = practiceQuestions.filter(
    (question) => getPracticeQuestionOrigin(question, lesson.id) === 'generated',
  ).length;

  const { revealStep, selectWorkItem, revealWorkSolution, renderExampleWork, renderCheck } = useLessonRenderers({
    currentSection,
    progress,
    progressRef,
    commitProgress,
    makeEventContext,
    workItems,
    checks,
    split,
    uiLang,
    fa,
    setSelectedWorkKey,
    getWorkStore,
    getMathStore,
    setWork,
    engageCheck,
    engageWorkItem,
    leaveCheck,
    setAnswer,
    setConfidence,
    skipCheckInvoker,
    setSkipQuestion,
    allQuestions,
  });
  return (
    <section className="lesson-screen" aria-label={fa ? 'درس‌نامه' : 'Lesson notes'} lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>
      <LessonHeader
        onBack={onBack}
        lesson={lesson}
        summary={summary}
        practiceError={practiceError}
        progressMessage={progressMessage}
        fa={fa}
      />

      {summary ? (
        <LessonSummary
          bank={bank}
          lesson={lesson}
          summaryHeadingRef={summaryHeadingRef}
          fa={fa}
          uiLang={uiLang}
          progress={progress}
          practiceQuestions={practiceQuestions}
          wholeBookQuestions={wholeBookQuestions}
          wholeGeneratedQuestions={wholeGeneratedQuestions}
          practiceBatchCount={practiceBatchCount}
          remainingPracticeQuestions={remainingPracticeQuestions}
          completedPracticeIds={completedPracticeIds}
          startWholeLessonPractice={startWholeLessonPractice}
          reviewLesson={reviewLesson}
        />
      ) : currentSection ? (
        <>
          <LessonPanes
            fa={fa}
            uiLang={uiLang}
            pane={pane}
            selectedWorkItem={selectedWorkItem}
            workItems={workItems}
            currentSection={currentSection}
            headingRef={headingRef}
            sections={sections}
            sectionIndex={sectionIndex}
            currentSectionPages={currentSectionPages}
            progress={progress}
            revealStep={revealStep}
            renderExampleWork={renderExampleWork}
            sectionPracticeQuestions={sectionPracticeQuestions}
            sectionBookQuestions={sectionBookQuestions}
            sectionGeneratedQuestions={sectionGeneratedQuestions}
            startSectionPractice={startSectionPractice}
            checks={checks}
            renderCheck={renderCheck}
            goPrevious={goPrevious}
            goNext={goNext}
            conceptComplete={conceptComplete}
            isCheckComplete={isCheckComplete}
            practiceQuestions={practiceQuestions}
            skipPracticeInvoker={skipPracticeInvoker}
            setSkipPracticeOpen={setSkipPracticeOpen}
            selectWorkItem={selectWorkItem}
            getWorkStore={getWorkStore}
            setWork={setWork}
            engageWorkItem={engageWorkItem}
            leaveWorkItem={leaveWorkItem}
            revealWorkSolution={revealWorkSolution}
          />
        </>
      ) : null}

      <LessonSkipDialogs
        skipQuestion={skipQuestion}
        setSkipQuestion={setSkipQuestion}
        skipPracticeOpen={skipPracticeOpen}
        setSkipPracticeOpen={setSkipPracticeOpen}
        skipCheckInvoker={skipCheckInvoker}
        skipPracticeInvoker={skipPracticeInvoker}
        headingRef={headingRef}
        fa={fa}
        confirmSkip={confirmSkip}
        confirmSkipToPractice={confirmSkipToPractice}
      />
    </section>
  );
}

/** Handles the brief unavailable/loading states around the synchronously parsed bank content. */
export function LessonScreen(props: LessonScreenProps) {
  const [activeKeyboardId, setActiveKeyboardId] = useState<string | null>(null);
  if (props.loading || !props.bank || !props.lesson) {
    return <LessonAvailability loading={!!props.loading} onBack={props.onBack} />;
  }
  return (
    <LessonKeyboardContext.Provider value={{ activeId: activeKeyboardId, setActiveId: setActiveKeyboardId }}>
      <ReadyLessonScreen {...(props as ReadyLessonProps)} />
    </LessonKeyboardContext.Provider>
  );
}
