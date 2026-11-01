import type { BankQuestion } from '../drive-bank/drive-bank';
import { Button } from '../../shared/ui/button';
import { contentDirection, languageForText, LessonText, localizeLessonDigits, QuestionSource } from './lesson-content';
import type { LessonChunkAnswer } from './types';

export function LessonChunkChecks({ questions, answers, uiLang, onChange, onSubmit }: {
  questions: BankQuestion[];
  answers: Record<string, LessonChunkAnswer | undefined>;
  uiLang: 'fa' | 'en';
  onChange: (questionId: string, value: string) => void;
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
      const submitted = !!answer?.submittedAt && !!answer.value.trim();
      const inputId = `lesson-chunk-answer-${question.id}`;
      return <article className="lesson-chunk-question" key={question.id} aria-labelledby={`${inputId}-title`}>
        <h3 id={`${inputId}-title`}>{fa ? `پرسش ${localizeLessonDigits(index + 1, uiLang)}` : `Question ${index + 1}`}</h3>
        <p lang={languageForText(prompt)} dir={contentDirection(prompt)}><LessonText text={prompt} /></p>
        {showSource && <QuestionSource source={question.source} mode={question.mode} label={fa ? 'عبارت سؤال' : 'Question expression'} mathLabel={fa ? 'عبارت ریاضی سؤال' : 'Question math expression'} textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />}
        <label htmlFor={inputId}>{fa ? 'پاسخ تو' : 'Your response'}</label>
        <textarea id={inputId} dir="auto" lang={uiLang} maxLength={4000} value={answer?.value ?? ''} onChange={event => onChange(question.id, event.currentTarget.value)} />
        <div className="lesson-chunk-answer-actions">
          <Button className="lesson-primary-action" disabled={!answer?.value.trim()} onClick={() => onSubmit(question.id)}>{fa ? (submitted ? 'پاسخ ثبت شد ✓' : 'ثبت پاسخ') : (submitted ? 'Response submitted ✓' : 'Submit response')}</Button>
          {submitted && <span role="status">{fa ? 'بدون کلید؛ برای بررسی خروجی را بفرست' : 'No answer key; send your export for review.'}</span>}
        </div>
      </article>;
    })}
  </aside>;
}
