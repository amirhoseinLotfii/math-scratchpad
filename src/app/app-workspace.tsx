import { PracticeAnswer } from './practice-answer';
import { QuestionContext } from './question-context';
import { Plus } from 'lucide-react';
import { actions } from '../store';
import { Keyboard } from '../features/math-editor/components/keyboard';
import { Button } from '../shared/ui/button';

import { QuestionNavigator } from '../features/workspace/components/question-navigator';

import type { AppViewState } from './use-app-controller';
export function AppWorkspace({
  layout,
  batch,
  state,
  switchQuestion,
  wide,
  ex,
  linkedLesson,
  fractions,
  exerciseIndex,
  lessonButton,
  openReference,
  guidanceOpen,
  setGuidanceOpen,
  dispatch,
  manualTimerPause,
  activityTracker,
  isMathAnswer,
  mathTools,
  focusEditor,
  focusCurrentMathControl,
  resetStep,
  deleteStep,
  answerType,
  answerChoices,
  addStep,
  busy,
  request,
  copied,
  setManual,
  last,
  manual,
  manualRef,
  showResults,
  exam,
  examGrades,
  questionBank,
  copyReport,
}: AppViewState) {
  return (
    <div className="workspace">
      {layout !== 'phone' && batch && <QuestionNavigator doc={state.doc} onSelect={switchQuestion} />}
      <QuestionContext
        wide={wide}
        batch={batch}
        layout={layout}
        ex={ex}
        state={state}
        switchQuestion={switchQuestion}
        linkedLesson={linkedLesson}
        fractions={fractions}
        exerciseIndex={exerciseIndex}
        lessonButton={lessonButton}
        openReference={openReference}
        guidanceOpen={guidanceOpen}
        setGuidanceOpen={setGuidanceOpen}
        dispatch={dispatch}
        manualTimerPause={manualTimerPause}
        activityTracker={activityTracker}
      />
      <div
        className={`editor-layout work-pane ${isMathAnswer && state.keyboardOpen ? 'keyboard-visible' : 'keyboard-hidden'}`}
        role={wide ? 'region' : undefined}
        aria-label={wide ? (isMathAnswer ? 'Your work' : 'Your response') : undefined}
      >
        <div className="notebook-main">
          {wide && isMathAnswer && mathTools}
          {wide && (
            <div className="work-heading">
              <h2>{isMathAnswer ? 'Your work' : 'Your response'}</h2>
              {isMathAnswer && <p className="small">Write each step. Review when you're ready.</p>}
            </div>
          )}

          <PracticeAnswer
            isMathAnswer={isMathAnswer}
            ex={ex}
            state={state}
            dispatch={dispatch}
            focusEditor={focusEditor}
            focusCurrentMathControl={focusCurrentMathControl}
            resetStep={resetStep}
            deleteStep={deleteStep}
            answerType={answerType}
            answerChoices={answerChoices}
          />
          {isMathAnswer && (
            <>
              <p className={`small final-status ${ex.steps.some((step) => step.final) ? '' : 'missing'}`} role="status">
                {(() => {
                  const final = ex.steps.findIndex((step) => step.final);
                  return final < 0
                    ? 'No final answer marked yet · press Alt+Enter or “Final” on a step'
                    : `Final answer: Step ${final + 1}`;
                })()}
              </p>
              <Button className="add-step" onClick={addStep}>
                <Plus aria-hidden="true" />
                Add step
              </Button>
              {!wide && mathTools}
              {state.keyboardOpen && <Keyboard />}
            </>
          )}
          <footer className="review-controls">
            {wide && (
              <p className="wide-keyboard-hint">
                <kbd>/</kbd> Open math tools · <kbd>Ctrl / Cmd + Z</kbd> Undo · <kbd>Tab</kbd> Move focus
              </p>
            )}
            {!batch && (
              <Button variant="default" className="review-button" disabled={busy} onClick={() => request('copy')}>
                {busy ? 'Copying…' : 'Check · Copy for Review'}
              </Button>
            )}

            <p className={`copy-state ${copied === 'Changed since copy' ? 'changed' : ''}`}>{copied}</p>
            <p className="small" role="status" aria-live="polite">
              {state.notice}
            </p>
            {batch && (
              <nav className="question-navigation" aria-label="Question navigation">
                <Button
                  disabled={exerciseIndex === 0}
                  onClick={() => {
                    dispatch(actions.adjacentExercise(-1));
                    setManual('');
                  }}
                >
                  ← Previous
                </Button>
                <Button onClick={() => request(last ? 'complete' : 'next')}>{last ? 'Finish session' : 'Next question →'}</Button>
              </nav>
            )}
            {wide && batch && !ex.skipped && <p className="confidence-hint">Confidence required before continuing.</p>}

            {state.storageState?.kind === 'error' && <p role="alert">{state.storageState.message}</p>}
          </footer>
          {manual && (
            <section className="manual-copy">
              <label htmlFor="review-text">Review message · select all to copy</label>
              <textarea id="review-text" ref={manualRef} readOnly value={manual} onFocus={(e) => e.currentTarget.select()} />
              <div className="toolbar">
                <Button
                  onClick={() => {
                    manualRef.current?.focus();
                    manualRef.current?.select();
                  }}
                >
                  Select All
                </Button>
                <Button onClick={() => setManual('')}>Close</Button>
              </div>
            </section>
          )}
          {showResults && exam && (
            <section className="diagnostic-report" aria-label="Diagnostic report">
              <h2>Diagnostic Review</h2>
              <p>
                <strong>
                  {examGrades.filter((x) => x.result?.numeric === 'correct').length}/{questionBank.length}
                </strong>{' '}
                numerically correct
              </p>
              <div className="report-grid">
                {examGrades.map(({ question, result }) => (
                  <div key={question.id}>
                    <strong>Q{question.id}</strong> · {result?.numeric ?? 'skipped'}
                    {result && (
                      <span>
                        {' '}
                        / Form: {result.form} / Steps: {result.steps}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <Button onClick={copyReport}>Copy Full Diagnostic Report</Button>
              <p className="small">Estimated skill performance only. Unsupported expressions remain unverified.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
