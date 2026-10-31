import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { Provider } from '../../app/store-provider';
import { MathTools } from '../workspace/components/math-tools';
import { Keyboard } from '../../Keyboard';
import { actions, exerciseOf, initialState, makeStore } from '../../store';
import { blankStep, leaves, stepIsBlank, stepLatex, uid, type Step } from '../../model';
import { Button } from '../../shared/ui/button';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';
import { executeMathfield, insertMathSymbol, mathfieldForStep, moveMathfield, redoMathfield, undoMathfield } from '../math-editor/mathlive-adapter';
import { MathLiveStepInput } from '../math-editor/components/mathlive-step-input';

export function createLessonMathStore(question: BankQuestion, phone: boolean, savedSteps?: Step[]): ScratchStore {
  const state = initialState(), previous = state.doc.exercises[0], step = blankStep();
  const steps = savedSteps?.length ? JSON.parse(JSON.stringify(savedSteps)) as Step[] : [step];
  const exercise = { ...previous, id: uid(), bankQuestionId: question.id, source: question.source, mode: 'math' as const, prompt: question.prompt, steps };
  state.doc.exercises = [exercise];
  state.doc.exerciseId = exercise.id;
  const activeStep = steps.at(-1)!;
  state.doc.cursor = { stepId: activeStep.id, nodeId: leaves(activeStep.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null };
  // The app keyboard is opened only after an explicit user action.
  state.keyboardOpen = false;
  return makeStore(state);
}

function dispatchInsert(store: ScratchStore, kind: string) {
  if (insertMathSymbol(store.getState().doc.cursor.stepId, kind)) return;
  if (['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠'].includes(kind)) store.dispatch(actions.command({ type: 'operator', value: kind }));
  else if (kind === 'number') store.dispatch(actions.command({ type: 'insertBlankNumber' }));
  else if (kind === 'x' || kind === 'y' || kind === 'n' || kind === 't') store.dispatch(actions.command({ type: 'identifier', value: kind }));
  else store.dispatch(actions.command({ type: 'insert', value: kind }));
}

function Editor({ question, store, onAnswered }: { question: BankQuestion; store: ScratchStore; onAnswered: (id: string, answer: { type: 'math'; steps: Step[] }) => void }) {
  const layout = useWorkspaceLayout(), wide = layout !== 'phone';
  const root = useRef<HTMLElement>(null);
  const state = useAppSelector(s => s);
  const dispatch = useAppDispatch();
  const exercise = exerciseOf(state.doc);
  const currentStepIndex = exercise.steps.findIndex(step => step.id === state.doc.cursor.stepId);
  const answered = exercise.steps.some(step => !stepIsBlank(step));

  useEffect(() => onAnswered(question.id, { type: 'math', steps: exercise.steps }), [answered, exercise.steps, onAnswered, question.id]);

  function focusEditor() {
    root.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const active = mathfieldForStep(store.getState().doc.cursor.stepId);
      if (!active) return;
      active.focus();
      const rect = active.getBoundingClientRect();
      const source = root.current?.closest('.lesson-check')?.querySelector<HTMLElement>('.lesson-check-source');
      const sourceRect = source?.getBoundingClientRect();
      const stickyTop = source ? Number.parseFloat(getComputedStyle(source).top) || 0 : 0;
      const sourcePinned = !!source && getComputedStyle(source).position === 'sticky' && !!sourceRect && sourceRect.top <= stickyTop + 1;
      const visibleTop = sourcePinned && sourceRect ? sourceRect.bottom + 8 : 8;
      const viewport = window.visualViewport;
      const visibleBottom = Math.min(window.innerHeight, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 8;
      if (rect.top < visibleTop) window.scrollBy({ top: rect.top - visibleTop, behavior: 'auto' });
      else if (rect.bottom > visibleBottom) window.scrollBy({ top: rect.bottom - visibleBottom, behavior: 'auto' });
    }));
  }
  function insert(kind: string) { dispatchInsert(store, kind); focusEditor(); }
  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement, key = event.key;
    if (target.closest('math-field')) {
      const mathfield = target.closest<HTMLElement & { getAttribute(name: string): string | null }>('math-field');
      const stepId = mathfield?.getAttribute('data-step-id');
      const step = exercise.steps.find(item => item.id === stepId);
      const firstCharacter = /^[0-9.]$/.test(key) || /^[a-zA-Z]$/.test(key) || ['+','-','−','*','×','÷','='].includes(key);
      if (step && stepLatex(step) === '\\square' && firstCharacter && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const normalized = ({ '-':'−', '*':'×' } as Record<string, string>)[key] ?? key;
        if (insertMathSymbol(step.id, normalized)) { event.preventDefault(); return; }
      }
      if (event.altKey && key === 'Enter') { event.preventDefault(); dispatch(actions.command({ type: 'final' })); }
      else if (key === 'Enter' && !event.shiftKey) { event.preventDefault(); dispatch(actions.command({ type: 'newStep' })); focusEditor(); }
      else if (key === '/') { event.preventDefault(); dispatch(actions.symbols()); }
      return;
    }
    if (target !== root.current && !target.closest('.expression')) return;
    if (event.ctrlKey || event.metaKey) {
      if (key.toLowerCase() === 'z') { event.preventDefault(); if (!event.shiftKey || !redoMathfield(state.doc.cursor.stepId)) { if (event.shiftKey) dispatch(actions.redo()); else if (!undoMathfield(state.doc.cursor.stepId)) dispatch(actions.undo()); } }
      else if (key.toLowerCase() === 'y') { event.preventDefault(); if (!redoMathfield(state.doc.cursor.stepId)) dispatch(actions.redo()); }
      else if (key.toLowerCase() === 'a') { event.preventDefault(); executeMathfield(state.doc.cursor.stepId, 'selectAll'); }
      else if (key.toLowerCase() === 'c') { event.preventDefault(); executeMathfield(state.doc.cursor.stepId, 'copyToClipboard'); }
      else if (key.toLowerCase() === 'x') { event.preventDefault(); executeMathfield(state.doc.cursor.stepId, 'cutToClipboard'); }
      else if (key.toLowerCase() === 'v') { event.preventDefault(); executeMathfield(state.doc.cursor.stepId, 'pasteFromClipboard'); }
      return;
    }
    if (event.altKey && key === 'Enter') { event.preventDefault(); dispatch(actions.command({ type: 'final' })); return; }
    if (event.altKey) return;
    if (/^[0-9.]$/.test(key)) { event.preventDefault(); insert(key); }
    else if (/^[a-zA-Z]$/.test(key)) { event.preventDefault(); insert(key); }
    else if (key === '/') { event.preventDefault(); dispatch(actions.symbols()); }
    else if (['+','-','−','*','×','÷','='].includes(key)) { event.preventDefault(); insert(({ '-':'−','*':'×' } as Record<string, string>)[key] ?? key); }
    else if (key === '(') { event.preventDefault(); insert('group'); }
    else if (key === 'ArrowLeft' || key === 'ArrowRight') { event.preventDefault(); if (!moveMathfield(state.doc.cursor.stepId, key === 'ArrowLeft' ? -1 : 1)) dispatch(actions.horizontal(key === 'ArrowLeft' ? -1 : 1)); }
    else if (key === 'ArrowUp' || key === 'ArrowDown') { event.preventDefault(); dispatch(actions.vertical(key === 'ArrowUp' ? -1 : 1)); }
    else if (key === 'Backspace' || key === 'Delete') { event.preventDefault(); if (!executeMathfield(state.doc.cursor.stepId, key === 'Delete' ? 'deleteForward' : 'deleteBackward')) dispatch(actions.command({ type: key === 'Delete' ? 'deleteForward' : 'backspace' })); }
    else if (key === 'Enter' && !event.shiftKey) { event.preventDefault(); dispatch(actions.command({ type: 'newStep' })); }
  }

  const tools = <MathTools wide={wide}
    canUndo={!!mathfieldForStep(state.doc.cursor.stepId)?.canUndo() || state.past.some(item => item.exerciseId === exercise.id)}
    canRedo={!!mathfieldForStep(state.doc.cursor.stepId)?.canRedo() || state.future.some(item => item.exerciseId === exercise.id)}
    onUndo={() => { if (!undoMathfield(state.doc.cursor.stepId)) dispatch(actions.undo()); focusEditor(); }} onRedo={() => { if (!redoMathfield(state.doc.cursor.stepId)) dispatch(actions.redo()); focusEditor(); }}
    onInsert={insert} moreOpen={state.keyboardOpen && state.symbolsOpen} onMore={() => {
      if (!state.keyboardOpen) {
        dispatch(actions.keyboard(true));
        if (!state.symbolsOpen) dispatch(actions.symbols());
      } else dispatch(actions.symbols());
    }} />;

  return <section ref={root} className="lesson-math-editor" tabIndex={0} aria-label={`Math answer for ${question.id}`} onKeyDownCapture={handleKey}>
      <div className="lesson-answer-heading"><h4>Write each step</h4><Button className="lesson-keyboard-toggle" aria-label={state.keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'} aria-expanded={state.keyboardOpen} onClick={() => { const open = !state.keyboardOpen; dispatch(actions.keyboard(open)); if (open) focusEditor(); }}>{state.keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'}</Button></div>
      {wide && tools}
      <section className="lesson-answer-steps" aria-label={`Answer steps for ${question.id}`}>
        {exercise.steps.map((step, index) => <article className={`lesson-answer-step ${step.id === state.doc.cursor.stepId ? 'current-step' : ''}`} key={step.id}>
          <header><Button variant="ghost" className="lesson-step-title" onClick={() => { dispatch(actions.select({ stepId: step.id })); focusEditor(); }}>Step {index + 1}</Button>
            <span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>{step.status === 'needs-review' ? 'Needs review' : step.edited ? 'Edited' : ''}</span>
            <Button className="final-marker" aria-pressed={step.final} aria-label={`Mark Step ${index + 1} as final`} onClick={() => { dispatch(actions.select({ stepId: step.id })); dispatch(actions.command({ type: 'final' })); focusEditor(); }}>Final{step.final ? ' ✓' : ''}</Button>
          </header>
          <div className="expression" data-step-id={step.id}><MathLiveStepInput stepId={step.id} value={stepLatex(step)} label={`Step ${index + 1} expression`} onInput={value => dispatch(actions.mathLiveInput({ stepId: step.id, value }))} onFocusStep={() => dispatch(actions.select({ stepId: step.id }))} /></div>
        </article>)}
      </section>
      <Button className="add-step" onClick={() => { dispatch(actions.command({ type: 'newStep' })); focusEditor(); }}>Add step</Button>
      {!wide && tools}
      {state.keyboardOpen && <Keyboard onFocusEditor={focusEditor} />}
    </section>;
}

export function LessonMathCheck({ question, store, onAnswered }: { question: BankQuestion; store: ScratchStore; onAnswered: (id: string, answer: { type: 'math'; steps: Step[] }) => void }) {
  return <Provider store={store}><Editor question={question} store={store} onAnswered={onAnswered} /></Provider>;
}
