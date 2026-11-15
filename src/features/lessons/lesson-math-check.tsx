import { useLessonEditorFocus } from './use-lesson-editor-focus';
import { createLessonEditorShortcuts } from './lesson-editor-shortcuts';
import { Fragment, createContext, useContext, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { Provider } from '../../app/store-provider';
import { MathTools } from '../workspace/components/math-tools';
import { MathInsertDialog } from '../math-editor/components/math-insert-dialog';
import { Keyboard } from '../math-editor/components/keyboard';
import { actions, exerciseOf } from '../../store';
import { stepIsBlank, stepLatex, type Step } from '../../model';
import { Button } from '../../shared/ui/button';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';
import { insertMathSymbol, mathfieldForStep, redoMathfield, undoMathfield } from '../math-editor/mathlive-adapter';
import { MathLiveStepInput } from '../math-editor/components/mathlive-step-input';
import { localizeLessonDigits } from './lesson-content';

export { createLessonMathStore } from './lesson-math-store';

/** Coordinates the inline math keyboards across a single lesson.
 * Stores remain independent so switching exercises cannot discard answers. */
export const LessonKeyboardContext = createContext<{
  activeId: string | null;
  setActiveId: (id: string | null) => void;
} | null>(null);

function dispatchInsert(store: ScratchStore, kind: string) {
  if (insertMathSymbol(store.getState().doc.cursor.stepId, kind)) return;
  if (['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠', '±', '∓'].includes(kind))
    store.dispatch(actions.command({ type: 'operator', value: kind }));
  else if (kind === 'number') store.dispatch(actions.command({ type: 'insertBlankNumber' }));
  else if (kind === 'x' || kind === 'y' || kind === 'n' || kind === 't')
    store.dispatch(actions.command({ type: 'identifier', value: kind }));
  else store.dispatch(actions.command({ type: 'insert', value: kind }));
}

function Editor({
  question,
  store,
  onAnswered,
  uiLang,
}: {
  question: BankQuestion;
  store: ScratchStore;
  onAnswered: (id: string, answer: { type: 'math'; steps: Step[] }) => void;
  uiLang: 'fa' | 'en';
}) {
  const layout = useWorkspaceLayout(),
    wide = layout !== 'phone';
  const fa = uiLang === 'fa';
  const root = useRef<HTMLElement>(null);
  const insertInvoker = useRef<HTMLElement | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const keyboardOwner = useContext(LessonKeyboardContext);
  const { steps, exerciseId, stepId, keyboardOpen, symbolsOpen, past, future } = useAppSelector((state) => ({
    steps: exerciseOf(state.doc).steps,
    exerciseId: state.doc.exerciseId,
    stepId: state.doc.cursor.stepId,
    keyboardOpen: state.keyboardOpen,
    symbolsOpen: state.symbolsOpen,
    past: state.past,
    future: state.future,
  }));
  const dispatch = useAppDispatch();
  const currentStepIndex = steps.findIndex((step) => step.id === stepId);
  const answered = steps.some((step) => !stepIsBlank(step));

  // Only one inline exercise keyboard at a time. Never reset the math store.
  useEffect(() => {
    if (keyboardOpen && keyboardOwner?.activeId && keyboardOwner.activeId !== question.id) {
      dispatch(actions.keyboard(false));
    }
  }, [dispatch, keyboardOwner?.activeId, question.id, keyboardOpen]);

  useEffect(() => onAnswered(question.id, { type: 'math', steps: steps }), [answered, steps, onAnswered, question.id]);

  const focusEditor = useLessonEditorFocus(store, root);
  function insert(kind: string) {
    dispatchInsert(store, kind);
    focusEditor();
  }
  function openInsertDialog(target: HTMLElement) {
    const field = target.closest('math-field');
    insertInvoker.current = field instanceof HTMLElement ? field : (document.activeElement as HTMLElement | null);
    setInsertOpen(true);
  }
  function insertFromDialog(kind: string) {
    dispatchInsert(store, kind);
    dispatch(actions.recentSymbol(kind));
    dispatch(actions.closeSymbols());
  }
  function restoreInsertFocus(event: Event) {
    event.preventDefault();
    const invoker = insertInvoker.current;
    const mathfieldInvoker = invoker?.matches('math-field') ? (invoker as HTMLElement & { hasFocus?: () => boolean }) : null;
    const stepId = mathfieldInvoker?.dataset.stepId;
    const restore = (attempt = 0) => {
      const currentMathfield = (stepId ? mathfieldForStep(stepId) : null) as (HTMLElement & { hasFocus?: () => boolean }) | null;
      const target = currentMathfield?.isConnected ? currentMathfield : invoker;
      if (target?.isConnected) {
        const mathFocus = target.matches('math-field') ? (target as HTMLElement & { hasFocus?: () => boolean }).hasFocus?.() : undefined;
        if (document.activeElement !== target || mathFocus === false) target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        if (
          attempt < 8 &&
          (document.activeElement !== target ||
            (target.matches('math-field') && (target as HTMLElement & { hasFocus?: () => boolean }).hasFocus?.() === false))
        ) {
          requestAnimationFrame(() => restore(attempt + 1));
        }
        return;
      }
      if (attempt < 8) requestAnimationFrame(() => restore(attempt + 1));
      else focusEditor();
    };
    restore();
  }
  const handleKey = createLessonEditorShortcuts({ steps, stepId, root, dispatch, insert, openInsertDialog, focusEditor });
  const tools = (
    <MathTools
      wide={wide}
      canUndo={!!mathfieldForStep(stepId)?.canUndo() || past.some((item) => item.exerciseId === exerciseId)}
      canRedo={!!mathfieldForStep(stepId)?.canRedo() || future.some((item) => item.exerciseId === exerciseId)}
      onUndo={() => {
        if (!undoMathfield(stepId)) dispatch(actions.undo());
        focusEditor();
      }}
      onRedo={() => {
        if (!redoMathfield(stepId)) dispatch(actions.redo());
        focusEditor();
      }}
      onInsert={insert}
      moreOpen={keyboardOpen && symbolsOpen}
      onMore={() => {
        if (!keyboardOpen) {
          dispatch(actions.keyboard(true));
          keyboardOwner?.setActiveId(question.id);
          if (!symbolsOpen) dispatch(actions.symbols());
        } else dispatch(actions.symbols());
      }}
    />
  );

  return (
    <section
      ref={root}
      className="lesson-math-editor"
      tabIndex={0}
      aria-label={`${fa ? 'پاسخ ریاضی برای' : 'Math answer for'} ${question.id}`}
      onKeyDownCapture={handleKey}
    >
      <div className="lesson-answer-heading">
        <h4>{fa ? 'راه‌حل را گام‌به‌گام بنویسید' : 'Write each step'}</h4>
        <Button
          className="lesson-keyboard-toggle"
          aria-label={keyboardOpen ? (fa ? 'بستن صفحه‌کلید' : 'Hide Keyboard') : fa ? 'بازکردن صفحه‌کلید' : 'Show Keyboard'}
          aria-expanded={keyboardOpen}
          onClick={() => {
            const open = !keyboardOpen;
            dispatch(actions.keyboard(open));
            keyboardOwner?.setActiveId(open ? question.id : null);
            if (open) focusEditor();
          }}
        >
          {keyboardOpen ? (fa ? 'بستن صفحه‌کلید' : 'Hide Keyboard') : fa ? 'بازکردن صفحه‌کلید' : 'Show Keyboard'}
        </Button>
      </div>
      {wide && tools}
      <section className="lesson-answer-steps" aria-label={`${fa ? 'گام‌های پاسخ تمرین' : 'Steps for check'} ${question.id}`}>
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            <article className={`lesson-answer-step ${step.id === stepId ? 'current-step' : ''}`} key={step.id}>
              <header>
                <Button
                  variant="ghost"
                  className="lesson-step-title"
                  onClick={() => {
                    dispatch(actions.select({ stepId: step.id }));
                    focusEditor();
                  }}
                >
                  {fa ? 'گام' : 'Step'} {localizeLessonDigits(index + 1, uiLang)}
                </Button>
                <span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>
                  {step.status === 'needs-review'
                    ? fa
                      ? 'نیازمند بازبینی'
                      : 'Needs review'
                    : step.edited
                      ? fa
                        ? 'ویرایش‌شده'
                        : 'Edited'
                      : ''}
                </span>
                {index > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lesson-step-delete"
                    title={fa ? `حذف گام ${localizeLessonDigits(index + 1, uiLang)}` : `Delete Step ${index + 1}`}
                    aria-label={fa ? `حذف گام ${localizeLessonDigits(index + 1, uiLang)}` : `Delete Step ${index + 1}`}
                    onClick={() => {
                      dispatch(actions.select({ stepId: step.id }));
                      dispatch(actions.command({ type: 'deleteStep' }));
                      requestAnimationFrame(focusEditor);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
                <Button
                  className="final-marker"
                  aria-pressed={step.final}
                  aria-label={fa ? `پاسخ نهایی، گام ${localizeLessonDigits(index + 1, uiLang)}` : `Final answer, Step ${index + 1}`}
                  onClick={() => {
                    dispatch(actions.select({ stepId: step.id }));
                    dispatch(actions.command({ type: 'final' }));
                    focusEditor();
                  }}
                >
                  {fa ? 'پاسخ نهایی' : 'Final answer'}
                  {step.final ? ' ✓' : ''}
                </Button>
              </header>
              <div className="expression" data-step-id={step.id}>
                <MathLiveStepInput
                  stepId={step.id}
                  value={stepLatex(step)}
                  label={fa ? `عبارت گام ${localizeLessonDigits(index + 1, uiLang)}` : `Step ${index + 1} expression`}
                  onInput={(value) => dispatch(actions.mathLiveInput({ stepId: step.id, value }))}
                  onFocusStep={() => dispatch(actions.select({ stepId: step.id }))}
                />
              </div>
            </article>
            {keyboardOpen && step.id === stepId && (
              <div className="lesson-active-step-keyboard">
                <Keyboard onFocusEditor={focusEditor} />
              </div>
            )}
          </Fragment>
        ))}
      </section>
      <Button
        className="add-step"
        onClick={() => {
          dispatch(actions.command({ type: 'newStep' }));
          focusEditor();
        }}
      >
        {fa ? 'افزودن گام' : 'Add step'}
      </Button>
      {!wide && tools}
      <MathInsertDialog
        open={insertOpen}
        onOpenChange={setInsertOpen}
        wide={wide}
        onInsert={insertFromDialog}
        onCloseAutoFocus={restoreInsertFocus}
      />
    </section>
  );
}

export function LessonMathCheck({
  question,
  store,
  onAnswered,
  uiLang = 'en',
}: {
  question: BankQuestion;
  store: ScratchStore;
  onAnswered: (id: string, answer: { type: 'math'; steps: Step[] }) => void;
  uiLang?: 'fa' | 'en';
}) {
  return (
    <Provider store={store}>
      <Editor question={question} store={store} onAnswered={onAnswered} uiLang={uiLang} />
    </Provider>
  );
}
