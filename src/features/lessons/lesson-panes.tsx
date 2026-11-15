import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import { localizeLessonDigits } from './lesson-content';
import { sectionAnchorId } from '../progress/reading-position-anchors';
import { SPLIT_MAX, SPLIT_MIN, type LessonWorkItem } from './lesson-work-items';
import { LessonWorkPane } from './lesson-work-pane';

import { LessonSectionContent } from './lesson-section-content';
import type { useLessonPanes } from './use-lesson-panes';
import type { useLessonWork } from './use-lesson-work';
import { LessonSectionHeading } from './lesson-section-heading';
import { LessonSectionExercises } from './lesson-section-exercises';
import type { ReactNode, RefObject } from 'react';
import type { LessonSection } from './lesson-sections';
import type { LessonProgress } from './types';
import { LessonGateHint, LessonSectionNavigation } from './lesson-section-navigation';
export function LessonPanes({
  fa,
  uiLang,
  pane,
  selectedWorkItem,
  workItems,
  currentSection,
  headingRef,
  sections,
  sectionIndex,
  currentSectionPages,
  progress,
  revealStep,
  renderExampleWork,
  sectionPracticeQuestions,
  sectionBookQuestions,
  sectionGeneratedQuestions,
  startSectionPractice,
  checks,
  renderCheck,
  goPrevious,
  goNext,
  conceptComplete,
  isCheckComplete,
  practiceQuestions,
  skipPracticeInvoker,
  setSkipPracticeOpen,
  selectWorkItem,
  getWorkStore,
  setWork,
  engageWorkItem,
  leaveWorkItem,
  revealWorkSolution,
}: {
  fa: boolean;
  uiLang: 'fa' | 'en';
  pane: ReturnType<typeof useLessonPanes>;
  selectedWorkItem?: LessonWorkItem;
  workItems: LessonWorkItem[];
  currentSection: LessonSection;
  headingRef: RefObject<HTMLHeadingElement | null>;
  sections: LessonSection[];
  sectionIndex: number;
  currentSectionPages?: string;
  progress: LessonProgress;
  revealStep: (key: string, value: number) => void;
  renderExampleWork: (key: string) => ReactNode;
  sectionPracticeQuestions: BankQuestion[];
  sectionBookQuestions: number;
  sectionGeneratedQuestions: number;
  startSectionPractice: () => void;
  checks: BankQuestion[];
  renderCheck: (q: BankQuestion, inline?: boolean) => ReactNode;
  goPrevious: () => void;
  goNext: () => void;
  conceptComplete: boolean;
  isCheckComplete: (id: string) => boolean;
  practiceQuestions: BankQuestion[];
  skipPracticeInvoker: RefObject<HTMLButtonElement | null>;
  setSkipPracticeOpen: (open: boolean) => void;
  selectWorkItem: (key: string) => void;
  getWorkStore: ReturnType<typeof useLessonWork>['getWorkStore'];
  setWork: ReturnType<typeof useLessonWork>['setWork'];
  engageWorkItem: (item: LessonWorkItem) => void;
  leaveWorkItem: (item: LessonWorkItem) => void;
  revealWorkSolution: (item: LessonWorkItem) => void;
}) {
  const {
    split,
    paneTab,
    splitRatio,
    tabRefs,
    selectPaneTab,
    handleTabKeys,
    splitRef,
    paneMode,
    updateSplitRatio,
    lessonScrollRef,
    setSelectedWorkKey,
    startResize,
    resizeByKey,
  } = pane;
  return (
    <>
      {' '}
      {!split && (
        <div className="lesson-pane-tabs" role="tablist" aria-label={fa ? 'درس‌نامه یا کار من' : 'Lesson or your work'}>
          <button
            type="button"
            role="tab"
            id="lesson-tab-lesson"
            ref={(node) => {
              tabRefs.current[0] = node;
            }}
            aria-controls={paneTab === 'lesson' ? 'lesson-panel-lesson' : undefined}
            aria-selected={paneTab === 'lesson'}
            tabIndex={paneTab === 'lesson' ? 0 : -1}
            className="lesson-pane-tab"
            onClick={() => selectPaneTab('lesson')}
            onKeyDown={(event) => handleTabKeys(event, 0)}
          >
            {fa ? 'درس‌نامه' : 'Lesson'}
          </button>
          <button
            type="button"
            role="tab"
            id="lesson-tab-work"
            ref={(node) => {
              tabRefs.current[1] = node;
            }}
            aria-controls={paneTab === 'work' ? 'lesson-panel-work' : undefined}
            aria-selected={paneTab === 'work'}
            tabIndex={paneTab === 'work' ? 0 : -1}
            className="lesson-pane-tab"
            onClick={() => selectPaneTab('work')}
            onKeyDown={(event) => handleTabKeys(event, 1)}
          >
            {fa ? 'کار من' : 'Your work'}
            {workItems.length ? ` · ${localizeLessonDigits(workItems.length, uiLang)}` : ''}
          </button>
        </div>
      )}
      <div
        ref={splitRef}
        className={`lesson-split ${split ? 'lesson-split-wide' : 'lesson-split-tabs'}`}
        data-pane-mode={paneMode}
        style={split ? { ['--lesson-split' as string]: `${splitRatio}%` } : undefined}
      >
        {(split || paneTab === 'lesson') && (
          <div
            className="lesson-split-lesson"
            id="lesson-panel-lesson"
            {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-lesson' })}
          >
            {split && (
              <div className="lesson-split-lesson-header">
                <section className="lesson-concept lesson-pane-fixed-heading" aria-labelledby="lesson-concept-title">
                  <LessonSectionHeading
                    fa={fa}
                    uiLang={uiLang}
                    sectionIndex={sectionIndex}
                    sectionCount={sections.length}
                    currentSectionPages={currentSectionPages ?? ''}
                    currentSection={currentSection}
                    headingRef={headingRef}
                  />
                </section>
                <div className="lesson-split-size-controls" role="group" aria-label={fa ? 'عرض پنل درس‌نامه' : 'Lesson panel width'}>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={splitRatio <= SPLIT_MIN}
                    aria-label={fa ? 'باریک‌تر کردن درس‌نامه' : 'Narrower lesson panel'}
                    title={fa ? 'باریک‌تر کردن درس‌نامه' : 'Narrower lesson panel'}
                    onClick={() => updateSplitRatio(splitRatio - 5)}
                  >
                    <ChevronsLeft aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={splitRatio >= SPLIT_MAX}
                    aria-label={fa ? 'پهن‌تر کردن درس‌نامه' : 'Wider lesson panel'}
                    title={fa ? 'پهن‌تر کردن درس‌نامه' : 'Wider lesson panel'}
                    onClick={() => updateSplitRatio(splitRatio + 5)}
                  >
                    <ChevronsRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
            <div
              ref={lessonScrollRef}
              className={split ? 'lesson-split-lesson-scroll' : 'lesson-split-lesson-flow'}
              {...(split ? { role: 'region', 'aria-label': fa ? 'محتوای درس‌نامه' : 'Lesson content', tabIndex: 0 } : {})}
            >
              <section
                className="lesson-concept"
                data-anchor-id={sectionAnchorId(currentSection.id)}
                aria-labelledby="lesson-concept-title"
              >
                {!split && (
                  <LessonSectionHeading
                    fa={fa}
                    uiLang={uiLang}
                    sectionIndex={sectionIndex}
                    sectionCount={sections.length}
                    currentSectionPages={currentSectionPages ?? ''}
                    currentSection={currentSection}
                    headingRef={headingRef}
                  />
                )}
                <LessonSectionContent
                  section={currentSection}
                  revealedSteps={progress.revealedSteps}
                  onReveal={revealStep}
                  uiLang={uiLang}
                  hideSingleConceptHeading={!currentSection.title && currentSection.concepts.length === 1}
                  renderExampleWork={renderExampleWork}
                />
              </section>
              <LessonSectionExercises
                fa={fa}
                uiLang={uiLang}
                sectionPracticeQuestions={sectionPracticeQuestions}
                sectionBookQuestions={sectionBookQuestions}
                sectionGeneratedQuestions={sectionGeneratedQuestions}
                progress={progress}
                currentSection={currentSection}
                startSectionPractice={startSectionPractice}
                checks={checks}
                split={split}
                selectedWorkItem={selectedWorkItem}
                setSelectedWorkKey={setSelectedWorkKey}
                renderCheck={renderCheck}
              />
              <LessonSectionNavigation
                fa={fa}
                sectionIndex={sectionIndex}
                conceptComplete={conceptComplete}
                goPrevious={goPrevious}
                goNext={goNext}
              />
              {!conceptComplete && (
                <LessonGateHint fa={fa} uiLang={uiLang} remaining={checks.filter((q) => !isCheckComplete(q.id)).length} />
              )}
              {practiceQuestions.length > 0 && (
                <Button
                  ref={skipPracticeInvoker}
                  className="lesson-skip-practice"
                  variant="ghost"
                  onClick={() => setSkipPracticeOpen(true)}
                >
                  {fa ? 'رفتن به تمرین پایانی کل درس' : 'Skip to practice'}
                </Button>
              )}
            </div>
          </div>
        )}
        {split && (
          <div
            className="lesson-split-handle"
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={fa ? 'تغییر عرض درس‌نامه' : 'Resize lesson panel'}
            aria-valuemin={30}
            aria-valuemax={70}
            aria-valuenow={splitRatio}
            onPointerDown={startResize}
            onKeyDown={resizeByKey}
            onDoubleClick={() => updateSplitRatio(50)}
          />
        )}
        {(split || paneTab === 'work') && (
          <div
            className="lesson-split-work"
            id="lesson-panel-work"
            {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-work' })}
          >
            <LessonWorkPane
              items={workItems}
              selected={selectedWorkItem}
              onSelect={selectWorkItem}
              uiLang={uiLang}
              getWorkStore={getWorkStore}
              onWork={setWork}
              renderCheck={renderCheck}
              savedSteps={(key) => {
                const answer = progress.workAnswers?.[key];
                return answer?.type === 'math' ? answer.steps : undefined;
              }}
              savedAnswer={(key) => progress.workAnswers?.[key]}
              onFocusItem={engageWorkItem}
              onBlurItem={leaveWorkItem}
              onRevealSolution={revealWorkSolution}
            />
          </div>
        )}
      </div>
    </>
  );
}
