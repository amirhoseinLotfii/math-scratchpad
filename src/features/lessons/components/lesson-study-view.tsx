import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { BankQuestion } from '../../../domain/entities/drive-bank.types';
import { Button } from '../../../shared/ui/button';
import type { ScratchStore } from '../../math-editor/store/editor-store';
import { sectionAnchorId } from '../../progress/reading-position-anchors';
import { contentDirection, displayEducationalHeading, languageForText, LessonText, localizeLessonDigits } from '../lesson-content';
import type { LessonSection } from '../lesson-sections';
import { SPLIT_MAX, SPLIT_MIN, type LessonWorkItem } from '../lesson-work-items';
import { LessonWorkPane } from '../lesson-work-pane';
import { formatSectionPages } from '../model/lesson-screen-helpers';
import { getPracticeQuestionOrigin } from '../selectors';
import type { Lesson, LessonProgress, LessonWorkAnswer } from '../types';
import { LessonSectionContent } from './lesson-section-content';

export function LessonStudyView({
  lesson,
  sections,
  sectionIndex,
  currentSection,
  progress,
  uiLang,
  split,
  paneMode,
  splitRatio,
  updateSplitRatio,
  startResize,
  resizeByKey,
  splitRef,
  paneTab,
  selectPaneTab,
  handleTabKeys,
  tabRefs,
  headingRef,
  lessonScrollRef,
  checks,
  sectionPracticeQuestions,
  practiceQuestions,
  workItems,
  selectedWorkItem,
  selectWorkItem,
  setSelectedWorkKey,
  getWorkStore,
  setWork,
  renderCheck,
  renderExampleWork,
  revealStep,
  revealWorkSolution,
  engageWorkItem,
  leaveWorkItem,
  isCheckComplete,
  conceptComplete,
  goPrevious,
  goNext,
  startSectionPractice,
  skipPracticeInvoker,
  onOpenSkipPractice,
}: {
  lesson: Lesson;
  sections: LessonSection[];
  sectionIndex: number;
  currentSection: LessonSection;
  progress: LessonProgress;
  uiLang: 'fa' | 'en';
  split: boolean;
  paneMode: 'split' | 'tabs';
  splitRatio: number;
  updateSplitRatio: (value: number) => void;
  startResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  resizeByKey: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  splitRef: RefObject<HTMLDivElement | null>;
  paneTab: 'lesson' | 'work';
  selectPaneTab: (next: 'lesson' | 'work', moveFocus?: boolean) => void;
  handleTabKeys: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
  tabRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  lessonScrollRef: RefObject<HTMLDivElement | null>;
  checks: BankQuestion[];
  sectionPracticeQuestions: BankQuestion[];
  practiceQuestions: BankQuestion[];
  workItems: LessonWorkItem[];
  selectedWorkItem: LessonWorkItem | undefined;
  selectWorkItem: (key: string) => void;
  setSelectedWorkKey: (key: string) => void;
  getWorkStore: (item: LessonWorkItem) => ScratchStore;
  setWork: (key: string, answer: LessonWorkAnswer) => void;
  renderCheck: (question: BankQuestion, inline?: boolean) => ReactNode;
  renderExampleWork: (blockKey: string) => ReactNode;
  revealStep: (key: string, value: number) => void;
  revealWorkSolution: (item: LessonWorkItem) => void;
  engageWorkItem: (item: LessonWorkItem) => void;
  leaveWorkItem: (item: LessonWorkItem) => void;
  isCheckComplete: (questionId: string) => boolean;
  conceptComplete: boolean;
  goPrevious: () => void;
  goNext: () => void;
  startSectionPractice: () => void;
  skipPracticeInvoker: RefObject<HTMLButtonElement | null>;
  onOpenSkipPractice: () => void;
}) {
  const fa = uiLang === 'fa';
  const currentSectionPages = formatSectionPages(currentSection);
  const sectionBookQuestions = sectionPracticeQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'textbook').length;
  const sectionGeneratedQuestions = sectionPracticeQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'generated').length;
  const sectionQuestionWord = sectionPracticeQuestions.length === 1 ? (fa ? 'سؤال' : 'question') : (fa ? 'سؤال' : 'questions');

  const sectionHeading = (
    <>
      <div className="lesson-concept-heading" aria-live="polite">
        <p className="lesson-section-label">{fa ? 'بخش' : 'Section'} {localizeLessonDigits(sectionIndex + 1, uiLang)} {fa ? 'از' : 'of'} {localizeLessonDigits(sections.length, uiLang)}</p>
        {currentSectionPages && <span className="lesson-pages">{fa ? 'صفحه‌های' : 'Pages'} {currentSectionPages}</span>}
      </div>
      <h2
        id="lesson-concept-title"
        ref={headingRef}
        tabIndex={-1}
        lang={currentSection.title ? languageForText(currentSection.title) : currentSection.concepts.length === 1 ? languageForText(currentSection.concepts[0].concept.title) : uiLang}
        dir={currentSection.title ? contentDirection(currentSection.title) : currentSection.concepts.length === 1 ? contentDirection(currentSection.concepts[0].concept.title) : fa ? 'rtl' : 'ltr'}
      >
        {currentSection.title ? <LessonText text={displayEducationalHeading(currentSection.title)} /> : currentSection.concepts.length === 1 ? <LessonText text={displayEducationalHeading(currentSection.concepts[0].concept.title)} /> : fa ? 'درس این بخش' : 'This section'}
      </h2>
    </>
  );

  return (
    <>
      {!split && (
        <div className="lesson-pane-tabs" role="tablist" aria-label={fa ? 'درس‌نامه یا کار من' : 'Lesson or your work'}>
          <button type="button" role="tab" id="lesson-tab-lesson" ref={node => { tabRefs.current[0] = node; }} aria-controls={paneTab === 'lesson' ? 'lesson-panel-lesson' : undefined} aria-selected={paneTab === 'lesson'} tabIndex={paneTab === 'lesson' ? 0 : -1} className="lesson-pane-tab" onClick={() => selectPaneTab('lesson')} onKeyDown={event => handleTabKeys(event, 0)}>{fa ? 'درس‌نامه' : 'Lesson'}</button>
          <button type="button" role="tab" id="lesson-tab-work" ref={node => { tabRefs.current[1] = node; }} aria-controls={paneTab === 'work' ? 'lesson-panel-work' : undefined} aria-selected={paneTab === 'work'} tabIndex={paneTab === 'work' ? 0 : -1} className="lesson-pane-tab" onClick={() => selectPaneTab('work')} onKeyDown={event => handleTabKeys(event, 1)}>{fa ? 'کار من' : 'Your work'}{workItems.length ? ` · ${localizeLessonDigits(workItems.length, uiLang)}` : ''}</button>
        </div>
      )}
      <div ref={splitRef} className={`lesson-split ${split ? 'lesson-split-wide' : 'lesson-split-tabs'}`} data-pane-mode={paneMode} style={split ? { ['--lesson-split' as string]: `${splitRatio}%` } : undefined}>
        {(split || paneTab === 'lesson') && (
          <div className="lesson-split-lesson" id="lesson-panel-lesson" {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-lesson' })}>
            {split && (
              <div className="lesson-split-lesson-header">
                <section className="lesson-concept lesson-pane-fixed-heading" aria-labelledby="lesson-concept-title">{sectionHeading}</section>
                <div className="lesson-split-size-controls" role="group" aria-label={fa ? 'عرض پنل درس‌نامه' : 'Lesson panel width'}>
                  <Button size="icon" variant="ghost" disabled={splitRatio <= SPLIT_MIN} aria-label={fa ? 'باریک‌تر کردن درس‌نامه' : 'Narrower lesson panel'} title={fa ? 'باریک‌تر کردن درس‌نامه' : 'Narrower lesson panel'} onClick={() => updateSplitRatio(splitRatio - 5)}><ChevronsLeft aria-hidden="true" /></Button>
                  <Button size="icon" variant="ghost" disabled={splitRatio >= SPLIT_MAX} aria-label={fa ? 'پهن‌تر کردن درس‌نامه' : 'Wider lesson panel'} title={fa ? 'پهن‌تر کردن درس‌نامه' : 'Wider lesson panel'} onClick={() => updateSplitRatio(splitRatio + 5)}><ChevronsRight aria-hidden="true" /></Button>
                </div>
              </div>
            )}
            <div ref={lessonScrollRef} className={split ? 'lesson-split-lesson-scroll' : 'lesson-split-lesson-flow'} {...(split ? { role: 'region', 'aria-label': fa ? 'محتوای درس‌نامه' : 'Lesson content', tabIndex: 0 } : {})}>
              <section className="lesson-concept" data-anchor-id={sectionAnchorId(currentSection.id)} aria-labelledby="lesson-concept-title">
                {!split && sectionHeading}
                <LessonSectionContent section={currentSection} revealedSteps={progress.revealedSteps} onReveal={revealStep} uiLang={uiLang} hideSingleConceptHeading={!currentSection.title && currentSection.concepts.length === 1} renderExampleWork={renderExampleWork} />
              </section>
              <section className="lesson-section-practice" aria-label={fa ? 'تمرین‌های همین بخش' : 'Practice for this section'}>
                <h2>{fa ? 'تمرین‌های همین بخش' : 'Practice for this section'}</h2>
                {sectionPracticeQuestions.length > 0 ? (
                  <>
                    <p>{fa ? <>{localizeLessonDigits(sectionPracticeQuestions.length, uiLang)} سؤال: {localizeLessonDigits(sectionBookQuestions, uiLang)} تمرین کتاب و {localizeLessonDigits(sectionGeneratedQuestions, uiLang)} تمرین تکمیلی. ابتدا تمرین‌های کتاب آمده‌اند.</> : <>{sectionPracticeQuestions.length} questions: {sectionBookQuestions} textbook and {sectionGeneratedQuestions} extra. Textbook questions come first.</>}</p>
                    {progress.completedSectionIds?.includes(currentSection.id) && <p className="lesson-section-practice-done" role="status">{fa ? 'تمرین‌های این بخش انجام شده‌اند.' : 'This section’s practice is complete.'}</p>}
                    <Button className="lesson-section-practice-button" onClick={startSectionPractice}>{fa ? 'شروع تمرین این بخش' : 'Practice this section'} · {localizeLessonDigits(sectionPracticeQuestions.length, uiLang)} {sectionQuestionWord}</Button>
                  </>
                ) : (
                  <p>{fa ? 'برای این بخش تمرین جداگانه‌ای ثبت نشده است.' : 'No practice questions are assigned to this section.'}</p>
                )}
              </section>
              {checks.length > 0 && (
                <section className="lesson-checks" aria-label={fa ? 'تمرین کوتاه همین بخش' : 'Quick checks for this section'}>
                  <h2>{fa ? 'تمرین کوتاه همین بخش' : 'Quick checks for this section'}</h2>
                  {split ? (
                    <ul className="lesson-check-links">
                      {checks.map(question => (
                        <li key={question.id}>
                          <Button variant="ghost" className="lesson-check-link" aria-current={selectedWorkItem?.key === `q:${question.id}` ? 'true' : undefined} onClick={() => setSelectedWorkKey(`q:${question.id}`)}>
                            <bdi dir="ltr">{question.id}</bdi> · <span lang={languageForText(question.prompt || question.source)} dir={contentDirection(question.prompt || question.source)}><LessonText text={question.prompt || question.source} /></span>
                            <span className="lesson-check-link-status">{progress.answeredCheckIds.includes(question.id) ? (fa ? 'پاسخ داده شد' : 'Answered') : progress.skippedChecks.some(item => item.questionId === question.id) ? (fa ? 'ردشده' : 'Skipped') : (fa ? 'حل در «کار من»' : 'Solve in Your work')}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : checks.map(question => renderCheck(question, true))}
                </section>
              )}
              <nav className="lesson-concept-navigation" aria-label={fa ? 'پیمایش بخش‌های درس' : 'Lesson section navigation'}>
                <Button onClick={goPrevious} disabled={sectionIndex === 0}>{fa ? '→ بخش قبلی' : '← Previous section'}</Button>
                <Button className="lesson-primary-action" onClick={goNext} disabled={!conceptComplete}>{fa ? 'بخش بعدی ←' : 'Next section →'}</Button>
              </nav>
              {!conceptComplete && <p className="lesson-next-hint" role="status">{fa ? `برای فعال شدن «بخش بعدی»، ${localizeLessonDigits(checks.filter(question => !isCheckComplete(question.id)).length, uiLang)} تمرین کوتاه باقی‌مانده را پاسخ بده یا رد کن.` : `Answer or skip the ${checks.filter(question => !isCheckComplete(question.id)).length} remaining quick check(s) to unlock the next section.`}</p>}
              {practiceQuestions.length > 0 && <Button ref={skipPracticeInvoker} className="lesson-skip-practice" variant="ghost" onClick={onOpenSkipPractice}>{fa ? 'رفتن به تمرین پایانی کل درس' : 'Skip to practice'}</Button>}
            </div>
          </div>
        )}
        {split && <div className="lesson-split-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={fa ? 'تغییر عرض درس‌نامه' : 'Resize lesson panel'} aria-valuemin={30} aria-valuemax={70} aria-valuenow={splitRatio} onPointerDown={startResize} onKeyDown={resizeByKey} onDoubleClick={() => updateSplitRatio(50)} />}
        {(split || paneTab === 'work') && (
          <div className="lesson-split-work" id="lesson-panel-work" {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-work' })}>
            <LessonWorkPane
              items={workItems}
              selected={selectedWorkItem}
              onSelect={selectWorkItem}
              uiLang={uiLang}
              getWorkStore={getWorkStore}
              onWork={setWork}
              renderCheck={renderCheck}
              savedSteps={key => { const answer = progress.workAnswers?.[key]; return answer?.type === 'math' ? answer.steps : undefined; }}
              savedAnswer={key => progress.workAnswers?.[key]}
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
