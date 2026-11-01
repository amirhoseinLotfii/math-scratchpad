import { useId, type FocusEvent } from 'react';
import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';
import { LessonMathCheck } from './lesson-math-check';
import { contentDirection, languageForText, LessonText, localizeLessonDigits, QuestionChoice, QuestionSource } from './lesson-content';
import type { LessonCheckAnswer } from './types';

export function LessonCheck({ question, mathStore, answer, answered, confidence, skipped, onAnswer, onConfidence, onSkip, onEngage, onLeave, uiLang = 'en' }: {
  question: BankQuestion;
  mathStore?: ScratchStore;
  answer?: LessonCheckAnswer;
  answered: boolean;
  confidence?: 1 | 2 | 3 | 4 | 5;
  skipped: boolean;
  onAnswer: (id: string, answer: LessonCheckAnswer | null) => void;
  onConfidence: (id: string, confidence: 1 | 2 | 3 | 4 | 5) => void;
  onSkip: (id: string) => void;
  onEngage?: (id: string) => void;
  onLeave?: (id: string) => void;
  uiLang?: 'fa' | 'en';
}) {
  const id = useId();
  const answerType = question.answerType ?? (question.mode === 'text' ? 'text' : 'math');
  const choices = question.choices ?? [];
  const completed = skipped || answered;
  const fa = uiLang === 'fa';

  function leaveCheck(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onLeave?.(question.id);
  }

  return <article className="lesson-check" aria-labelledby={`${id}-title`} onFocusCapture={() => onEngage?.(question.id)} onBlurCapture={leaveCheck}>
    <header className="lesson-check-header"><h3 id={`${id}-title`}>{fa ? 'تمرین بررسی' : 'Check'} · <bdi dir="ltr">{question.id}</bdi></h3>{skipped && <span className="lesson-check-skipped">{fa ? 'رد شد' : 'Skipped'}</span>}{!skipped && completed && <span className="lesson-check-answered">{fa ? 'پاسخ داده شد' : 'Answered'}</span>}</header>
    {question.prompt && <p className="lesson-check-prompt" lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></p>}
    <QuestionSource source={question.source} mode={question.mode} label={fa ? 'عبارت سؤال' : 'Question expression'} mathLabel={fa ? 'عبارت ریاضی سؤال' : 'Question math expression'} textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />

    {!skipped && answerType === 'math' && mathStore && <LessonMathCheck question={question} store={mathStore} onAnswered={onAnswer} uiLang={uiLang} />}
    {!skipped && answerType === 'text' && <div className="lesson-check-text-answer">
      <label htmlFor={`${id}-answer`}>{fa ? 'پاسخ شما' : 'Your answer'}</label>
      <textarea id={`${id}-answer`} aria-label={`${fa ? 'پاسخ تمرین' : 'Answer for check'} ${question.id}`} value={answer?.type === 'text' ? answer.value : ''} dir="auto" onChange={event => onAnswer(question.id, { type: 'text', value: event.currentTarget.value })} />
    </div>}
    {!skipped && answerType === 'choice' && <fieldset className="lesson-check-choice">
      <legend>{fa ? 'یک گزینه را انتخاب کنید' : 'Choose one answer'}</legend>
      <div className="lesson-choice-options" role="radiogroup" aria-label={`${fa ? 'گزینه‌های تمرین' : 'Answer choices for'} ${question.id}`}>
        {choices.map((choice, index) => <label className={answer?.type === 'choice' && answer.value === choice ? 'lesson-choice-selected' : ''} key={`${question.id}-${index}`} dir="ltr">
          <input type="radio" name={`${id}-choice`} value={choice} checked={answer?.type === 'choice' && answer.value === choice} onChange={() => onAnswer(question.id, { type: 'choice', value: choice })} />
          <QuestionChoice choice={choice} index={index} uiLang={uiLang} />
        </label>)}
      </div>
    </fieldset>}

    <fieldset className="lesson-confidence">
      <legend>{fa ? 'میزان اطمینان (اختیاری)' : 'Confidence (optional)'}</legend>
      <div className="lesson-confidence-options">
        {([1, 2, 3, 4, 5] as const).map(value => <label className={confidence === value ? 'lesson-confidence-selected' : ''} key={value}>
          <input type="radio" name={`${id}-confidence`} value={value} checked={confidence === value} aria-label={`${fa ? 'میزان اطمینان' : 'Confidence'} ${localizeLessonDigits(value, uiLang)}`} onChange={() => onConfidence(question.id, value)} />
          <span>{localizeLessonDigits(value, uiLang)}</span>
        </label>)}
      </div>
    </fieldset>
    {!completed && <Button className="lesson-skip-check" onClick={() => onSkip(question.id)}>{fa ? 'رد کردن این تمرین' : 'Skip check'}</Button>}
  </article>;
}
