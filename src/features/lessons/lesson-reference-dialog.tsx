import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import { Button } from '../../shared/ui/button';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import { getPracticeQuestionConceptId, getPracticeQuestionOrigin, getSectionLearnChecks, getSectionPracticeQuestions } from './selectors';
import type { Lesson } from './types';
import { contentDirection, displayEducationalHeading, isRedundantOpeningHeading, languageForText, lessonUiLanguage, LessonBlockView, LessonSourceAttribution, LessonText, localizeLessonDigits, QuestionChoice, QuestionSource } from './lesson-content';
import { buildLessonSections, type LessonSection } from './lesson-sections';

function pageText(value: string, uiLang: 'fa' | 'en'): string {
  return localizeLessonDigits(value.replace(/\s*-\s*/g, '–'), uiLang);
}

function ReadOnlyQuestion({ question, title, onSelect, uiLang }: { question: BankQuestion; title: string; onSelect?: () => void; uiLang: 'fa' | 'en' }) {
  const fa = uiLang === 'fa';
  return <article className="lesson-reference-check">
    <h4><span>{title}</span><span aria-hidden="true"> · </span><bdi dir="ltr">{question.id}</bdi></h4>
    {question.prompt && <p lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></p>}
    <QuestionSource source={question.source} mode={question.mode} label={fa ? 'عبارت سؤال' : 'Question expression'} mathLabel={fa ? 'عبارت ریاضی سؤال' : 'Question math expression'} textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />
    {question.answerType === 'choice' && question.choices && <ul className="lesson-reference-choices" dir="ltr" aria-label={fa ? 'گزینه‌ها' : 'Answer choices'}>{question.choices.map((choice, index) => <li key={`${question.id}-${index}`}><QuestionChoice choice={choice} index={index} uiLang={uiLang} /></li>)}</ul>}
    {onSelect && <Button className="lesson-reference-use-question" onClick={onSelect}>{fa ? 'حل این سؤال در فضای تمرین' : 'Practice this question in the work area'}</Button>}
  </article>;
}

function pageLabel(section: LessonSection, index: number, uiLang: 'fa' | 'en'): string {
  if (section.startPage === undefined) return `${uiLang === 'fa' ? 'مفهوم' : 'Concept'} ${localizeLessonDigits(index + 1, uiLang)}`;
  const end = section.endPage ?? section.startPage;
  return `${uiLang === 'fa' ? 'صفحه‌های' : 'Pages'} ${localizeLessonDigits(section.startPage, uiLang)}${end !== section.startPage ? `–${localizeLessonDigits(end, uiLang)}` : ''}`;
}

