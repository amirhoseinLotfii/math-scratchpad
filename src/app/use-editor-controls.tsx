import { createEditorShortcuts } from './editor-shortcuts';
import { useLayoutEffect, useRef, useState } from 'react';
import { actions, type ScratchState } from '../store';
import { leaves } from '../model';

import { MathTools } from '../features/workspace/components/math-tools';
import {
  readWorkspaceTemplate,
  writeWorkspaceTemplate,
  type WorkspaceTemplate,
  workspaceTemplateStorageKey,
} from '../features/workspace/model/workspace-templates';
import { insertMathSymbol, mathfieldForStep, redoMathfield, undoMathfield } from '../features/math-editor/mathlive-adapter';

import type { AppDispatch, ScratchStore } from '../store';
import type { Exercise } from '../model';
import type { RefObject } from 'react';

type EditorControlsOptions = {
  store: ScratchStore;
  dispatch: AppDispatch;
  editorRoot: RefObject<HTMLElement | null>;
  ex: Exercise;
  chapterTransitioning: boolean;
  bankTransitionRef: RefObject<string | null>;
  modalOpen: boolean;
  setup: boolean;
  backup: boolean;
  confirmExam: boolean;
  confirmFractions: boolean;
  wide: boolean;
  state: Pick<ScratchState, 'doc' | 'past' | 'future'>;
};

