import type { BankQuestion } from '../drive-bank/drive-bank';
import { Button } from '../../shared/ui/button';
import { contentDirection, ExtraSourceBadge, languageForText, LessonText, localizeLessonDigits, QuestionChoice, QuestionSource } from './lesson-content';
import type { LessonChunkAnswer } from './types';

export function LessonChunkChecks({ questions, answers, uiLang, onChange, onSubmit }: {
  questions: BankQuestion[];
  answers: Record<string, LessonChunkAnswer | undefined>;
  uiLang: 'fa' | 'en';
  onChange: (questionId: string, value: string, explanation?: string) => void;
  onSubmit: (questionId: string) => void;
}) {
  const fa = uiLang === 'fa';
  return <aside className="lesson-work-pane lesson-chunk-checks" aria-label={fa ? 'پاسخ‌نویسی همین بخش' : 'Write answers for this chunk'}>
    <h2 className="lesson-work-title">{fa ? 'حالا از حفظ جواب بده' : 'Write what you remember'}</h2>
    <p className="lesson-chunk-check-intro">{fa ? 'با کلمات خودت جواب بده. تا وقتی همهٔ پاسخ‌ها را ثبت نکنی، بخش بعدی باز نمی‌شود.' : 'Answer in your own words. The next chunk opens after you submit every response.'}</p>
    {questions.map((question, index) => {
      const answer = answers[question.id];
      const prompt = question.prompt || question.source;
      const showSource = !!question.prompt && !!question.source.trim() && question.source !== question.prompt;
      const needsChoice = question.answerType === 'choice';
      const hasResponse = !!answer?.value.trim() && (!question.requiresExplanation || !!answer?.explanation?.trim());
      const submitted = !!answer?.submittedAt && hasResponse;
      const inputId = `lesson-chunk-answer-${question.id}`;
      const interactionLabel = question.interactionType === 'multiple-choice' ? (fa ? 'انتخاب گزینه + دلیل' : 'Multiple choice + rationale')
        : question.interactionType === 'true-false-why' ? (fa ? 'درست/نادرست + دلیل' : 'True/false + why')
          : question.interactionType === 'find-mistake' ? (fa ? 'پیدا کردن و اصلاح اشتباه' : 'Find and fix a mistake')
            : question.interactionType === 'explain' ? (fa ? 'توضیح با زبان خودت' : 'Explain in your own words')
              : (fa ? 'پاسخ نوشتاری' : 'Written response');
      return <article className="lesson-chunk-question" key={question.id} aria-labelledby={`${inputId}-title`}>
        <h3 id={`${inputId}-title`}>{fa ? `پرسش ${localizeLessonDigits(index + 1, uiLang)}` : `Question ${index + 1}`}</h3>
        <ExtraSourceBadge visible={question.tags?.source === 'extra'} />
        <p className="lesson-interaction-type">{interactionLabel}</p>
        <p lang={languageForText(prompt)} dir={contentDirection(prompt)}><LessonText text={prompt} /></p>
        {showSource && <QuestionSource source={question.source} mode={question.mode} label={fa ? 'عبارت سؤال' : 'Question expression'} mathLabel={fa ? 'عبارت ریاضی سؤال' : 'Question math expression'} textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />}
        {needsChoice ? <fieldset className="lesson-check-choice">
          <legend>{fa ? 'یک گزینه را انتخاب کن' : 'Choose one option'}</legend>
          <div className="lesson-choice-options" role="radiogroup" aria-label={`${fa ? 'گزینه‌های پرسش' : 'Answer choices for'} ${question.id}`}>
            {(question.choices ?? []).map((choice, choiceIndex) => <label className={answer?.value === choice ? 'lesson-choice-selected' : ''} key={`${question.id}-${choiceIndex}`} dir="ltr">
              <input type="radio" name={`${inputId}-choice`} value={choice} checked={answer?.value === choice} onChange={() => onChange(question.id, choice, answer?.explanation)} />
              <QuestionChoice choice={choice} index={choiceIndex} uiLang={uiLang} />
            </label>)}
          </div>
        </fieldset> : null}
        {!needsChoice && <label className="lesson-chunk-explanation-label" htmlFor={inputId}>{fa ? 'پاسخ تو' : 'Your answer'}</label>}
        {needsChoice && question.requiresExplanation && <label className="lesson-chunk-explanation-label" htmlFor={`${inputId}-explanation`}>{fa ? 'چرا این گزینه را انتخاب کردی؟' : 'Why did you choose this option?'}</label>}
        {(!needsChoice || question.requiresExplanation) && <textarea id={needsChoice ? `${inputId}-explanation` : inputId} dir="auto" lang={uiLang} maxLength={4000} value={needsChoice ? answer?.explanation ?? '' : answer?.value ?? ''} onChange={event => needsChoice ? onChange(question.id, answer?.value ?? '', event.currentTarget.value) : onChange(question.id, event.currentTarget.value)} />}
        <div className="lesson-chunk-answer-actions">
          <Button className="lesson-primary-action" disabled={!hasResponse} onClick={() => onSubmit(question.id)}>{fa ? (submitted ? 'پاسخ ثبت شد ✓' : 'ثبت پاسخ') : (submitted ? 'Response submitted ✓' : 'Submit response')}</Button>
          {submitted && <span role="status">{fa ? 'بدون کلید؛ برای بررسی خروجی را بفرست' : 'No answer key; send your export for review.'}</span>}
        </div>
      </article>;
    })}
  </aside>;
}
