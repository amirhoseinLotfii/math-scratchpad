import { useCallback, useMemo, useRef, useState } from 'react';
import type { BankQuestion, DriveBank } from '../../domain/entities/drive-bank.types';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import { Button } from '../../shared/ui/button';
import type { ActivityTracker } from '../../sync/activity-tracker';
import type { LearnEventContext } from '../../sync/events';
import { LessonAvailability } from './components/lesson-availability';
import { LessonHeader } from './components/lesson-header';
import { InlineExampleEditor } from './components/lesson-section-content';
import { LessonSkipDialogs } from './components/lesson-skip-dialogs';
import { LessonStudyView } from './components/lesson-study-view';
import { LessonSummaryView } from './components/lesson-summary-view';
import { useLessonAnswers } from './hooks/use-lesson-answers';
import { resolveInitialSectionIndex, resolveInitialSummary, useLessonNavigation } from './hooks/use-lesson-navigation';
import { useLessonSplit } from './hooks/use-lesson-split';
import { useLessonTelemetry } from './hooks/use-lesson-telemetry';
import { LessonCheck } from './lesson-check';
import { lessonUiLanguage } from './lesson-content';
import { LessonKeyboardContext } from './lesson-math-check';
import { buildLessonSections } from './lesson-sections';
import { buildSectionWorkItems, resolveSelectedWorkItem } from './lesson-work-items';
import { newProgress, type LessonRestoreTarget } from './model/lesson-screen-helpers';
import { getPracticeQuestions, getSectionLearnChecks, getSectionPracticeQuestions } from './selectors';
import type { Lesson, LessonProgress } from './types';

export type { LessonRestoreTarget };

type Props = {
  bank: DriveBank | null;
  lesson: Lesson | null;
  loading?: boolean;
  initialProgress?: LessonProgress;
  restore?: LessonRestoreTarget;
  onBack: () => void;
  onProgress?: (progress: LessonProgress) => void;
  onStartPractice: (lesson: Lesson, progress: LessonProgress, questions: BankQuestion[], sectionId?: string) => void;
  practiceError?: string;
  progressMessage?: string;
  activityTracker?: ActivityTracker;
  eventContext?: LearnEventContext;
};

