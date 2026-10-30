import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Formula } from '../../Formula';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { Provider } from '../../app/store-provider';
import { MathTools } from '../workspace/components/math-tools';
import { Keyboard } from '../../Keyboard';
import { actions, activeInfo, exerciseOf, initialState, makeStore } from '../../store';
import { blankStep, leaves, stepIsBlank, uid, type Step } from '../../model';
import { Button } from '../../shared/ui/button';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';

export function createLessonMathStore(question: BankQuestion, phone: boolean, savedSteps?: Step[]): ScratchStore {
  const state = initialState(), previous = state.doc.exercises[0], step = blankStep();
  const steps = savedSteps?.length ? JSON.parse(JSON.stringify(savedSteps)) as Step[] : [step];
  const exercise = { ...previous, id: uid(), bankQuestionId: question.id, source: question.source, mode: 'math' as const, prompt: question.prompt, steps };
  state.doc.exercises = [exercise];
  state.doc.exerciseId = exercise.id;
  const activeStep = steps.at(-1)!;
  state.doc.cursor = { stepId: activeStep.id, nodeId: leaves(activeStep.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null };
  state.keyboardOpen = phone;
  return makeStore(state);
}

function dispatchInsert(store: ScratchStore, kind: string) {
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
  const selected = activeInfo(state.doc);
  const answered = exercise.steps.some(step => !stepIsBlank(step));

  useEffect(() => onAnswered(question.id, { type: 'math', steps: exercise.steps }), [answered, exercise.steps, onAnswered, question.id]);

  function focusEditor() {
    root.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const active = root.current?.querySelector<HTMLElement>('.lesson-answer-step.current-step .token-active');
      if (!active) return;
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
    event.stopPropagation();
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement, key = event.key;
    if (target !== root.current && !target.closest('.expression')) return;
    if (event.ctrlKey || event.metaKey) {
      if (key.toLowerCase() === 'z') { event.preventDefault(); dispatch(event.shiftKey ? actions.redo() : actions.undo()); }
      else if (key.toLowerCase() === 'y') { event.preventDefault(); dispatch(actions.redo()); }
      return;
    }
    if (event.altKey && key === 'Enter') { event.preventDefault(); dispatch(actions.command({ type: 'final' })); return; }
    if (event.altKey) return;
    if (/^[0-9.]$/.test(key)) { event.preventDefault(); dispatch(actions.command({ type: 'digit', value: key })); }
    else if (/^[a-zA-Z]$/.test(key)) { event.preventDefault(); dispatch(actions.command({ type: 'identifier', value: key })); }
    else if (key === '/') { event.preventDefault(); dispatch(actions.symbols()); }
    else if (['+','-','−','*','×','÷','='].includes(key)) { event.preventDefault(); dispatch(actions.command({ type: 'operator', value: ({ '-':'−','*':'×' } as Record<string, string>)[key] ?? key })); }
    else if (key === '(') { event.preventDefault(); dispatch(actions.command({ type: 'insert', value: 'group' })); }
    else if (key === 'ArrowLeft' || key === 'ArrowRight') { event.preventDefault(); dispatch(actions.horizontal(key === 'ArrowLeft' ? -1 : 1)); }
    else if (key === 'ArrowUp' || key === 'ArrowDown') { event.preventDefault(); dispatch(actions.vertical(key === 'ArrowUp' ? -1 : 1)); }
    else if (key === 'Backspace' || key === 'Delete') { event.preventDefault(); dispatch(actions.command({ type: key === 'Delete' ? 'deleteForward' : 'backspace' })); }
    else if (key === 'Enter' && !event.shiftKey) { event.preventDefault(); dispatch(actions.command({ type: 'newStep' })); }
  }

  const tools = <MathTools wide={wide}
    canUndo={state.past.some(item => item.exerciseId === exercise.id)}
    canRedo={state.future.some(item => item.exerciseId === exercise.id)}
    onUndo={() => { dispatch(actions.undo()); focusEditor(); }} onRedo={() => { dispatch(actions.redo()); focusEditor(); }}
    onInsert={insert} moreOpen={state.keyboardOpen && state.symbolsOpen} onMore={() => {
      if (!state.keyboardOpen) {
        dispatch(actions.keyboard(true));
        if (!state.symbolsOpen) dispatch(actions.symbols());
      } else dispatch(actions.symbols());
    }} />;

  return <section ref={root} className="lesson-math-editor" tabIndex={0} aria-label={`Math answer for ${question.id}`} onKeyDown={handleKey}>
      <div className="lesson-answer-heading"><h4>Write each step</h4><Button className="lesson-keyboard-toggle" aria-label={state.keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'} aria-expanded={state.keyboardOpen} onClick={() => dispatch(actions.keyboard(!state.keyboardOpen))}>{state.keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'}</Button></div>
      {wide && tools}
      <section className="lesson-answer-steps" aria-label={`Answer steps for ${question.id}`}>
        {exercise.steps.map((step, index) => <article className={`lesson-answer-step ${step.id === state.doc.cursor.stepId ? 'current-step' : ''}`} key={step.id}>
          <header><Button variant="ghost" className="lesson-step-title" onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); focusEditor(); }}>Step {index + 1}</Button>
            <span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>{step.status === 'needs-review' ? 'Needs review' : step.edited ? 'Edited' : ''}</span>
            <Button className="final-marker" aria-pressed={step.final} aria-label={`Mark Step ${index + 1} as final`} onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); dispatch(actions.command({ type: 'final' })); focusEditor(); }}>Final{step.final ? ' ✓' : ''}</Button>
          </header>
          <div className="expression" aria-label={`Step ${index + 1} expression`}><Formula sequence={step.expression} stepId={step.id} path={`Step ${index + 1}`} top /></div>
          {step.id === state.doc.cursor.stepId && <p className="selection small" aria-live="polite">Step {currentStepIndex + 1}{selected ? `${selected.path} · Caret ${state.doc.cursor.offset}` : ''}</p>}
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
