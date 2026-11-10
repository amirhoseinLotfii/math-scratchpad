import { useId, type FocusEvent } from 'react';
import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';
import { LessonMathCheck } from './lesson-math-check';
import { contentDirection, languageForText, LessonText, localizeLessonDigits, QuestionChoice, QuestionSource } from './lesson-content';
import type { LessonCheckAnswer } from './types';

export function LessonCheck({ question, mathStore, answer, answered, confidence, skipped, onAnswer, onConfidence, onSkip, onEngage, onLeave, uiLang = 'en', compact = false, onExpand }: {
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
  compact?: boolean;
  onExpand?: () => void;
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

  // In a stack of math checks, keep inactive cards short; their saved answers
  // remain in the lesson progress/store, while only the selected editor expands.
  if (compact && answerType === 'math') return <article className="lesson-check lesson-check-collapsed" data-check-id={question.id} aria-labelledby={`${id}-title`}>
    <header className="lesson-check-header"><h3 id={`${id}-title`}>{fa ? 'تمرین بررسی' : 'Check'} · <bdi dir="ltr">{question.id}</bdi></h3>
      {completed && <span className="lesson-check-answered">{fa ? 'پاسخ داده شد' : 'Answered'}</span>}</header>
    {question.prompt && <p className="lesson-check-prompt" lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></p>}
    <Button className="lesson-check-expand" aria-expanded={false} onClick={onExpand}>{fa ? (answered ? 'ادامه حل تمرین' : 'حل این تمرین') : (answered ? 'Continue this check' : 'Solve this check')}</Button>
  </article>;

  return <article className="lesson-check" data-check-id={question.id} aria-labelledby={`${id}-title`} onFocusCapture={() => onEngage?.(question.id)} onBlurCapture={leaveCheck}>
    <header className="lesson-check-header"><h3 id={`${id}-title`}>{fa ? 'تمرین بررسی' : 'Check'} · <bdi dir="ltr">{question.id}</bdi></h3>{skipped && <span className="lesson-check-skipped">{fa ? 'رد شد' : 'Skipped'}</span>}{!skipped && completed && <span className="lesson-check-answered">{fa ? 'پاسخ داده شد' : 'Answered'}</span>}</header>
    {question.prompt && <p className="lesson-check-prompt" lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></p>}
    <QuestionSource source={question.source} mode={question.mode} label={fa ? 'عبارت سؤال' : 'Question expression'} mathLabel={fa ? 'عبارت ریاضی سؤال' : 'Question math expression'} textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />

    {!skipped && answerType === 'math' && mathStore && <LessonMathCheck question={question} store={mathStore} onAnswered={onAnswer} uiLang={uiLang} />}
    {!skipped && (answerType === 'text' || answerType === 'find_mistake') && <div className="lesson-check-text-answer">
      <label htmlFor={`${id}-answer`}>{fa ? 'پاسخ شما' : 'Your answer'}</label>
      <textarea id={`${id}-answer`} aria-label={`${fa ? 'پاسخ تمرین' : 'Answer for check'} ${question.id}`} maxLength={4000} value={answer?.type === 'text' || answer?.type === 'find_mistake' ? answer.value : ''} dir="auto" onChange={event => onAnswer(question.id, { type: answerType, value: event.currentTarget.value })} />
    </div>}
    {!skipped && answerType === 'true_false_why' && <>
      <fieldset className="lesson-check-choice">
        <legend>{fa ? 'درست یا نادرست؟' : 'True or false?'}</legend>
        <div className="lesson-choice-options" role="radiogroup" aria-label={`${fa ? 'درست یا نادرست' : 'True or false'} ${question.id}`}>
          {(['true', 'false'] as const).map(choice => <label className={answer?.type === 'true_false_why' && answer.choice === choice ? 'lesson-choice-selected' : ''} key={choice}>
            <input type="radio" name={`${id}-true-false`} value={choice} checked={answer?.type === 'true_false_why' && answer.choice === choice} onChange={() => onAnswer(question.id, { type: 'true_false_why', choice, reason: answer?.type === 'true_false_why' ? answer.reason : '' })} />
            <span>{choice === 'true' ? 'True' : 'False'}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="lesson-check-text-answer">
        <label htmlFor={`${id}-reason`}>{fa ? 'دلیل خود را توضیح دهید' : 'Explain your choice'}</label>
        <textarea id={`${id}-reason`} aria-label={`${fa ? 'دلیل پاسخ' : 'Reason for answer'} ${question.id}`} maxLength={4000} value={answer?.type === 'true_false_why' ? answer.reason : ''} dir="auto" onChange={event => onAnswer(question.id, { type: 'true_false_why', choice: answer?.type === 'true_false_why' ? answer.choice : undefined, reason: event.currentTarget.value })} />
      </div>
    </>}
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
