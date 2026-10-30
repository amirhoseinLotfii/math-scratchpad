import { useId } from 'react';
import { Button } from '../../shared/ui/button';
import { MathDisplay } from '../../MathDisplay';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';
import { LessonMathCheck } from './lesson-math-check';
import { contentDirection, languageForText, LessonText } from './lesson-content';
import type { LessonCheckAnswer } from './types';

export function LessonCheck({ question, mathStore, answer, answered, confidence, skipped, onAnswer, onConfidence, onSkip }: {
  question: BankQuestion;
  mathStore?: ScratchStore;
  answer?: LessonCheckAnswer;
  answered: boolean;
  confidence?: 1 | 2 | 3 | 4 | 5;
  skipped: boolean;
  onAnswer: (id: string, answer: LessonCheckAnswer | null) => void;
  onConfidence: (id: string, confidence: 1 | 2 | 3 | 4 | 5) => void;
  onSkip: (id: string) => void;
}) {
  const id = useId();
  const sourceIsMath = question.mode === 'math';
  const answerType = question.answerType ?? (question.mode === 'text' ? 'text' : 'math');
  const choices = question.choices ?? [];
  const completed = skipped || answered;

  return <article className="lesson-check" aria-labelledby={`${id}-title`}>
    <header className="lesson-check-header"><h3 id={`${id}-title`}>Check · {question.id}</h3>{skipped && <span className="lesson-check-skipped">Skipped</span>}{!skipped && completed && <span className="lesson-check-answered">Answered</span>}</header>
    {question.prompt && <p className="lesson-check-prompt" lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></p>}
    {sourceIsMath ? <div className="lesson-check-source" role="group" aria-label="Question expression" dir="ltr"><MathDisplay latex={question.source} label="Question expression" /></div>
      : <p className="lesson-check-source-text" lang={languageForText(question.source)} dir={contentDirection(question.source)}><LessonText text={question.source} /></p>}

    {!skipped && answerType === 'math' && mathStore && <LessonMathCheck question={question} store={mathStore} onAnswered={onAnswer} />}
    {!skipped && answerType === 'text' && <div className="lesson-check-text-answer">
      <label htmlFor={`${id}-answer`}>Answer</label>
      <textarea id={`${id}-answer`} aria-label={`Answer for check ${question.id}`} value={answer?.type === 'text' ? answer.value : ''} dir="auto" onChange={event => onAnswer(question.id, { type: 'text', value: event.currentTarget.value })} />
    </div>}
    {!skipped && answerType === 'choice' && <fieldset className="lesson-check-choice">
      <legend>Choose one option</legend>
      <div className="lesson-choice-options" role="radiogroup" aria-label={`Choices for check ${question.id}`}>
        {choices.map((choice, index) => <label className={answer?.type === 'choice' && answer.value === choice ? 'lesson-choice-selected' : ''} key={`${question.id}-${index}`} dir="ltr">
          <input type="radio" name={`${id}-choice`} value={choice} checked={answer?.type === 'choice' && answer.value === choice} onChange={() => onAnswer(question.id, { type: 'choice', value: choice })} />
          <span>{choice}</span>
        </label>)}
      </div>
    </fieldset>}

    <fieldset className="lesson-confidence">
      <legend>Confidence (optional)</legend>
      <div className="lesson-confidence-options">
        {([1, 2, 3, 4, 5] as const).map(value => <label className={confidence === value ? 'lesson-confidence-selected' : ''} key={value}>
          <input type="radio" name={`${id}-confidence`} value={value} checked={confidence === value} aria-label={`Confidence ${value}`} onChange={() => onConfidence(question.id, value)} />
          <span>{value}</span>
        </label>)}
      </div>
    </fieldset>
    {!completed && <Button className="lesson-skip-check" onClick={() => onSkip(question.id)}>Skip check</Button>}
  </article>;
}