export function LessonReferenceDialog({ lesson, bank, question, onSelectPracticeQuestion, onOpenInteractiveLesson, onOpenChange, onCloseAutoFocus }: {
  lesson: Lesson | null;
  bank: DriveBank;
  question?: BankQuestion;
  onSelectPracticeQuestion?: (questionId: string) => void;
  onOpenInteractiveLesson?: (sectionId: string) => void;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const sections = useMemo(() => lesson ? buildLessonSections(lesson) : [], [lesson]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const uiLang = lesson ? lessonUiLanguage(lesson) : 'en';
  const fa = uiLang === 'fa';
  const suggestedSection = useMemo(() => {
    if (!lesson || !question) return 0;
    const matchingQuestion = sections.findIndex((_, index) => getSectionPracticeQuestions(bank, lesson, sections, index).some(item => item.id === question.id));
    if (matchingQuestion >= 0) return matchingQuestion;
    const conceptId = question.conceptId ?? getPracticeQuestionConceptId(question, lesson.id);
    const matchingConcept = sections.findIndex(section => section.concepts.some(entry => entry.concept.id === conceptId));
    return Math.max(0, matchingConcept);
  }, [bank, lesson, question, sections]);
  const [sectionIndex, setSectionIndex] = useState(suggestedSection);
  useEffect(() => setInfoOpen(false), [lesson?.id]);
  useEffect(() => setSectionIndex(suggestedSection), [suggestedSection, lesson?.id, question?.id]);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (typeof content.scrollTo === 'function') content.scrollTo({ top: 0, behavior: 'auto' });
    else content.scrollTop = 0;
  }, [sectionIndex]);
  const section = sections[sectionIndex];
  const checks = lesson && section ? getSectionLearnChecks(bank, lesson, sections, sectionIndex) : [];
  const practice = lesson && section ? getSectionPracticeQuestions(bank, lesson, sections, sectionIndex) : [];

  return <Dialog open={!!lesson} onOpenChange={onOpenChange}>
    <DialogContent className="lesson-reference-dialog" lang={uiLang} dir={fa ? 'rtl' : 'ltr'} aria-describedby="lesson-reference-description" onCloseAutoFocus={onCloseAutoFocus}>
      {lesson && <>
        <DialogTitle lang={languageForText(lesson.title)} dir={contentDirection(lesson.title)}><LessonText text={displayEducationalHeading(lesson.title)} /></DialogTitle>
        <Button className="lesson-reference-info-toggle" aria-expanded={infoOpen} aria-controls="lesson-reference-info" onClick={() => setInfoOpen(open => !open)}>
          <span>{fa ? (infoOpen ? 'بستن اطلاعات درس' : 'اطلاعات درس') : (infoOpen ? 'Hide lesson information' : 'Lesson information')}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
        <div id="lesson-reference-info" className="lesson-reference-info-panel" hidden={!infoOpen}>
          <p className="lesson-reference-metadata" lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>
            <span>{fa ? 'منبع: ' : 'Source: '}</span><bdi lang="en" dir="ltr">{lesson.book}</bdi>
            <span className="lesson-reference-metadata-separator" aria-hidden="true"> · </span>
            <span>{fa ? 'بخش ' : 'Section '}</span><bdi dir="ltr">{lesson.section}</bdi>
            {lesson.pages && <><span className="lesson-reference-metadata-separator" aria-hidden="true"> · </span><span>{fa ? 'صفحه‌ها ' : 'Pages '}</span><bdi dir="ltr">{pageText(lesson.pages, uiLang)}</bdi></>}
          </p>
          <LessonSourceAttribution book={lesson.book} section={lesson.section} />
          <DialogDescription id="lesson-reference-description">{fa ? 'متن و شکل‌های این پنل برای مطالعه‌اند. برای پاسخ تمرین‌های کوتاه، درس تعاملی همین بخش را باز کن؛ برای تمرین‌های کتاب، دکمهٔ هر سؤال آن را در فضای تمرین باز می‌کند.' : 'This panel is a reading reference. Open this section in the interactive lesson to answer its checks, or open an exercise in the work area from its own button.'}</DialogDescription>
        </div>
        {sections.length > 0 && <nav className="lesson-reference-navigation" aria-label={fa ? 'پیمایش بخش‌های درس' : 'Lesson section navigation'}>
          <Button onClick={() => setSectionIndex(index => Math.max(0, index - 1))} disabled={sectionIndex === 0}>{fa ? '→ بخش قبلی' : '← Previous section'}</Button>
          <p aria-live="polite">{fa ? 'بخش' : 'Section'} {localizeLessonDigits(sectionIndex + 1, uiLang)} {fa ? 'از' : 'of'} {localizeLessonDigits(sections.length, uiLang)} · {section ? pageLabel(section, sectionIndex, uiLang) : ''}</p>
          <Button onClick={() => setSectionIndex(index => Math.min(sections.length - 1, index + 1))} disabled={sectionIndex >= sections.length - 1}>{fa ? 'بخش بعدی ←' : 'Next section →'}</Button>
        </nav>}
        <div ref={contentRef} className="lesson-reference-content" role="region" aria-label={fa ? 'محتوای درس‌نامه' : 'Lesson content'} tabIndex={0}>
          {section?.title && <h2 className="lesson-reference-section-title" lang={languageForText(section.title)} dir={contentDirection(section.title)}><LessonText text={displayEducationalHeading(section.title)} /></h2>}
          {section?.concepts.map(({ concept, conceptIndex, blocks }) => {
            let lastPage: number | undefined;
            return <section className="lesson-reference-concept" key={concept.id} aria-labelledby={`reference-concept-${concept.id}`}>
              <p className="lesson-section-label" lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>
                <span>{fa ? 'مفهوم' : 'Concept'} {localizeLessonDigits(conceptIndex + 1, uiLang)} {fa ? 'از' : 'of'} {localizeLessonDigits(lesson.concepts.length, uiLang)}</span>
                {concept.pages && <span>{fa ? 'صفحه‌های' : 'Pages'} <bdi dir="ltr">{pageText(concept.pages, uiLang)}</bdi></span>}
              </p>
              <h2 id={`reference-concept-${concept.id}`} lang={languageForText(concept.title)} dir={contentDirection(concept.title)}><LessonText text={displayEducationalHeading(concept.title)} /></h2>
              <div className="lesson-concept-blocks">
                {blocks.map((block, index) => {
                  if (isRedundantOpeningHeading(concept, block, index)) return null;
                  const blockPage = block.type === 'unsupported' ? undefined : block.page;
                  const showPage = typeof blockPage === 'number' && blockPage !== lastPage;
                  if (typeof blockPage === 'number') lastPage = blockPage;
                  return <Fragment key={`${concept.id}:${index}`}>
                    {showPage && <p className="lesson-reference-source-page" lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>{fa ? 'صفحهٔ' : 'Page'} <bdi dir="ltr">{localizeLessonDigits(blockPage!, uiLang)}</bdi></p>}
                    <LessonBlockView block={block} blockKey={`${concept.id}:${index}`} revealed={block.type === 'example' ? block.steps.length : 0} onReveal={() => undefined} uiLang={uiLang} />
                  </Fragment>;
                })}
              </div>
            </section>;
          })}
          {checks.length > 0 && <section className="lesson-reference-checks" aria-label={fa ? 'تمرین‌های بررسی همین بخش' : 'Quick checks for this section'}>
            <h3>{fa ? 'تمرین‌های کوتاه همین بخش' : 'Quick checks for this section'}</h3>
            {checks.map(item => <ReadOnlyQuestion key={item.id} question={item} title={fa ? 'تمرین بررسی' : 'Check'} uiLang={uiLang} />)}
          </section>}
          {practice.length > 0 && <section className="lesson-reference-checks lesson-reference-practice" aria-label={fa ? 'تمرین‌های تکمیلی همین بخش' : 'Practice for this section'}>
            <h3>{fa ? 'تمرین‌های همین بخش' : 'Practice for this section'}</h3>
            <p className="lesson-reference-practice-note">{fa ? 'تمرین‌های کتاب با اولویت آمده‌اند؛ پس از آن‌ها تمرین‌های تکمیلی قرار دارند.' : 'Textbook exercises come first, followed by extra practice.'}</p>
            {practice.map(item => <ReadOnlyQuestion
              key={item.id}
              question={item}
              title={getPracticeQuestionOrigin(item, lesson.id) === 'textbook' ? (fa ? 'تمرین کتاب' : 'Textbook exercise') : (fa ? 'تمرین تکمیلی' : 'Extra practice')}
              uiLang={uiLang}
              onSelect={onSelectPracticeQuestion && item.id !== question?.id ? () => onSelectPracticeQuestion(item.id) : undefined}
            />)}
          </section>}
        </div>
        <div className="dialog-actions">
          {onOpenInteractiveLesson && section && <Button variant="default" className="lesson-reference-interactive-button" onClick={() => onOpenInteractiveLesson(section.id)}>{fa ? 'رفتن به درس تعاملی همین بخش' : 'Open this section in the interactive lesson'}</Button>}
          <Button onClick={() => onOpenChange(false)}>{fa ? 'بازگشت به سؤال' : 'Back to question'}</Button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
