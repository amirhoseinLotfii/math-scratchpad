import { useRef, useState, type MutableRefObject } from 'react';
import { mathfieldForStep } from '../../features/math-editor/mathlive-adapter';
import type { ScratchStore } from '../../store';

export function useEditorFocus({
  store,
  editorRoot,
}: {
  store: ScratchStore;
  editorRoot: MutableRefObject<HTMLElement | null>;
}) {
  const [insertOpen, setInsertOpen] = useState(false);
  const insertInvoker = useRef<HTMLElement | null>(null);
  const restoreInsert = useRef(true);

  function focusEditor() {
    const field = mathfieldForStep(store.getState().doc.cursor.stepId);
    if (field) {
      field.focus();
      return;
    }
    editorRoot.current?.focus({ preventScroll: true });
  }

  function focusCurrentMathControl() {
    requestAnimationFrame(() => {
      const cursor = store.getState().doc.cursor;
      const mathfield = mathfieldForStep(cursor.stepId);
      if (mathfield) {
        mathfield.focus();
        mathfield.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        return;
      }
      const step = Array.from(document.querySelectorAll<HTMLElement>('[data-step-id]')).find(
        el => el.dataset.stepId === cursor.stepId
      );
      if (!step) {
        focusEditor();
        return;
      }
      const target = cursor.sequenceId
        ? Array.from(step.querySelectorAll<HTMLButtonElement>('.math-gap')).find(
            el =>
              el.dataset.sequenceId === cursor.sequenceId &&
              Number(el.dataset.gapIndex) === cursor.index
          )
        : cursor.nodeId
          ? Array.from(step.querySelectorAll<HTMLButtonElement>('[data-node-id]')).find(
              el => el.dataset.nodeId === cursor.nodeId
            )
          : undefined;
      if (!target) {
        focusEditor();
        return;
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  function openInsert(source?: HTMLElement) {
    insertInvoker.current = source ?? (document.activeElement as HTMLElement);
    restoreInsert.current = true;
    setInsertOpen(true);
  }

  function closeInsert() {
    restoreInsert.current = true;
    setInsertOpen(false);
  }

  function restoreInsertFocus() {
    const invoker = insertInvoker.current;
    const mathfieldInvoker = invoker?.matches('math-field')
      ? (invoker as HTMLElement & { hasFocus?: () => boolean })
      : null;
    const stepId = mathfieldInvoker?.dataset.stepId;
    const restore = (attempt = 0) => {
      const currentMathfield = (stepId ? mathfieldForStep(stepId) : null) as
        | (HTMLElement & { hasFocus?: () => boolean })
        | null;
      const target = currentMathfield?.isConnected ? currentMathfield : invoker;
      const isWorkControl =
        !!target?.isConnected &&
        (target.matches('math-field') || !!target.closest('[data-step-id]'));
      if (target?.isConnected && (restoreInsert.current || isWorkControl)) {
        const active = document.activeElement === target;
        const mathFocus = target.matches('math-field')
          ? (target as HTMLElement & { hasFocus?: () => boolean }).hasFocus?.()
          : undefined;
        if (!active || mathFocus === false) target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        if (
          attempt < 8 &&
          (document.activeElement !== target ||
            (target.matches('math-field') &&
              (target as HTMLElement & { hasFocus?: () => boolean }).hasFocus?.() === false))
        ) {
          requestAnimationFrame(() => restore(attempt + 1));
        }
        return;
      }
      if (attempt < 8) requestAnimationFrame(() => restore(attempt + 1));
      else focusCurrentMathControl();
    };
    requestAnimationFrame(() => requestAnimationFrame(() => restore()));
  }

  return {
    insertOpen,
    setInsertOpen,
    insertInvoker,
    restoreInsert,
    focusEditor,
    focusCurrentMathControl,
    openInsert,
    closeInsert,
    restoreInsertFocus,
  };
}
