import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import { contentDirection, languageForText, LessonText, localizeLessonDigits } from './lesson-content';
import { type LessonWorkItem } from './lesson-work-items';

import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { LessonSection } from './lesson-sections';
import type { LessonProgress } from './types';
export type { LessonRestoreTarget } from './lesson-screen-types';

export function LessonSectionExercises({
  fa,
  uiLang,
  sectionPracticeQuestions,
  sectionBookQuestions,
  sectionGeneratedQuestions,
  progress,
  currentSection,
  startSectionPractice,
  checks,
  split,
  selectedWorkItem,
  setSelectedWorkKey,
  renderCheck,
}: {
  fa: boolean;
  uiLang: 'fa' | 'en';
  sectionPracticeQuestions: BankQuestion[];
  sectionBookQuestions: number;
  sectionGeneratedQuestions: number;
  progress: LessonProgress;
  currentSection: LessonSection;
  startSectionPractice: () => void;
  checks: BankQuestion[];
  split: boolean;
  selectedWorkItem?: LessonWorkItem;
  setSelectedWorkKey: Dispatch<SetStateAction<string | undefined>>;
  renderCheck: (q: BankQuestion, inline?: boolean) => ReactNode;
}) {
  const sectionQuestionWord = fa ? 'سؤال' : sectionPracticeQuestions.length === 1 ? 'question' : 'questions';
  const sectionQuestionCount = localizeLessonDigits(sectionPracticeQuestions.length, uiLang);
  return (
    <>
      {' '}
      <section className="lesson-section-practice" aria-label={fa ? 'تمرین‌های همین بخش' : 'Practice for this section'}>
        <h2>{fa ? 'تمرین‌های همین بخش' : 'Practice for this section'}</h2>
        {sectionPracticeQuestions.length > 0 ? (
          <>
            <p>
              {fa ? (
                <>
                  {sectionQuestionCount} سؤال: {localizeLessonDigits(sectionBookQuestions, uiLang)} تمرین کتاب و{' '}
                  {localizeLessonDigits(sectionGeneratedQuestions, uiLang)} تمرین تکمیلی. ابتدا تمرین‌های کتاب آمده‌اند.
                </>
              ) : (
                <>
                  {sectionPracticeQuestions.length} questions: {sectionBookQuestions} textbook and {sectionGeneratedQuestions} extra.
                  Textbook questions come first.
                </>
              )}
            </p>
            {progress.completedSectionIds?.includes(currentSection.id) && (
              <p className="lesson-section-practice-done" role="status">
                {fa ? 'تمرین‌های این بخش انجام شده‌اند.' : 'This section’s practice is complete.'}
              </p>
            )}
            <Button className="lesson-section-practice-button" onClick={startSectionPractice}>
              {fa ? 'شروع تمرین این بخش' : 'Practice this section'} · {sectionQuestionCount} {sectionQuestionWord}
            </Button>
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
              {checks.map((question) => (
                <li key={question.id}>
                  <Button
                    variant="ghost"
                    className="lesson-check-link"
                    aria-current={selectedWorkItem?.key === `q:${question.id}` ? 'true' : undefined}
                    onClick={() => setSelectedWorkKey(`q:${question.id}`)}
                  >
                    <bdi dir="ltr">{question.id}</bdi> ·{' '}
                    <span
                      lang={languageForText(question.prompt || question.source)}
                      dir={contentDirection(question.prompt || question.source)}
                    >
                      <LessonText text={question.prompt || question.source} />
                    </span>
                    <span className="lesson-check-link-status">
                      {progress.answeredCheckIds.includes(question.id)
                        ? fa
                          ? 'پاسخ داده شد'
                          : 'Answered'
                        : progress.skippedChecks.some((item) => item.questionId === question.id)
                          ? fa
                            ? 'ردشده'
                            : 'Skipped'
                          : fa
                            ? 'حل در «کار من»'
                            : 'Solve in Your work'}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            checks.map((question) => renderCheck(question, true))
          )}
        </section>
      )}
    </>
  );
}
