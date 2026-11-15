import { type KeyboardEvent } from 'react';
import { actions } from '../store';

import { executeMathfield, insertMathSymbol, moveMathfield, redoMathfield, undoMathfield } from '../features/math-editor/mathlive-adapter';

import type { AppDispatch, ScratchStore } from '../store';
import type { RefObject } from 'react';

type ShortcutOptions = {
  chapterTransitioning: boolean;
  bankTransitionRef: RefObject<string | null>;
  modalOpen: boolean;
  insertOpen: boolean;
  setup: boolean;
  backup: boolean;
  confirmExam: boolean;
  confirmFractions: boolean;
  editorRoot: RefObject<HTMLElement | null>;
  store: ScratchStore;
  dispatch: AppDispatch;
  insert: (symbol: string) => void;
  openInsert: () => void;
  addStep: () => void;
  focusEditor: () => void;
  focusCurrentMathControl: () => void;
};
export function createEditorShortcuts({
  chapterTransitioning,
  bankTransitionRef,
  modalOpen,
  insertOpen,
  setup,
  backup,
  confirmExam,
  confirmFractions,
  editorRoot,
  store,
  dispatch,
  insert,
  openInsert,
  addStep,
  focusEditor,
  focusCurrentMathControl,
}: ShortcutOptions) {
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (chapterTransitioning || bankTransitionRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const key = event.key,
      target = event.target as HTMLElement;
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      modalOpen ||
      insertOpen ||
      setup ||
      backup ||
      confirmExam ||
      confirmFractions
    )
      return;
    const mathfieldTarget = target.closest('math-field');
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || (target.isContentEditable && !mathfieldTarget)) return;
    if (mathfieldTarget) {
      // Learn math checks own a separate editor store and their own shortcuts.
      if (mathfieldTarget.closest('.lesson-math-editor')) return;
      const stepId = mathfieldTarget.getAttribute('data-step-id');
      const step =
        stepId &&
        store
          .getState()
          .doc.exercises.flatMap((exercise) => exercise.steps)
          .find((item) => item.id === stepId);
      const firstCharacter = /^[0-9.]$/.test(key) || /^[a-zA-Z]$/.test(key) || ['+', '-', '−', '*', '×', '÷', '='].includes(key);
      // Route printable math tokens through MathLive's insertion API. Its native
      // first-key placeholder replacement can defer `input` while a React-controlled
      // Step is still blank, causing later keydowns to be split between native and
      // adapter insertion during rapid physical typing.
      if (step && firstCharacter && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const normalized = ({ '-': '−', '*': '×' } as Record<string, string>)[key] ?? key;
        if (insertMathSymbol(step.id, normalized)) {
          event.preventDefault();
          return;
        }
      }
      if (event.altKey && key === 'Enter') {
        event.preventDefault();
        dispatch(actions.command({ type: 'final' }));
      } else if (event.altKey && ['f', 'r'].includes(key.toLowerCase())) {
        event.preventDefault();
        insert(key.toLowerCase() === 'f' ? 'fraction' : 'root');
      } else if (key === '/') {
        event.preventDefault();
        openInsert();
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
      if (key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey ? !redoMathfield(stepId) : !undoMathfield(stepId)) dispatch(event.shiftKey ? actions.redo() : actions.undo());
        focusEditor();
      } else if (key.toLowerCase() === 'y') {
        event.preventDefault();
        if (!redoMathfield(stepId)) dispatch(actions.redo());
        focusEditor();
      } else if (key.toLowerCase() === 'a') {
        event.preventDefault();
        executeMathfield(stepId, 'selectAll');
        focusEditor();
      } else if (key.toLowerCase() === 'c') {
        event.preventDefault();
        executeMathfield(stepId, 'copyToClipboard');
        focusEditor();
      } else if (key.toLowerCase() === 'x') {
        event.preventDefault();
        executeMathfield(stepId, 'cutToClipboard');
        focusEditor();
      } else if (key.toLowerCase() === 'v') {
        event.preventDefault();
        executeMathfield(stepId, 'pasteFromClipboard');
        focusEditor();
      }
      return;
    }
    if (event.altKey && key === 'Enter') {
      event.preventDefault();
      dispatch(actions.command({ type: 'final' }));
      focusCurrentMathControl();
      return;
    }
    if (event.altKey && ['f', 'r'].includes(key.toLowerCase())) {
      event.preventDefault();
      insert(key.toLowerCase() === 'f' ? 'fraction' : 'root');
      return;
    }
    if (key === '/') {
      event.preventDefault();
      openInsert();
      return;
    }
    if (key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      addStep();
      return;
    }
    if (['ArrowLeft', 'ArrowRight'].includes(key)) {
      event.preventDefault();
      if (!moveMathfield(stepId, key === 'ArrowLeft' ? -1 : 1)) dispatch(actions.horizontal(key === 'ArrowLeft' ? -1 : 1));
      focusEditor();
      return;
    }
    if (key === 'Backspace' || key === 'Delete') {
      event.preventDefault();
      if (!executeMathfield(stepId, key === 'Delete' ? 'deleteForward' : 'deleteBackward'))
        dispatch(actions.command({ type: key === 'Delete' ? 'deleteForward' : 'backspace' }));
      focusEditor();
      return;
    }
    if (/^[0-9.]$/.test(key) || /^[a-zA-Z]$/.test(key) || ['+', '-', '−', '*', '×', '÷', '='].includes(key)) {
      event.preventDefault();
      const normalized = ({ '-': '−', '*': '×' } as Record<string, string>)[key] ?? key;
      if (!insertMathSymbol(stepId, normalized))
        dispatch(
          actions.command({ type: /^[0-9.]$/.test(key) ? 'digit' : /^[a-zA-Z]$/.test(key) ? 'identifier' : 'operator', value: normalized }),
        );
      focusEditor();
    }
  }
  return keyboard;
}
