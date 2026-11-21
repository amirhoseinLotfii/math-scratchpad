import { Plus } from 'lucide-react';
import { type ReactNode } from 'react';
import { SegmentedStepCard } from '../../features/math-editor/components/segmented-step-card';
import { QuestionChoice } from '../../features/lessons/lesson-content';
import { Keyboard } from '../../Keyboard';
import type { Exercise } from '../../model';
import { Button } from '../../shared/ui/button';
import { actions, type AppDispatch, type ScratchState } from '../../store';

export function PracticeResponsePane({
  wide,
  state,
  ex,
  isMathAnswer,
  answerType,
  answerChoices,
  mathTools,
  dispatch,
  onFocusEditor,
  onFocusCurrentMathControl,
  onAddStep,
  onResetStep,
  onDeleteStep,
  onOpenInsert,
}: {
  wide: boolean;
  state: ScratchState;
  ex: Exercise;
  isMathAnswer: boolean;
  answerType: string;
  answerChoices: string[];
  mathTools: ReactNode;
  dispatch: AppDispatch;
  onFocusEditor: () => void;
  onFocusCurrentMathControl: () => void;
  onAddStep: () => void;
  onResetStep: (id: string) => void;
  onDeleteStep: (id: string) => void;
  onOpenInsert: (source?: HTMLElement) => void;
}) {
  return (
    <>
      {wide && isMathAnswer && mathTools}
      {wide && (
        <div className="work-heading">
          <h2>{isMathAnswer ? 'Your work' : 'Your response'}</h2>
          {isMathAnswer && <p className="small">Write each step. Review when you're ready.</p>}
        </div>
      )}

      {isMathAnswer ? (
        <section className="steps" aria-label="Solution steps">
          {ex.steps.map((step, i) => (
            <SegmentedStepCard
              key={step.id}
              step={step}
              stepIndex={i}
              isCurrent={step.id === state.doc.cursor.stepId}
              uiLang="en"
              canDelete={i > 0}
              onSelectStep={() => dispatch(actions.select({ stepId: step.id }))}
              onFocusStep={onFocusEditor}
              onUpdateMath={value => dispatch(actions.mathLiveInput({ stepId: step.id, value }))}
              onUpdateText={text => dispatch(actions.updateStepText({ stepId: step.id, text }))}
              onToggleFinal={() => {
                dispatch(actions.select({ stepId: step.id }));
                dispatch(actions.command({ type: 'final' }));
                onFocusCurrentMathControl();
              }}
              onResetStep={() => onResetStep(step.id)}
              onDeleteStep={() => onDeleteStep(step.id)}
              onSplitBranch={() => {
                dispatch(actions.splitBranch({ stepId: step.id }));
                onFocusCurrentMathControl();
              }}
              onInsertBetween={
                i < ex.steps.length - 1
                  ? () => {
                      dispatch(actions.insertStepBetween({ prevStepId: step.id }));
                      onFocusCurrentMathControl();
                    }
                  : undefined
              }
              onSingleSlash={onOpenInsert}
              onDoubleSlash={() => {
                if (!state.keyboardOpen) dispatch(actions.keyboard(true));
                if (!state.symbolsOpen) dispatch(actions.symbols());
              }}
            />
          ))}
        </section>
      ) : answerType === 'text' || answerType === 'find_mistake' ? (
        <div className="lesson-check-text-answer practice-response">
          <label htmlFor={`practice-answer-${ex.id}`}>
            {answerType === 'find_mistake' ? 'Your answer' : 'Answer'}
          </label>
          <textarea
            id={`practice-answer-${ex.id}`}
            aria-label={answerType === 'find_mistake' ? 'Your answer' : 'Answer'}
            dir="auto"
            maxLength={4000}
            value={ex.answerText ?? ''}
            onChange={event =>
              dispatch(
                actions.setAnswerText({
                  value: event.target.value,
                  answerType: answerType as 'text' | 'find_mistake',
                })
              )
            }
          />
        </div>
      ) : answerType === 'true_false_why' ? (
        <div className="practice-response">
          <fieldset className="lesson-check-choice">
            <legend>True or false?</legend>
            <div className="lesson-choice-options" role="radiogroup" aria-label="True or false answer">
              {(['true', 'false'] as const).map(choice => (
                <label
                  className={ex.answerChoice === choice ? 'lesson-choice-selected' : ''}
                  key={`${ex.id}-${choice}`}
                >
                  <input
                    type="radio"
                    name={`practice-answer-${ex.id}`}
                    value={choice}
                    checked={ex.answerChoice === choice}
                    onChange={() =>
                      dispatch(
                        actions.setTrueFalseWhy({
                          choice,
                          reason: ex.answerReason ?? '',
                        })
                      )
                    }
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
              onChange={event =>
                dispatch(
                  actions.setTrueFalseWhy({
                    choice: ex.answerChoice,
                    reason: event.target.value,
                  })
                )
              }
            />
          </div>
        </div>
      ) : (
        <fieldset className="lesson-check-choice practice-response">
          <legend>Choose one option</legend>
          <div className="lesson-choice-options" role="radiogroup" aria-label="Answer choices">
            {answerChoices.map((answerChoice, index) => (
              <label
                className={ex.answerText === answerChoice ? 'lesson-choice-selected' : ''}
                key={`${ex.id}-${index}`}
                dir="ltr"
              >
                <input
                  type="radio"
                  name={`practice-answer-${ex.id}`}
                  value={answerChoice}
                  checked={ex.answerText === answerChoice}
                  onChange={() =>
                    dispatch(
                      actions.setAnswerText({
                        value: answerChoice,
                        answerType: 'choice',
                        choices: answerChoices,
                      })
                    )
                  }
                />
                <QuestionChoice choice={answerChoice} index={index} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {isMathAnswer && (
        <>
          <p
            className={`small final-status ${ex.steps.some(step => step.final) ? '' : 'missing'}`}
            role="status"
          >
            {(() => {
              const final = ex.steps.findIndex(step => step.final);
              return final < 0
                ? 'No final answer marked yet · press Alt+Enter or “Final” on a step'
                : `Final answer: Step ${final + 1}`;
            })()}
          </p>
          <Button className="add-step" onClick={onAddStep}>
            <Plus aria-hidden="true" />
            Add step
          </Button>
          {!wide && mathTools}
          {state.keyboardOpen && <Keyboard />}
        </>
      )}
    </>
  );
}
