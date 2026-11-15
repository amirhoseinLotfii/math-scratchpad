import { BookOpen } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import { type Lesson, type LessonProgress } from './types';
import { getLearnChecks } from './selectors';
import { contentDirection, displayEducationalHeading, languageForText, LessonText, localizeLessonDigits } from './lesson-content';
import { MathDisplay } from '../math-editor/components/math-display';
import { MAX_SESSION_EXERCISES } from '../../model';

import type { RefObject } from 'react';

function ReviewQuestionContent({ question }: { question: BankQuestion }) {
  if (question.prompt)
    return (
      <span lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}>
        <LessonText text={question.prompt} />
      </span>
    );
  if (question.mode === 'math')
    return (
      <bdi dir="ltr">
        <MathDisplay latex={question.source} label="Question expression" display={false} />
      </bdi>
    );
  return (
    <span lang={languageForText(question.source)} dir={contentDirection(question.source)}>
      <LessonText text={question.source} />
    </span>
  );
}

export function LessonSummary({
  bank,
  lesson,
  summaryHeadingRef,
  fa,
  uiLang,
  progress,
  practiceQuestions,
  wholeBookQuestions,
  wholeGeneratedQuestions,
  practiceBatchCount,
  remainingPracticeQuestions,
  completedPracticeIds,
  startWholeLessonPractice,
  reviewLesson,
}: {
  bank: DriveBank;
  lesson: Lesson;
  summaryHeadingRef: RefObject<HTMLHeadingElement | null>;
  fa: boolean;
  uiLang: 'fa' | 'en';
  progress: LessonProgress;
  practiceQuestions: BankQuestion[];
  wholeBookQuestions: number;
  wholeGeneratedQuestions: number;
  practiceBatchCount: number;
  remainingPracticeQuestions: BankQuestion[];
  completedPracticeIds: Set<string>;
  startWholeLessonPractice: () => void;
  reviewLesson: () => void;
}) {
  const bookQuestionCount = localizeLessonDigits(wholeBookQuestions, uiLang);
  return (
    <section className="lesson-summary" aria-labelledby="lesson-summary-title">
      <div className="lesson-summary-heading">
        <BookOpen aria-hidden="true" />
        <h2 id="lesson-summary-title" ref={summaryHeadingRef} tabIndex={-1}>
          {fa ? 'جمع‌بندی درس' : 'Lesson summary'}
        </h2>
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
              {localizeLessonDigits(
                getLearnChecks(bank, concept.id).filter((question) => progress.answeredCheckIds.includes(question.id)).length,
                uiLang,
              )}{' '}
              {fa ? 'از' : 'of'} {localizeLessonDigits(getLearnChecks(bank, concept.id).length, uiLang)}{' '}
              {fa ? 'تمرین پاسخ داده شد' : 'checks answered'}
            </span>
          </li>
        ))}
      </ul>
      {lesson.concepts.some((concept) =>
        getLearnChecks(bank, concept.id).some(
          (question) => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1,
        ),
      ) && (
        <section className="lesson-summary-review" aria-label={fa ? 'تمرین‌های نیازمند مرور' : 'Checks to review'}>
          <h3>{fa ? 'مرور دوباره' : 'Review again'}</h3>
          <ul>
            {lesson.concepts.flatMap((concept) =>
              getLearnChecks(bank, concept.id)
                .filter((question) => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1)
                .map((question) => (
                  <li key={question.id}>
                    <bdi dir="ltr">{question.id}</bdi> · <ReviewQuestionContent question={question} />
                  </li>
                )),
            )}
          </ul>
        </section>
      )}
      {progress.skippedChecks.length > 0 && (
        <section className="lesson-summary-skipped" aria-label={fa ? 'تمرین‌های ردشده' : 'Skipped checks'}>
          <h3>{fa ? 'تمرین‌های ردشده' : 'Skipped checks'}</h3>
          <ul>
            {progress.skippedChecks.map((item) => (
              <li key={item.questionId}>
                <bdi dir="ltr">{item.questionId}</bdi>
              </li>
            ))}
          </ul>
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
                {localizeLessonDigits(practiceQuestions.length, uiLang)} سؤال در دسترس است؛ ابتدا {bookQuestionCount} سؤال کتاب و سپس{' '}
                {localizeLessonDigits(wholeGeneratedQuestions, uiLang)} تمرین تکمیلی نمایش داده می‌شود.
                {practiceBatchCount > 1 && (
                  <> هر جلسه حداکثر {localizeLessonDigits(MAX_SESSION_EXERCISES, uiLang)} سؤال دارد؛ پس از هر جلسه می‌توانی ادامه بدهی.</>
                )}
              </>
            ) : (
              <>
                {practiceQuestions.length} questions: {wholeBookQuestions} textbook exercises, followed by {wholeGeneratedQuestions} extra
                practice questions.
                {practiceBatchCount > 1 && ` Each session holds up to ${MAX_SESSION_EXERCISES} questions; continue after each batch.`}
              </>
            )}
          </p>
          {remainingPracticeQuestions.length > 0 && (
            <Button className="lesson-primary-action" onClick={() => startWholeLessonPractice()}>
              {fa
                ? completedPracticeIds.size
                  ? `ادامهٔ تمرین پایانی · ${localizeLessonDigits(remainingPracticeQuestions.length, uiLang)} سؤال`
                  : 'شروع تمرین پایانی'
                : completedPracticeIds.size
                  ? `Continue end-of-lesson practice · ${remainingPracticeQuestions.length} questions`
                  : 'Start practice'}
            </Button>
          )}
          {remainingPracticeQuestions.length === 0 && (
            <p className="lesson-section-practice-done" role="status">
              {fa ? 'همهٔ سؤال‌های تمرین پایانی انجام شده‌اند.' : 'All end-of-lesson practice questions are complete.'}
            </p>
          )}
        </section>
      )}
      <Button className="lesson-review-action" onClick={reviewLesson}>
        {fa ? 'مرور دوبارهٔ درس' : 'Review lesson'}
      </Button>
    </section>
  );
}