export function useEditorControls({
  store,
  dispatch,
  editorRoot,
  ex,
  chapterTransitioning,
  bankTransitionRef,
  modalOpen,
  setup,
  backup,
  confirmExam,
  confirmFractions,
  wide,
  state,
}: EditorControlsOptions) {
  const [insertOpen, setInsertOpen] = useState(false);
  const insertInvoker = useRef<HTMLElement | null>(null),
    restoreInsert = useRef(true);
  const workspaceTemplateScope = workspaceTemplateStorageKey(state.doc.session?.bankId, state.doc.session?.chapter);
  const [workspaceTemplate, setWorkspaceTemplate] = useState<WorkspaceTemplate>(() => {
    try {
      return readWorkspaceTemplate(window.localStorage, state.doc.session?.bankId, state.doc.session?.chapter);
    } catch {
      return 'general';
    }
  });
  useLayoutEffect(() => {
    try {
      setWorkspaceTemplate(readWorkspaceTemplate(window.localStorage, state.doc.session?.bankId, state.doc.session?.chapter));
    } catch {
      setWorkspaceTemplate('general');
    }
  }, [workspaceTemplateScope]);
  function changeWorkspaceTemplate(template: WorkspaceTemplate) {
    setWorkspaceTemplate(template);
    try {
      writeWorkspaceTemplate(window.localStorage, template, state.doc.session?.bankId, state.doc.session?.chapter);
    } catch {
      /* Workspace preferences are optional when browser storage is unavailable. */
    }
  }
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
        (element) => element.dataset.stepId === cursor.stepId,
      );
      if (!step) {
        focusEditor();
        return;
      }
      let target: HTMLButtonElement | undefined;
      if (cursor.sequenceId) {
        target = Array.from(step.querySelectorAll<HTMLButtonElement>('.math-gap')).find(
          (element) => element.dataset.sequenceId === cursor.sequenceId && Number(element.dataset.gapIndex) === cursor.index,
        );
      } else if (cursor.nodeId) {
        target = Array.from(step.querySelectorAll<HTMLButtonElement>('[data-node-id]')).find(
          (element) => element.dataset.nodeId === cursor.nodeId,
        );
      }
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
    const mathfieldInvoker = invoker?.matches('math-field') ? (invoker as HTMLElement & { hasFocus?: () => boolean }) : null;
    const stepId = mathfieldInvoker?.dataset.stepId;
    const restore = (attempt = 0) => {
      // Prefer the live MathLive instance for this step. State updates caused by
      // inserting a symbol can replace the custom element while Radix is closing.
      const currentMathfield = (stepId ? mathfieldForStep(stepId) : null) as (HTMLElement & { hasFocus?: () => boolean }) | null;
      const target = currentMathfield?.isConnected ? currentMathfield : invoker;
      const isWorkControl = !!target?.isConnected && (target.matches('math-field') || !!target.closest('[data-step-id]'));
      if (target?.isConnected && (restoreInsert.current || isWorkControl)) {
        const active = document.activeElement === target;
        const mathFocus = target.matches('math-field') ? (target as HTMLElement & { hasFocus?: () => boolean }).hasFocus?.() : undefined;
        if (!active || mathFocus === false) target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        // The modal focus scope and MathLive's shadow editor can both settle after
        // the first focus call. Retry briefly if another close-time blur wins.
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
      else focusCurrentMathControl();
    };
    // Wait until Radix has removed its focus scope before restoring MathLive.
    requestAnimationFrame(() => requestAnimationFrame(() => restore()));
  }
  function insert(kind: string) {
    const stepId = store.getState().doc.cursor.stepId;
    if (!insertMathSymbol(stepId, kind)) {
      if (['x', 'y', 'n', 't', 'infinity', 'sigma'].includes(kind))
        dispatch(actions.command({ type: 'identifier', value: kind === 'infinity' ? '∞' : kind === 'sigma' ? 'σ' : kind }));
      else if (kind === 'number') dispatch(actions.command({ type: 'insertBlankNumber' }));
      else if (['+', '−', '×', '÷', '=', '≤', '≥', '≠', '<', '>', '±', '∓'].includes(kind))
        dispatch(actions.command({ type: 'operator', value: kind }));
      else dispatch(actions.command({ type: 'insert', value: kind }));
    }
    dispatch(actions.recentSymbol(kind));
    dispatch(actions.closeSymbols());
    restoreInsert.current = false;
    setInsertOpen(false);
  }
  function addStep() {
    dispatch(actions.command({ type: 'newStep' }));
    focusCurrentMathControl();
  }
  function resetStep(id: string) {
    dispatch(actions.select({ stepId: id, nodeId: leaves(ex.steps.find((s) => s.id === id)!.expression)[0].node.id }));
    dispatch(actions.command({ type: 'clear' }));
    focusCurrentMathControl();
  }
  function deleteStep(id: string) {
    if (id === ex.steps[0].id) return;
    dispatch(actions.select({ stepId: id, nodeId: leaves(ex.steps.find((s) => s.id === id)!.expression)[0].node.id }));
    dispatch(actions.command({ type: 'deleteStep' }));
    focusCurrentMathControl();
  }
  const keyboard = createEditorShortcuts({
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
  });
  const activeMathfield = mathfieldForStep(state.doc.cursor.stepId);
  const canUndo = !!activeMathfield?.canUndo() || state.past.some((d) => d.exerciseId === ex.id);
  const canRedo = !!activeMathfield?.canRedo() || state.future.some((d) => d.exerciseId === ex.id);
  const mathTools = (
    <MathTools
      wide={wide}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={() => {
        if (!undoMathfield(state.doc.cursor.stepId)) dispatch(actions.undo());
        focusEditor();
      }}
      onRedo={() => {
        if (!redoMathfield(state.doc.cursor.stepId)) dispatch(actions.redo());
        focusEditor();
      }}
      onInsert={insert}
      onMore={openInsert}
      workspaceTemplate={workspaceTemplate}
      onWorkspaceTemplateChange={changeWorkspaceTemplate}
    />
  );

  return {
    focusEditor,
    focusCurrentMathControl,
    openInsert,
    closeInsert,
    restoreInsertFocus,
    insert,
    addStep,
    resetStep,
    deleteStep,
    keyboard,
    mathTools,
    insertOpen,
    setInsertOpen,
    insertInvoker,
    restoreInsert,
  };
}