type ReadyProps = Props & { bank: DriveBank; lesson: Lesson };

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
}: ReadyProps) {
  const phone = useWorkspaceLayout() === 'phone';
  const uiLang = lessonUiLanguage(lesson), fa = uiLang === 'fa';
  const sections = useMemo(() => buildLessonSections(lesson), [lesson]);
  const [lessonInfoOpen, setLessonInfoOpen] = useState(false);
  const practiceQuestions = useMemo(() => getPracticeQuestions(bank, lesson.id), [bank, lesson.id]);
  const [progress, setProgress] = useState<LessonProgress>(() => initialProgress ?? newProgress(lesson.id));
  const progressRef = useRef(progress);
  const [sectionIndex, setSectionIndex] = useState(() => resolveInitialSectionIndex(lesson, sections, initialProgress, restore));
  const [summary, setSummary] = useState(() => resolveInitialSummary(lesson, initialProgress));

  const commitProgress = useCallback((next: LessonProgress) => {
    progressRef.current = next;
    setProgress(next);
    onProgress?.(next);
  }, [onProgress]);

  const currentSection = sections[sectionIndex];
  const checks = useMemo(() => (currentSection ? getSectionLearnChecks(bank, lesson, sections, sectionIndex) : []), [bank, lesson, sections, sectionIndex, currentSection]);
  const sectionPracticeQuestions = useMemo(() => (currentSection ? getSectionPracticeQuestions(bank, lesson, sections, sectionIndex) : []), [bank, lesson, sections, sectionIndex, currentSection]);
  const workItems = useMemo(() => buildSectionWorkItems(currentSection, checks, sectionPracticeQuestions), [currentSection, checks, sectionPracticeQuestions]);
  const allQuestions = useMemo(() => new Map(bank.questions.map(question => [question.id, question])), [bank.questions]);

  const splitState = useLessonSplit(fa, Object.keys(initialProgress?.workAnswers ?? {}).length > 0);
  const telemetry = useLessonTelemetry({ bank, lesson, currentSection, summary, allQuestions, activityTracker, eventContext });
  const answers = useLessonAnswers({ phone, initialWorkAnswers: initialProgress?.workAnswers, progress, progressRef, commitProgress, currentSection, checks, workItems, allQuestions, telemetry });
  const selectedWorkItem = resolveSelectedWorkItem(workItems, answers.selectedWorkKey);
  const nav = useLessonNavigation({
    bank, lesson, sections, initialProgress, restore, split: splitState.split,
    progress, progressRef, commitProgress, practiceQuestions, sectionPracticeQuestions,
    isCheckComplete: answers.isCheckComplete, conceptComplete: answers.conceptComplete,
    lessonEventContext: telemetry.lessonEventContext, makeEventContext: telemetry.makeEventContext,
    onStartPractice, sectionIndex, setSectionIndex, summary, setSummary,
  });

  const renderExampleWork = (blockKey: string) => {
    const item = workItems.find(candidate => candidate.key === `ex:${blockKey}` && candidate.kind === 'example');
    if (!item) return null;
    const open = answers.activeInlineExampleKey === item.key;
    return (
      <div className="lesson-example-work" aria-label={fa ? 'حل همین مثال' : 'Solve this example'}>
        <Button
          aria-expanded={!splitState.split && open}
          onClick={() => {
            answers.setSelectedWorkKey(item.key);
            if (splitState.split) {
              requestAnimationFrame(() => document.querySelector<HTMLElement>('.lesson-work-select')?.focus({ preventScroll: true }));
            } else {
              answers.setActiveInlineExampleKey(previous => (previous === item.key ? null : item.key));
              if (!open) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const current = [...document.querySelectorAll<HTMLElement>('.lesson-example-with-work')].find(
                    element => element.querySelector('.lesson-example-work .lesson-math-editor') !== null,
                  );
                  current?.querySelector<HTMLElement>('.lesson-example-work math-field')?.focus({ preventScroll: false });
                }));
              }
            }
          }}
        >
          {splitState.split ? (fa ? 'حل در پنل کار من' : 'Solve in Your work') : open ? (fa ? 'بستن حل این مثال' : 'Close example editor') : (fa ? 'حل این مثال در همین‌جا' : 'Solve this example here')}
        </Button>
        {!splitState.split && open && <InlineExampleEditor item={item} uiLang={uiLang} getWorkStore={answers.getWorkStore} onWork={answers.setWork} />}
      </div>
    );
  };

  const firstMathCheckId = checks.find(question => question.answerType === 'math' || (!question.answerType && question.mode === 'math'))?.id;
  const currentInlineCheckId = checks.some(question => question.id === answers.activeInlineCheckId) ? answers.activeInlineCheckId : firstMathCheckId;
  const renderCheck = (question: BankQuestion, inline = false) => (
    <LessonCheck
      key={question.id}
      question={question}
      uiLang={uiLang}
      compact={inline && question.id !== currentInlineCheckId && (question.answerType === 'math' || (!question.answerType && question.mode === 'math'))}
      onExpand={() => {
        answers.setActiveInlineCheckId(question.id);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const article = [...document.querySelectorAll<HTMLElement>('.lesson-check')].find(element => element.dataset.checkId === question.id);
          article?.querySelector<HTMLElement>('math-field')?.focus({ preventScroll: false });
        }));
      }}
      mathStore={question.answerType === 'math' || (!question.answerType && question.mode === 'math') ? answers.getMathStore(question) : undefined}
      answer={progress.checkAnswers?.[question.id]}
      answered={progress.answeredCheckIds.includes(question.id)}
      confidence={progress.confidenceByCheckId?.[question.id]}
      skipped={progress.skippedChecks.some(item => item.questionId === question.id)}
      onAnswer={answers.setAnswer}
      onConfidence={answers.setConfidence}
      onSkip={questionId => {
        answers.skipCheckInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        answers.setSkipQuestion(allQuestions.get(questionId) ?? null);
      }}
      onEngage={telemetry.engageCheck}
      onLeave={telemetry.leaveCheck}
    />
  );

  return (
    <section className="lesson-screen" aria-label={fa ? 'درس‌نامه' : 'Lesson notes'} lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>
      <LessonHeader
        lesson={lesson} uiLang={uiLang} lessonInfoOpen={lessonInfoOpen}
        onToggleInfo={() => setLessonInfoOpen(open => !open)} onBack={onBack}
        summary={summary} practiceError={practiceError} progressMessage={progressMessage}
      />
      {summary ? (
        <LessonSummaryView
          bank={bank} lesson={lesson} progress={progress} uiLang={uiLang}
          summaryHeadingRef={nav.summaryHeadingRef} practiceQuestions={practiceQuestions}
          remainingPracticeQuestions={nav.remainingPracticeQuestions} completedPracticeIds={nav.completedPracticeIds}
          onStartWholeLessonPractice={() => nav.startWholeLessonPractice()} onReviewLesson={nav.reviewLesson}
        />
      ) : currentSection ? (
        <LessonStudyView
          lesson={lesson} sections={sections} sectionIndex={sectionIndex} currentSection={currentSection}
          progress={progress} uiLang={uiLang} split={splitState.split} paneMode={splitState.paneMode}
          splitRatio={splitState.splitRatio} updateSplitRatio={splitState.updateSplitRatio}
          startResize={splitState.startResize} resizeByKey={splitState.resizeByKey} splitRef={splitState.splitRef}
          paneTab={splitState.paneTab} selectPaneTab={splitState.selectPaneTab} handleTabKeys={splitState.handleTabKeys}
          tabRefs={splitState.tabRefs} headingRef={nav.headingRef} lessonScrollRef={nav.lessonScrollRef}
          checks={checks} sectionPracticeQuestions={sectionPracticeQuestions} practiceQuestions={practiceQuestions}
          workItems={workItems} selectedWorkItem={selectedWorkItem} selectWorkItem={answers.selectWorkItem}
          setSelectedWorkKey={answers.setSelectedWorkKey} getWorkStore={answers.getWorkStore} setWork={answers.setWork}
          renderCheck={renderCheck} renderExampleWork={renderExampleWork} revealStep={answers.revealStep}
          revealWorkSolution={answers.revealWorkSolution} engageWorkItem={telemetry.engageWorkItem}
          leaveWorkItem={telemetry.leaveWorkItem} isCheckComplete={answers.isCheckComplete}
          conceptComplete={answers.conceptComplete} goPrevious={nav.goPrevious} goNext={nav.goNext}
          startSectionPractice={nav.startSectionPractice} skipPracticeInvoker={nav.skipPracticeInvoker}
          onOpenSkipPractice={() => nav.setSkipPracticeOpen(true)}
        />
      ) : null}
      <LessonSkipDialogs
        uiLang={uiLang} skipQuestion={answers.skipQuestion} onCloseSkipQuestion={() => answers.setSkipQuestion(null)}
        onConfirmSkip={answers.confirmSkip} skipCheckInvoker={answers.skipCheckInvoker}
        skipPracticeOpen={nav.skipPracticeOpen} onOpenSkipPracticeChange={nav.setSkipPracticeOpen}
        onConfirmSkipToPractice={nav.confirmSkipToPractice} skipPracticeInvoker={nav.skipPracticeInvoker}
        headingRef={nav.headingRef}
      />
    </section>
  );
}

/** Handles the brief unavailable/loading states around the synchronously parsed bank content. */
export function LessonScreen(props: Props) {
  const [activeKeyboardId, setActiveKeyboardId] = useState<string | null>(null);
  if (props.loading || !props.bank || !props.lesson) {
    return <LessonAvailability loading={!!props.loading} onBack={props.onBack} />;
  }
  return (
    <LessonKeyboardContext.Provider value={{ activeId: activeKeyboardId, setActiveId: setActiveKeyboardId }}>
      <ReadyLessonScreen {...props as ReadyProps} />
    </LessonKeyboardContext.Provider>
  );
}
