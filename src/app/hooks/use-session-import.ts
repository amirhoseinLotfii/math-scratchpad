import { useEffect, useRef, useState } from 'react';
import { migrateChatDiagnosticSession } from '../../legacyDiagnostic';
import { validateSession } from '../../persistence';
import { actions, type ScratchState, type ScratchStore } from '../../store';
import { emitLearnEvent, type LearnEventContext } from '../../sync/events';
import type { SessionImportPayload } from '../practice-launcher';

function importUndoFingerprint(state: ScratchState) {
  const exercises = state.doc.exercises.map(
    ({ elapsedMs, timerRunningSince, timerPaused, ...exercise }) => exercise
  );
  return JSON.stringify({ doc: { ...state.doc, exercises }, prefs: state.prefs });
}

export function useSessionImport({
  state,
  store,
  sessionEventContext,
  onImported,
}: {
  state: ScratchState;
  store: ScratchStore;
  sessionEventContext: LearnEventContext;
  onImported: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingSessionImport, setPendingSessionImport] = useState<{
    payload: SessionImportPayload;
    source: string;
  } | null>(null);
  const [sessionImportUndo, setSessionImportUndo] = useState<{
    previous: SessionImportPayload;
    importedSnapshot: string;
  } | null>(null);

  const sessionSnapshot = importUndoFingerprint(state);
  const canUndoSessionImport =
    !!sessionImportUndo && sessionSnapshot === sessionImportUndo.importedSnapshot;

  useEffect(() => {
    if (sessionImportUndo && !canUndoSessionImport) setSessionImportUndo(null);
  }, [canUndoSessionImport, sessionImportUndo]);

  function requestSessionImport(payload: SessionImportPayload, source: string) {
    setPendingSessionImport({ payload, source });
  }

  function cancelSessionImport() {
    setPendingSessionImport(null);
  }

  function confirmSessionImport() {
    const request = pendingSessionImport;
    if (!request) return;
    const current = store.getState();
    const previous = { doc: current.doc, prefs: current.prefs };
    emitLearnEvent(sessionEventContext, { type: 'backup_restored', itemId: request.source });
    store.dispatch(actions.load(request.payload));
    setSessionImportUndo({
      previous,
      importedSnapshot: importUndoFingerprint(store.getState()),
    });
    setPendingSessionImport(null);
    onImported();
    store.dispatch(
      actions.notice(
        'Session restored. Undo is available until this session changes or the page reloads.'
      )
    );
  }

  function undoSessionImport() {
    const undo = sessionImportUndo;
    if (!undo || importUndoFingerprint(store.getState()) !== undo.importedSnapshot) {
      setSessionImportUndo(null);
      return;
    }
    store.dispatch(actions.load(undo.previous));
    setSessionImportUndo(null);
    onImported();
    store.dispatch(actions.notice('Previous session restored.'));
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1000000) throw Error('Backup file is too large.');
      const raw = JSON.parse(await file.text());
      requestSessionImport(
        migrateChatDiagnosticSession(raw) ?? validateSession(raw),
        file.name
      );
    } catch (error) {
      store.dispatch(
        actions.notice(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`)
      );
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return {
    fileInput,
    pendingSessionImport,
    canUndoSessionImport,
    requestSessionImport,
    cancelSessionImport,
    confirmSessionImport,
    undoSessionImport,
    importFile,
  };
}
