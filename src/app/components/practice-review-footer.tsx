import { useRef } from 'react';
import { Button } from '../../shared/ui/button';
import type { DiagnosticQuestion } from '../../diagnostic';
import type { DiagnosticGrade } from '../../assessment';

export function PracticeReviewFooter({
  wide,
  batch,
  busy,
  copied,
  notice,
  exerciseIndex,
  last,
  skipped,
  storageError,
  manual,
  setManual,
  showResults,
  exam,
  examGrades,
  questionBankLength,
  onPreviousQuestion,
  onRequestDecision,
  onCopyReport,
}: {
  wide: boolean;
  batch: boolean;
  busy: boolean;
  copied: string;
  notice: string;
  exerciseIndex: number;
  last: boolean;
  skipped: boolean;
  storageError?: string;
  manual: string;
  setManual: (text: string) => void;
  showResults: boolean;
  exam: boolean;
  examGrades: Array<{ question: DiagnosticQuestion; result: DiagnosticGrade | null }>;
  questionBankLength: number;
  onPreviousQuestion: () => void;
  onRequestDecision: (action: 'next' | 'complete' | 'copy') => void;
  onCopyReport: () => void;
}) {
  const manualRef = useRef<HTMLTextAreaElement>(null);

  return (
    <>
      <footer className="review-controls">
        {wide && (
          <p className="wide-keyboard-hint">
            <kbd>/</kbd> Open math tools · <kbd>Ctrl / Cmd + Z</kbd> Undo · <kbd>Tab</kbd> Move
            focus
          </p>
        )}
        {!batch && (
          <Button
            variant="default"
            className="review-button"
            disabled={busy}
            onClick={() => onRequestDecision('copy')}
          >
            {busy ? 'Copying…' : 'Check · Copy for Review'}
          </Button>
        )}
        <p className={`copy-state ${copied === 'Changed since copy' ? 'changed' : ''}`}>{copied}</p>
        <p className="small" role="status" aria-live="polite">
          {notice}
        </p>
        {batch && (
          <nav className="question-navigation" aria-label="Question navigation">
            <Button disabled={exerciseIndex === 0} onClick={onPreviousQuestion}>
              ← Previous
            </Button>
            <Button onClick={() => onRequestDecision(last ? 'complete' : 'next')}>
              {last ? 'Finish session' : 'Next question →'}
            </Button>
          </nav>
        )}
        {wide && batch && !skipped && (
          <p className="confidence-hint">Confidence required before continuing.</p>
        )}
        {storageError && <p role="alert">{storageError}</p>}
      </footer>
      {manual && (
        <section className="manual-copy">
          <label htmlFor="review-text">Review message · select all to copy</label>
          <textarea
            id="review-text"
            ref={manualRef}
            readOnly
            value={manual}
            onFocus={e => e.currentTarget.select()}
          />
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
              {examGrades.filter(x => x.result?.numeric === 'correct').length}/{questionBankLength}
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
          <Button onClick={onCopyReport}>Copy Full Diagnostic Report</Button>
          <p className="small">
            Estimated skill performance only. Unsupported expressions remain unverified.
          </p>
        </section>
      )}
    </>
  );
}
