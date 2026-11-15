import { type KeyboardEvent } from 'react';
import { actions } from '../../store';
import { type Step } from '../../model';
import { executeMathfield, insertMathSymbol, moveMathfield, redoMathfield, undoMathfield } from '../math-editor/mathlive-adapter';

import type { RefObject } from 'react';
import type { AppDispatch } from '../../store';
type Options = {
  steps: Step[];
  stepId: string;
  root: RefObject<HTMLElement | null>;
  dispatch: AppDispatch;
  insert: (symbol: string) => void;
  openInsertDialog: (target: HTMLElement) => void;
  focusEditor: () => void;
};
export function createLessonEditorShortcuts({ steps, stepId, root, dispatch, insert, openInsertDialog, focusEditor }: Options) {
  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement,
      key = event.key;
    if (target.closest('math-field')) {
      const mathfield = target.closest<HTMLElement & { getAttribute(name: string): string | null }>('math-field');
      const fieldStepId = mathfield?.getAttribute('data-step-id');
      const step = steps.find((item) => item.id === fieldStepId);
      const firstCharacter = /^[0-9.]$/.test(key) || /^[a-zA-Z]$/.test(key) || ['+', '-', '−', '*', '×', '÷', '='].includes(key);
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
      } else if (key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        dispatch(actions.command({ type: 'newStep' }));
        focusEditor();
      } else if (key === '/') {
        event.preventDefault();
        openInsertDialog(target);
      }
      return;
    }
    if (target !== root.current && !target.closest('.expression')) return;
    if (event.ctrlKey || event.metaKey) {
      if (key.toLowerCase() === 'z') {
        event.preventDefault();
        if (!event.shiftKey || !redoMathfield(stepId)) {
          if (event.shiftKey) dispatch(actions.redo());
          else if (!undoMathfield(stepId)) dispatch(actions.undo());
        }
      } else if (key.toLowerCase() === 'y') {
        event.preventDefault();
        if (!redoMathfield(stepId)) dispatch(actions.redo());
      } else if (key.toLowerCase() === 'a') {
        event.preventDefault();
        executeMathfield(stepId, 'selectAll');
      } else if (key.toLowerCase() === 'c') {
        event.preventDefault();
        executeMathfield(stepId, 'copyToClipboard');
      } else if (key.toLowerCase() === 'x') {
        event.preventDefault();
        executeMathfield(stepId, 'cutToClipboard');
      } else if (key.toLowerCase() === 'v') {
        event.preventDefault();
        executeMathfield(stepId, 'pasteFromClipboard');
      }
      return;
    }
    if (event.altKey && key === 'Enter') {
      event.preventDefault();
      dispatch(actions.command({ type: 'final' }));
      return;
    }
    if (event.altKey) return;
    if (/^[0-9.]$/.test(key)) {
      event.preventDefault();
      insert(key);
    } else if (/^[a-zA-Z]$/.test(key)) {
      event.preventDefault();
      insert(key);
    } else if (key === '/') {
      event.preventDefault();
      openInsertDialog(target);
    } else if (['+', '-', '−', '*', '×', '÷', '='].includes(key)) {
      event.preventDefault();
      insert(({ '-': '−', '*': '×' } as Record<string, string>)[key] ?? key);
    } else if (key === '(') {
      event.preventDefault();
      insert('group');
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      if (!moveMathfield(stepId, key === 'ArrowLeft' ? -1 : 1)) dispatch(actions.horizontal(key === 'ArrowLeft' ? -1 : 1));
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      dispatch(actions.vertical(key === 'ArrowUp' ? -1 : 1));
    } else if (key === 'Backspace' || key === 'Delete') {
      event.preventDefault();
      if (!executeMathfield(stepId, key === 'Delete' ? 'deleteForward' : 'deleteBackward'))
        dispatch(actions.command({ type: key === 'Delete' ? 'deleteForward' : 'backspace' }));
    } else if (key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dispatch(actions.command({ type: 'newStep' }));
    }
  }

  return handleKey;
}
