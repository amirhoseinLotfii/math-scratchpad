import type { RefObject } from 'react';
import { BookOpen } from 'lucide-react';
import type { BankQuestion, DriveBank } from '../../../domain/entities/drive-bank.types';
import { Button } from '../../../shared/ui/button';
import { MAX_SESSION_EXERCISES } from '../../math-editor/model/model';
import { contentDirection, displayEducationalHeading, languageForText, LessonText, localizeLessonDigits } from '../lesson-content';
import { getLearnChecks, getPracticeQuestionOrigin } from '../selectors';
import type { Lesson, LessonProgress } from '../types';
import { ReviewQuestionContent } from './lesson-section-content';

export function LessonSummaryView({
  bank,
  lesson,
  progress,
  uiLang,
  summaryHeadingRef,
  practiceQuestions,
  remainingPracticeQuestions,
  completedPracticeIds,
  onStartWholeLessonPractice,
  onReviewLesson,
}: {
  bank: DriveBank;
  lesson: Lesson;
  progress: LessonProgress;
  uiLang: 'fa' | 'en';
  summaryHeadingRef: RefObject<HTMLHeadingElement | null>;
  practiceQuestions: BankQuestion[];
  remainingPracticeQuestions: BankQuestion[];
  completedPracticeIds: Set<string>;
  onStartWholeLessonPractice: () => void;
  onReviewLesson: () => void;
}) {
  const fa = uiLang === 'fa';
  const wholeBookQuestions = practiceQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'textbook').length;
  const wholeGeneratedQuestions = practiceQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'generated').length;
  const practiceBatchCount = Math.ceil(practiceQuestions.length / MAX_SESSION_EXERCISES);

  return (
    <section className="lesson-summary" aria-labelledby="lesson-summary-title">
      <div className="lesson-summary-heading">
        <BookOpen aria-hidden="true" />
        <h2 id="lesson-summary-title" ref={summaryHeadingRef} tabIndex={-1}>{fa ? 'جمع‌بندی درس' : 'Lesson summary'}</h2>
      </div>
      <ul className="lesson-summary-concepts">
        {lesson.concepts.map((concept, index) => (
          <li key={concept.id}>
            <span>
              <span>{localizeLessonDigits(index + 1, uiLang)}. </span>
              <bdi lang={languageForText(concept.title)} dir={contentDirection(concept.title)}>
                <LessonText text={displayEducationalHeading(concept.title)} />
              </bdi>
            </span>
            <span className="lesson-summary-count">
              {localizeLessonDigits(getLearnChecks(bank, concept.id).filter(question => progress.answeredCheckIds.includes(question.id)).length, uiLang)}{' '}
              {fa ? 'از' : 'of'}{' '}
              {localizeLessonDigits(getLearnChecks(bank, concept.id).length, uiLang)}{' '}
              {fa ? 'تمرین پاسخ داده شد' : 'checks answered'}
            </span>
          </li>
        ))}
      </ul>
      {lesson.concepts.some(concept => getLearnChecks(bank, concept.id).some(question => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1)) && (
        <section className="lesson-summary-review" aria-label={fa ? 'تمرین‌های نیازمند مرور' : 'Checks to review'}>
          <h3>{fa ? 'مرور دوباره' : 'Review again'}</h3>
          <ul>
            {lesson.concepts.flatMap(concept =>
              getLearnChecks(bank, concept.id)
                .filter(question => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1)
                .map(question => <li key={question.id}><bdi dir="ltr">{question.id}</bdi> · <ReviewQuestionContent question={question} /></li>),
            )}
          </ul>
        </section>
      )}
      {progress.skippedChecks.length > 0 && (
        <section className="lesson-summary-skipped" aria-label={fa ? 'تمرین‌های ردشده' : 'Skipped checks'}>
          <h3>{fa ? 'تمرین‌های ردشده' : 'Skipped checks'}</h3>
          <ul>{progress.skippedChecks.map(item => <li key={item.questionId}><bdi dir="ltr">{item.questionId}</bdi></li>)}</ul>
        </section>
      )}
      {practiceQuestions.length === 0 ? (
        <p className="lesson-no-practice">{fa ? 'هنوز تمرینی ثبت نشده است.' : 'No practice questions yet.'}</p>
      ) : (
        <section className="lesson-section-practice">
          <h3>{fa ? 'تمرین پایانی درس' : 'End-of-lesson practice'}</h3>
          <p>
            {fa ? (
              <>
                {localizeLessonDigits(practiceQuestions.length, uiLang)} سؤال در دسترس است؛ ابتدا {localizeLessonDigits(wholeBookQuestions, uiLang)} سؤال کتاب و سپس {localizeLessonDigits(wholeGeneratedQuestions, uiLang)} تمرین تکمیلی نمایش داده می‌شود.
                {practiceBatchCount > 1 && <> هر جلسه حداکثر {localizeLessonDigits(MAX_SESSION_EXERCISES, uiLang)} سؤال دارد؛ پس از هر جلسه می‌توانی ادامه بدهی.</>}
              </>
            ) : (
              <>
                {practiceQuestions.length} questions: {wholeBookQuestions} textbook exercises, followed by {wholeGeneratedQuestions} extra practice questions.
                {practiceBatchCount > 1 && ` Each session holds up to ${MAX_SESSION_EXERCISES} questions; continue after each batch.`}
              </>
            )}
          </p>
          {remainingPracticeQuestions.length > 0 && (
            <Button className="lesson-primary-action" onClick={onStartWholeLessonPractice}>
              {fa
                ? (completedPracticeIds.size ? `ادامهٔ تمرین پایانی · ${localizeLessonDigits(remainingPracticeQuestions.length, uiLang)} سؤال` : 'شروع تمرین پایانی')
                : (completedPracticeIds.size ? `Continue end-of-lesson practice · ${remainingPracticeQuestions.length} questions` : 'Start practice')}
            </Button>
          )}
          {remainingPracticeQuestions.length === 0 && (
            <p className="lesson-section-practice-done" role="status">{fa ? 'همهٔ سؤال‌های تمرین پایانی انجام شده‌اند.' : 'All end-of-lesson practice questions are complete.'}</p>
          )}
        </section>
      )}
      <Button className="lesson-review-action" onClick={onReviewLesson}>{fa ? 'مرور دوبارهٔ درس' : 'Review lesson'}</Button>
    </section>
  );
}
