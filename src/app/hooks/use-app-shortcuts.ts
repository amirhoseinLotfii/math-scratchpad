import type { Selector } from 'mathlive';
import type { KeyboardEvent, MutableRefObject } from 'react';
import {
  executeMathfield,
  insertMathSymbol,
  moveMathfield,
  redoMathfield,
  undoMathfield,
} from '../../features/math-editor/mathlive-adapter';
import { leaves, type Exercise } from '../../model';
import { actions, type ScratchStore } from '../../store';
import { useEditorFocus } from './use-editor-focus';

const CLIPBOARD_COMMANDS: Record<string, Selector> = {
  a: 'selectAll',
  c: 'copyToClipboard',
  x: 'cutToClipboard',
  v: 'pasteFromClipboard',
};

export function useAppShortcuts({
  store,
  ex,
  editorRoot,
  chapterTransitioning,
  bankTransitionRef,
  modalOpen,
  inlinePanelActive,
}: {
  store: ScratchStore;
  ex: Exercise;
  editorRoot: MutableRefObject<HTMLElement | null>;
  chapterTransitioning: boolean;
  bankTransitionRef: MutableRefObject<string | null>;
  modalOpen: boolean;
  inlinePanelActive: boolean;
}) {
  const focus = useEditorFocus({ store, editorRoot });

  function insert(kind: string) {
    const stepId = store.getState().doc.cursor.stepId;
    if (!insertMathSymbol(stepId, kind)) {
      if (['x', 'y', 'n', 't', 'infinity', 'sigma'].includes(kind)) {
        store.dispatch(
          actions.command({
            type: 'identifier',
            value: kind === 'infinity' ? '∞' : kind === 'sigma' ? 'σ' : kind,
          })
        );
      } else if (kind === 'number') {
        store.dispatch(actions.command({ type: 'insertBlankNumber' }));
      } else if (['+', '−', '×', '÷', '=', '≤', '≥', '≠', '<', '>', '±', '∓'].includes(kind)) {
        store.dispatch(actions.command({ type: 'operator', value: kind }));
      } else {
        store.dispatch(actions.command({ type: 'insert', value: kind }));
      }
    }
    store.dispatch(actions.recentSymbol(kind));
    store.dispatch(actions.closeSymbols());
    focus.restoreInsert.current = false;
    focus.setInsertOpen(false);
  }

  function addStep() {
    store.dispatch(actions.command({ type: 'newStep' }));
    focus.focusCurrentMathControl();
  }

  function resetStep(id: string) {
    const nodeId = leaves(ex.steps.find(s => s.id === id)!.expression)[0].node.id;
    store.dispatch(actions.select({ stepId: id, nodeId }));
    store.dispatch(actions.command({ type: 'clear' }));
    focus.focusCurrentMathControl();
  }

  function deleteStep(id: string) {
    if (id === ex.steps[0].id) return;
    const nodeId = leaves(ex.steps.find(s => s.id === id)!.expression)[0].node.id;
    store.dispatch(actions.select({ stepId: id, nodeId }));
    store.dispatch(actions.command({ type: 'deleteStep' }));
    focus.focusCurrentMathControl();
  }

  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (chapterTransitioning || bankTransitionRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const key = event.key;
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || event.nativeEvent.isComposing || modalOpen || inlinePanelActive)
      return;
    const mathfieldTarget = target.closest('math-field');
    if (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      (target.isContentEditable && !mathfieldTarget)
    )
      return;
    const firstChar =
      /^[0-9.]$/.test(key) ||
      /^[a-zA-Z]$/.test(key) ||
      ['+', '-', '−', '*', '×', '÷', '='].includes(key);
    const normalized = ({ '-': '−', '*': '×' } as Record<string, string>)[key] ?? key;

    if (mathfieldTarget) {
      if (mathfieldTarget.closest('.lesson-math-editor')) return;
      const stepId = mathfieldTarget.getAttribute('data-step-id');
      const step =
        stepId &&
        store
          .getState()
          .doc.exercises.flatMap(exercise => exercise.steps)
          .find(item => item.id === stepId);
      if (step && firstChar && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (insertMathSymbol(step.id, normalized)) {
          event.preventDefault();
          return;
        }
      }
      if (event.altKey && key === 'Enter') {
        event.preventDefault();
        store.dispatch(actions.command({ type: 'final' }));
      } else if (event.altKey && ['f', 'r'].includes(key.toLowerCase())) {
        event.preventDefault();
        insert(key.toLowerCase() === 'f' ? 'fraction' : 'root');
      } else if (key === '/') {
        event.preventDefault();
        focus.openInsert();
      } else if (key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        addStep();
      }
      return;
    }

    const inMath = target === editorRoot.current || !!target.closest('.expression');
    if (!inMath) return;
    const stepId = store.getState().doc.cursor.stepId;
    if (event.ctrlKey || event.metaKey) {
      const k = key.toLowerCase();
      if (k === 'z') {
        event.preventDefault();
        if (event.shiftKey ? !redoMathfield(stepId) : !undoMathfield(stepId))
          store.dispatch(event.shiftKey ? actions.redo() : actions.undo());
        focus.focusEditor();
      } else if (k === 'y') {
        event.preventDefault();
        if (!redoMathfield(stepId)) store.dispatch(actions.redo());
        focus.focusEditor();
      } else if (CLIPBOARD_COMMANDS[k]) {
        event.preventDefault();
        executeMathfield(stepId, CLIPBOARD_COMMANDS[k]);
        focus.focusEditor();
      }
      return;
    }
    if (event.altKey && key === 'Enter') {
      event.preventDefault();
      store.dispatch(actions.command({ type: 'final' }));
      focus.focusCurrentMathControl();
      return;
    }
    if (event.altKey && ['f', 'r'].includes(key.toLowerCase())) {
      event.preventDefault();
      insert(key.toLowerCase() === 'f' ? 'fraction' : 'root');
      return;
    }
    if (key === '/') {
      event.preventDefault();
      focus.openInsert();
      return;
    }
    if (key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      addStep();
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      const dir = key === 'ArrowLeft' ? -1 : 1;
      if (!moveMathfield(stepId, dir)) store.dispatch(actions.horizontal(dir));
      focus.focusEditor();
      return;
    }
    if (key === 'Backspace' || key === 'Delete') {
      event.preventDefault();
      const forward = key === 'Delete';
      if (!executeMathfield(stepId, forward ? 'deleteForward' : 'deleteBackward'))
        store.dispatch(actions.command({ type: forward ? 'deleteForward' : 'backspace' }));
      focus.focusEditor();
      return;
    }
    if (firstChar) {
      event.preventDefault();
      if (!insertMathSymbol(stepId, normalized))
        store.dispatch(
          actions.command({
            type: /^[0-9.]$/.test(key)
              ? 'digit'
              : /^[a-zA-Z]$/.test(key)
                ? 'identifier'
                : 'operator',
            value: normalized,
          })
        );
      focus.focusEditor();
    }
  }

  return { ...focus, insert, addStep, resetStep, deleteStep, keyboard };
}
