import { useEffect, useRef, useState } from 'react';
import { actions, type ScratchState } from '../store';
import { writeClipboard } from '../review';
import { serialize, validateSession } from '../persistence';
import { migrateChatDiagnosticSession } from '../legacy-diagnostic';

import { buildTutorExport, downloadText, missingFinalAnswers } from '../features/session/export/tutor-export';
import { isoLocal } from '../model';
import { type DriveBank } from '../features/drive-bank/drive-bank';
import { lessonExportDataFromState, readLessonExportData, type LessonExportData } from '../features/lessons/lesson-progress-store';
import { emitLearnEvent, type LearnEventContext } from '../sync/events';
import { usePracticeLauncher, type SessionImportPayload } from './practice-launcher';
import { useBankSession } from './use-bank-session';

import type { AppDispatch, ScratchStore } from '../store';
import type { Dispatch, SetStateAction } from 'react';
type LoadedBank = { bank: DriveBank; version: string };
type Launcher = ReturnType<typeof usePracticeLauncher>;
type BankSession = ReturnType<typeof useBankSession>;
type Set<T> = Dispatch<SetStateAction<T>>;

type SessionTransferOptions = {
  state: ScratchState;
  store: ScratchStore;
  dispatch: AppDispatch;
  jsonForm: Launcher['jsonForm'];
  openInlinePanel: Launcher['openInlinePanel'];
  loadedBank: LoadedBank | null;
  lessonProgressRef: BankSession['lessonProgressRef'];
  sessionEventContext: LearnEventContext;
  sessionId: string;
  setShowResults: Set<boolean>;
};
function importUndoFingerprint(state: ScratchState) {
  // QuestionTimer starts a new timing segment after load; that automatic metadata must not consume Undo.
  const exercises = state.doc.exercises.map(({ elapsedMs, timerRunningSince, timerPaused, ...exercise }) => exercise);
  return JSON.stringify({ doc: { ...state.doc, exercises }, prefs: state.prefs });
}

export function useSessionTransfer({
  state,
  store,
  dispatch,
  jsonForm,
  openInlinePanel,
  loadedBank,
  lessonProgressRef,
  sessionEventContext,
  sessionId,
  setShowResults,
}: SessionTransferOptions) {
  const [exportWarning, setExportWarning] = useState<number[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingSessionImport, setPendingSessionImport] = useState<{ payload: SessionImportPayload; source: string } | null>(null);
  const [sessionImportUndo, setSessionImportUndo] = useState<{ previous: SessionImportPayload; importedSnapshot: string } | null>(null);
  const sessionSnapshot = importUndoFingerprint(state);
  const canUndoSessionImport = !!sessionImportUndo && sessionSnapshot === sessionImportUndo.importedSnapshot;
  useEffect(() => {
    if (sessionImportUndo && !canUndoSessionImport) setSessionImportUndo(null);
  }, [canUndoSessionImport, sessionImportUndo]);
  async function copySession() {
    const text = serialize(store.getState());
    if (await writeClipboard(text)) dispatch(actions.notice('Full session JSON copied.'));
    else {
      jsonForm.reset({ json: text });
      openInlinePanel('backup');
      dispatch(actions.notice('Clipboard blocked. Select and copy the session JSON manually.'));
    }
  }
  const stamp = () => isoLocal().slice(0, 16).replace(/:/g, '');
  async function exportTutor(force = false) {
    const doc = store.getState().doc,
      missing = missingFinalAnswers(doc);
    if (!force && missing.length) {
      setExportWarning(missing);
      return;
    }
    setExportWarning(null);
    const meta = doc.session;
    let lessonExport: LessonExportData | undefined;
    if (meta?.bankId && meta.bankVersion) {
      if (loadedBank?.bank.bank_id === meta.bankId && loadedBank.version === meta.bankVersion && loadedBank.bank.lessons?.length)
        lessonExport = lessonExportDataFromState(lessonProgressRef.current);
      else {
        const saved = readLessonExportData(meta.bankId, meta.bankVersion);
        if (saved.found) lessonExport = saved.data;
      }
    }
    const data = buildTutorExport(doc, new Date(), lessonExport),
      text = JSON.stringify(data, null, 2);
    emitLearnEvent(sessionEventContext, {
      type: 'report_generated',
      itemId: `session:${data.session_id}`,
      note: 'Tutor export generated.',
    });
    const copiedOk = await writeClipboard(text),
      saved = downloadText(`math-session-${data.session_id}.json`, text);
    if (!copiedOk) {
      jsonForm.reset({ json: text });
      openInlinePanel('backup');
    }
    dispatch(actions.notice(`Tutor export ready${copiedOk ? ' · copied' : ''}${saved ? ' · downloaded' : ''}.`));
  }
  function downloadBackup() {
    const saved = downloadText(`math-scratchpad-backup-${stamp()}.json`, serialize(store.getState()));
    if (saved) emitLearnEvent(sessionEventContext, { type: 'backup_created', itemId: `session:${sessionId || 'unknown'}` });
    dispatch(actions.notice(saved ? 'Backup file downloaded.' : 'Download blocked. Use Session JSON to copy the backup.'));
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1000000) throw Error('Backup file is too large.');
      const raw = JSON.parse(await file.text());
      requestSessionImport(migrateChatDiagnosticSession(raw) ?? validateSession(raw), file.name);
    } catch (error) {
      dispatch(actions.notice(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }
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
    dispatch(actions.load(request.payload));
    setSessionImportUndo({ previous, importedSnapshot: importUndoFingerprint(store.getState()) });
    setPendingSessionImport(null);
    setShowResults(false);
    jsonForm.reset({ json: '' });
    openInlinePanel('backup');
    dispatch(actions.notice('Session restored. Undo is available until this session changes or the page reloads.'));
  }
  function undoSessionImport() {
    const undo = sessionImportUndo;
    if (!undo || importUndoFingerprint(store.getState()) !== undo.importedSnapshot) {
      setSessionImportUndo(null);
      return;
    }
    dispatch(actions.load(undo.previous));
    setSessionImportUndo(null);
    setShowResults(false);
    dispatch(actions.notice('Previous session restored.'));
  }

  return {
    exportWarning,
    setExportWarning,
    fileInput,
    pendingSessionImport,
    canUndoSessionImport,
    copySession,
    exportTutor,
    downloadBackup,
    importFile,
    requestSessionImport,
    cancelSessionImport,
    confirmSessionImport,
    undoSessionImport,
  };
}
