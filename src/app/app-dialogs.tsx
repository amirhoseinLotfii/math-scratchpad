import { questionStatus } from '../features/workspace/model/workspace-layout';
import { DialogsHost } from './dialogs-host';

import type { AppViewState } from './use-app-controller';
export function AppDialogs({
  fileInput,
  importFile,
  menuInvoker,
  focusEditor,
  state,
  shortcutsOpen,
  setShortcutsOpen,
  exportWarning,
  setExportWarning,
  exportTutor,
  resetKind,
  setResetKind,
  downloadBackup,
  confirmReset,
  pendingSessionImport,
  cancelSessionImport,
  confirmSessionImport,
  wellbeing,
  decision,
  ex,
  invoker,
  cancelDecision,
  confirmDecision,
  complete,
  answeredCount,
  skippedCount,
  setComplete,
  copyReview,
  copySession,
  setShowResults,
  insertOpen,
  restoreInsert,
  closeInsert,
  setInsertOpen,
  wide,
  insert,
  insertInvoker,
  restoreInsertFocus,
  serverConflict,
  serverConflictBusy,
  serverConflictError,
  resolveServerConflict,
}: AppViewState) {
  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Import backup file"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
        }}
      />
      <DialogsHost
        menuInvokerRef={menuInvoker}
        focusEditor={focusEditor}
        session={state.doc.session}
        shortcuts={{ open: shortcutsOpen, setOpen: setShortcutsOpen }}
        exportWarning={{
          questions: exportWarning,
          dismiss: () => setExportWarning(null),
          exportAnyway: () => {
            void exportTutor(true);
          },
        }}
        reset={{ kind: resetKind, cancel: () => setResetKind(null), downloadBackup, confirm: confirmReset }}
        sessionImport={
          pendingSessionImport
            ? {
                source: pendingSessionImport.source,
                currentExercises: state.doc.exercises.length,
                incomingExercises: pendingSessionImport.payload.doc.exercises.length,
                cancel: cancelSessionImport,
                confirm: confirmSessionImport,
              }
            : null
        }
        wellbeing={wellbeing}
        confidence={{
          open: !!decision,
          initial: ex.confidence,
          invoker: invoker.current,
          onCancel: cancelDecision,
          onConfirm: confirmDecision,
        }}
        completion={{
          open: complete,
          totalQuestions: state.doc.exercises.length,
          answeredQuestions: answeredCount,
          skippedQuestions: skippedCount,
          draftQuestions: state.doc.exercises.filter((question) => questionStatus(question) === 'Draft').length,
          onClose: () => setComplete(false),
          onReview: () => {
            setComplete(false);
            void copyReview();
          },
          onCopy: () => {
            setComplete(false);
            void copySession();
          },
          onAnalyze: () => {
            setComplete(false);
            setShowResults(true);
          },
        }}
        insert={{
          open: insertOpen,
          onOpenChange: (value) => {
            if (!value) {
              if (restoreInsert.current) closeInsert();
              else setInsertOpen(false);
            } else setInsertOpen(true);
          },
          wide,
          onInsert: insert,
          onCloseAutoFocus: (event) => {
            event.preventDefault();
            if (insertInvoker.current?.isConnected) insertInvoker.current.focus({ preventScroll: true });
            restoreInsertFocus();
          },
        }}
        storageConflict={state.storageState?.kind === 'conflict'}
        serverConflict={{
          conflict: serverConflict,
          busy: serverConflictBusy,
          error: serverConflictError,
          onResolve: (choice) => {
            void resolveServerConflict(choice);
          },
        }}
      />
    </>
  );
}
