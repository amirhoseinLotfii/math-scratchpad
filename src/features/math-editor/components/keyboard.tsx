import { KeyboardSymbols } from './keyboard-symbols';
import { writeKeyboardChoice } from '../../../shared/lib/ui-prefs';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { actions } from '../../../store';
import { Button } from '../../../shared/ui/button';
import {
  duplicateMathfieldGroup,
  executeMathfield,
  insertMathSymbol,
  mathfieldForStep,
  moveMathfield,
  redoMathfield,
  undoMathfield,
} from '../mathlive-adapter';
export function Keyboard({ onFocusEditor }: { onFocusEditor?: () => void } = {}) {
  const [more, setMore] = useState(false);
  const keyboard = useAppSelector((s) => ({
    stepId: s.doc.cursor.stepId,
    selected: s.doc.cursor.selected,
    symbolsOpen: s.symbolsOpen,
    compact: s.prefs.compact,
    canUndo: more && (Boolean(mathfieldForStep(s.doc.cursor.stepId)?.canUndo()) || s.past.some((d) => d.exerciseId === s.doc.exerciseId)),
    canRedo: more && (Boolean(mathfieldForStep(s.doc.cursor.stepId)?.canRedo()) || s.future.some((d) => d.exerciseId === s.doc.exerciseId)),
  }));
  const { stepId, selected, symbolsOpen, compact, canUndo, canRedo } = keyboard;
  const dispatch = useAppDispatch();
  function focusEditor() {
    if (onFocusEditor) {
      onFocusEditor();
      return;
    }
    const field = mathfieldForStep(stepId);
    if (field) {
      field.focus();
      return;
    }
    document.querySelector<HTMLElement>('main.scratchpad')?.focus({ preventScroll: true });
  }
  function runUndo() {
    if (!undoMathfield(stepId)) dispatch(actions.undo());
  }
  function runRedo() {
    if (!redoMathfield(stepId)) dispatch(actions.redo());
  }
  function symbol(key: string) {
    if (!insertMathSymbol(stepId, key)) {
      if (/^[xynt]$/.test(key)) dispatch(actions.command({ type: 'identifier', value: key }));
      else if (key === 'infinity' || key === 'sigma') dispatch(actions.command({ type: 'identifier', value: key === 'sigma' ? 'σ' : '∞' }));
      else if (['≤', '≥', '≠', '<', '>'].includes(key)) dispatch(actions.command({ type: 'operator', value: key }));
      else dispatch(actions.command({ type: 'insert', value: key }));
    }
    dispatch(actions.recentSymbol(key));
    dispatch(actions.closeSymbols());
    focusEditor();
  }
  return (
    <section
      className="math-keyboard"
      aria-label="Math keyboard"
      dir="ltr"
      onMouseDown={(event) => {
        // Keep pointer activation of the virtual keys from stealing focus from the
        // active MathLive field. The click handler still runs, and keyboard users can
        // Tab to and activate these buttons normally.
        if ((event.target as HTMLElement).closest('button')) event.preventDefault();
      }}
    >
      <div className="keyboard-toolbar">
        <Button aria-expanded={symbolsOpen} onClick={() => dispatch(actions.symbols())}>
          <span aria-hidden="true">π</span> Symbols
        </Button>
        <Button aria-expanded={more} onClick={() => setMore(!more)}>
          <span aria-hidden="true">⠿</span> More tools
        </Button>
        <Button
          aria-label="Backspace"
          onClick={() => {
            if (!executeMathfield(stepId, 'deleteBackward')) dispatch(actions.command({ type: 'backspace' }));
            focusEditor();
          }}
        >
          <span aria-hidden="true">⌫</span> Backspace
        </Button>
      </div>
      {symbolsOpen && <KeyboardSymbols symbol={symbol} dispatch={dispatch} />}
      {!symbolsOpen && (
        <div className="key-grid" role="group" aria-label="Numeric keys">
          {['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', '0', '.', 'Fraction', '+'].map((key) => (
            <Button
              key={key}
              className={/^[0-9.]$/.test(key) ? 'number-key' : 'operator-key'}
              onClick={() => {
                if (!insertMathSymbol(stepId, key === 'Fraction' ? 'fraction' : key)) {
                  if (key === 'Fraction') dispatch(actions.command({ type: 'insert', value: 'fraction' }));
                  else dispatch(actions.command({ type: /^[0-9.]$/.test(key) ? 'digit' : 'operator', value: key }));
                }
                focusEditor();
              }}
            >
              {key}
            </Button>
          ))}
        </div>
      )}
      {more && (
        <div className="more-tools-panel">
          <div className="navigation-grid">
            <Button
              aria-label="Move left"
              onClick={() => {
                if (!moveMathfield(stepId, -1)) dispatch(actions.horizontal(-1));
                focusEditor();
              }}
            >
              ←
            </Button>
            <Button
              aria-label="Move right"
              onClick={() => {
                if (!moveMathfield(stepId, 1)) dispatch(actions.horizontal(1));
                focusEditor();
              }}
            >
              →
            </Button>
            <Button
              aria-label="Next field"
              onClick={() => {
                if (!executeMathfield(stepId, 'moveToNextPlaceholder')) dispatch(actions.next());
                focusEditor();
              }}
            >
              Next
            </Button>
          </div>
          <div className="editing-tools">
            <Button
              disabled={!canUndo}
              onClick={() => {
                runUndo();
                focusEditor();
              }}
            >
              Undo
            </Button>
            <Button
              disabled={!canRedo}
              onClick={() => {
                runRedo();
                focusEditor();
              }}
            >
              Redo
            </Button>
            <Button
              onClick={() => {
                if (!executeMathfield(stepId, 'selectGroup')) dispatch(actions.selectParent());
                focusEditor();
              }}
            >
              Parent
            </Button>
            <Button
              onClick={() => {
                if (!executeMathfield(stepId, 'deleteBackward')) dispatch(actions.command({ type: 'deleteStructure' }));
                focusEditor();
              }}
            >
              Delete Item
            </Button>
            <Button
              onClick={() => {
                if (!executeMathfield(stepId, 'pasteFromClipboard')) dispatch(actions.command({ type: 'paste' }));
                focusEditor();
              }}
            >
              Paste
            </Button>
            <Button
              onClick={() => {
                executeMathfield(stepId, 'copyToClipboard');
                focusEditor();
              }}
            >
              Copy
            </Button>
            <Button
              onClick={() => {
                executeMathfield(stepId, 'cutToClipboard');
                focusEditor();
              }}
            >
              Cut
            </Button>
            <Button
              onClick={() => {
                if (!duplicateMathfieldGroup(stepId)) dispatch(actions.command({ type: 'duplicate' }));
                focusEditor();
              }}
            >
              Duplicate
            </Button>
            <Button
              onClick={() => {
                writeKeyboardChoice(false);
                dispatch(actions.keyboard(false));
              }}
            >
              Hide keys
            </Button>
          </div>
          <Button aria-pressed={compact} onClick={() => dispatch(actions.compact())}>
            {compact ? 'Compact' : 'Full keys'}
          </Button>
        </div>
      )}
      {selected && (
        <div className="structure-selection">
          <p className="structure-label">Whole structure selected</p>
          <div className="toolbar" aria-label="Selected structure actions">
            <Button onClick={() => dispatch(actions.copyStructure())}>Copy</Button>
            <Button
              onClick={() => {
                dispatch(actions.command({ type: 'cut' }));
                focusEditor();
              }}
            >
              Cut
            </Button>
            <Button
              onClick={() => {
                dispatch(actions.command({ type: 'duplicate' }));
                focusEditor();
              }}
            >
              Duplicate
            </Button>
            <Button
              onClick={() => {
                dispatch(actions.command({ type: 'deleteStructure' }));
                focusEditor();
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
