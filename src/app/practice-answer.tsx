import { RotateCcw, Trash2 } from 'lucide-react';
import { actions } from '../store';
import { stepLatex } from '../model';
import { Button } from '../shared/ui/button';

import { MathLiveStepInput } from '../features/math-editor/components/mathlive-step-input';
import { QuestionChoice } from '../features/lessons/lesson-content';

import type { AppDispatch, ScratchState } from '../store';
import type { Exercise } from '../model';
import type { BankQuestion } from '../features/drive-bank/drive-bank';

type Props = {
  isMathAnswer: boolean;
  ex: Exercise;
  state: Pick<ScratchState, 'doc'>;
  dispatch: AppDispatch;
  focusEditor: () => void;
  focusCurrentMathControl: () => void;
  resetStep: (id: string) => void;
  deleteStep: (id: string) => void;
  answerType: NonNullable<BankQuestion['answerType']>;
  answerChoices: string[];
};
export function PracticeAnswer({
  isMathAnswer,
  ex,
  state,
  dispatch,
  focusEditor,
  focusCurrentMathControl,
  resetStep,
  deleteStep,
  answerType,
  answerChoices,
}: Props) {
  return (
    <>
      {isMathAnswer ? (
        <section className="steps" aria-label="Solution steps">
          {ex.steps.map((step, i) => (
            <article className={`step ${step.id === state.doc.cursor.stepId ? 'current-step' : ''}`} key={step.id} data-step-id={step.id}>
              <header className="step-header">
                <Button
                  className="step-title"
                  variant="ghost"
                  onClick={() => {
                    dispatch(actions.select({ stepId: step.id }));
                    focusEditor();
                  }}
                >
                  Step {i + 1}
                </Button>
                <span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>
                  {step.status === 'needs-review' ? 'Needs review' : step.edited ? 'Edited' : ''}
                </span>
                <Button
                  className="final-marker"
                  aria-pressed={step.final}
                  aria-label={`Mark Step ${i + 1} as final`}
                  onClick={() => {
                    dispatch(actions.select({ stepId: step.id }));
                    dispatch(actions.command({ type: 'final' }));
                    focusCurrentMathControl();
                  }}
                >
                  Final{step.final ? ' ✓' : ''}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Reset Step ${i + 1}`}
                  title={`Reset Step ${i + 1}`}
                  onClick={() => resetStep(step.id)}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={i === 0}
                  aria-label={`Delete Step ${i + 1}`}
                  title={i === 0 ? 'The first step cannot be deleted' : `Delete Step ${i + 1}`}
                  onClick={() => deleteStep(step.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </header>
              <div className="expression" data-step-id={step.id}>
                <MathLiveStepInput
                  stepId={step.id}
                  value={stepLatex(step)}
                  label={`Step ${i + 1} expression`}
                  onInput={(value) => dispatch(actions.mathLiveInput({ stepId: step.id, value }))}
                  onFocusStep={() => dispatch(actions.select({ stepId: step.id }))}
                />
              </div>
            </article>
          ))}
        </section>
      ) : answerType === 'text' || answerType === 'find_mistake' ? (
        <div className="lesson-check-text-answer practice-response">
          <label htmlFor={`practice-answer-${ex.id}`}>{answerType === 'find_mistake' ? 'Your answer' : 'Answer'}</label>
          <textarea
            id={`practice-answer-${ex.id}`}
            aria-label={answerType === 'find_mistake' ? 'Your answer' : 'Answer'}
            dir="auto"
            maxLength={4000}
            value={ex.answerText ?? ''}
            onChange={(event) => dispatch(actions.setAnswerText({ value: event.target.value, answerType }))}
          />
        </div>
      ) : answerType === 'true_false_why' ? (
        <div className="practice-response">
          <fieldset className="lesson-check-choice">
            <legend>True or false?</legend>
            <div className="lesson-choice-options" role="radiogroup" aria-label="True or false answer">
              {(['true', 'false'] as const).map((choice) => (
                <label className={ex.answerChoice === choice ? 'lesson-choice-selected' : ''} key={`${ex.id}-${choice}`}>
                  <input
                    type="radio"
                    name={`practice-answer-${ex.id}`}
                    value={choice}
                    checked={ex.answerChoice === choice}
                    onChange={() => dispatch(actions.setTrueFalseWhy({ choice, reason: ex.answerReason ?? '' }))}
                  />
                  <span>{choice === 'true' ? 'True' : 'False'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="lesson-check-text-answer">
            <label htmlFor={`practice-reason-${ex.id}`}>Explain your choice</label>
            <textarea
              id={`practice-reason-${ex.id}`}
              aria-label="Reason for answer"
              dir="auto"
              maxLength={4000}
              value={ex.answerReason ?? ''}
              onChange={(event) => dispatch(actions.setTrueFalseWhy({ choice: ex.answerChoice, reason: event.target.value }))}
            />
          </div>
        </div>
      ) : (
        <fieldset className="lesson-check-choice practice-response">
          <legend>Choose one option</legend>
          <div className="lesson-choice-options" role="radiogroup" aria-label="Answer choices">
            {answerChoices.map((answerChoice, index) => (
              <label className={ex.answerText === answerChoice ? 'lesson-choice-selected' : ''} key={`${ex.id}-${index}`} dir="ltr">
                <input
                  type="radio"
                  name={`practice-answer-${ex.id}`}
                  value={answerChoice}
                  checked={ex.answerText === answerChoice}
                  onChange={() => dispatch(actions.setAnswerText({ value: answerChoice, answerType: 'choice', choices: answerChoices }))}
                />
                <QuestionChoice choice={answerChoice} index={index} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}
