import { AppHeader } from './app/app-header';
import { AppInspectors, AppLessonOverlays } from './app/components/app-overlays';
import { PracticeWorkspace } from './app/components/practice-workspace';
import { DialogsHost } from './app/dialogs-host';
import { ExerciseMenu } from './app/exercise-menu';
import { useAppController } from './app/hooks/use-app-controller';
import type { DriveBank } from './features/drive-bank/drive-bank';
import { questionStatus } from './features/workspace/model/workspace-layout';
import { writeKeyboardChoice } from './shared/lib/ui-prefs';
import { actions } from './store';

export { INSERT_VISIBLE } from './features/math-editor/components/math-insert-dialog';

/** `initialBank` is used by isolated browser previews/tests; normal app startup loads through DriveBankPanel. */
export function App({ initialBank }: { initialBank?: { bank: DriveBank; version: string } } = {}) {
  const c = useAppController(initialBank);
  const { state, ex, bankSession, lessonOrch, telemetry, reviewCopy, sessionImport, shortcuts } = c;

  return (
    <main
      ref={c.editorRoot}
      className="scratchpad"
      data-layout={c.layout}
      inert={c.modalOpen || c.menu}
      aria-busy={bankSession.chapterTransitioning}
      aria-label="Math Scratchpad"
      lang="en"
      dir="ltr"
      tabIndex={0}
      onKeyDownCapture={event => {
        if (!c.modalOpen) shortcuts.keyboard(event);
      }}
    >
      <div className="app-content" hidden={!!lessonOrch.lessonScreen} inert={c.modalOpen}>
        <AppHeader
          batch={c.batch}
          answeredCount={c.answeredCount}
          skippedCount={c.skippedCount}
          totalQuestions={state.doc.exercises.length}
          savedAt={state.savedAt}
          storageState={state.storageState}
          syncStatus={c.syncStatus}
          showKeyboardToggle={c.isMathAnswer}
          keyboardOpen={state.keyboardOpen}
          onToggleKeyboard={() => {
            const open = !state.keyboardOpen;
            writeKeyboardChoice(open);
            c.dispatch(actions.keyboard(open));
            if (open) requestAnimationFrame(shortcuts.focusEditor);
          }}
        >
          <ExerciseMenu
            open={c.menu}
            setOpen={c.setMenu}
            invokerRef={c.menuInvoker}
            skipped={!!ex.skipped}
            session={state.doc.session}
            syncPanelOpen={c.syncPanelOpen}
            setup={c.launcher.setup}
            backup={c.launcher.backup}
            actions={c.menuActions}
          />
        </AppHeader>
        <AppInspectors
          driveBankInitialized={c.driveBankInitialized}
          driveBankOpen={c.driveBankOpen}
          syncPanelOpen={c.syncPanelOpen}
          setActiveInspector={c.setActiveInspector}
          menuInvoker={c.menuInvoker}
          setDriveBankAvailable={c.setDriveBankAvailable}
          bankReady={bankSession.bankReady}
          prepareBankTransition={bankSession.prepareBankTransition}
          lessonOrch={lessonOrch}
          cloudPreviewOpen={c.cloudPreviewOpen}
          setCloudPreviewOpen={c.setCloudPreviewOpen}
          syncRuntime={c.syncRuntime}
          lessonPersistenceMessage={bankSession.lessonPersistenceMessage}
          launcher={c.launcher}
          wide={c.wide}
          onSessionChanged={() => c.setShowResults(false)}
          onRestoreRequest={sessionImport.requestSessionImport}
          canUndoImport={sessionImport.canUndoSessionImport}
          onUndoImport={sessionImport.undoSessionImport}
        />
        <PracticeWorkspace
          layout={c.layout}
          wide={c.wide}
          state={state}
          ex={ex}
          exerciseIndex={c.exerciseIndex}
          batch={c.batch}
          last={c.last}
          fractions={telemetry.fractions}
          linkedLesson={c.linkedLesson}
          lessonButtonRef={c.lessonButton}
          isMathAnswer={c.isMathAnswer}
          answerType={c.answerType}
          answerChoices={c.answerChoices}
          workspaceTemplate={c.workspaceTemplate}
          onWorkspaceTemplateChange={c.changeWorkspaceTemplate}
          copied={c.copied}
          busy={reviewCopy.busy}
          manual={reviewCopy.manual}
          setManual={reviewCopy.setManual}
          showResults={c.showResults}
          exam={telemetry.exam}
          examGrades={telemetry.examGrades}
          questionBankLength={telemetry.questionBank.length}
          dispatch={c.dispatch}
          onSwitchQuestion={c.switchQuestion}
          onOpenReference={lessonOrch.openReference}
          onTimerPauseChange={telemetry.setTrackedTimerPaused}
          onFocusEditor={shortcuts.focusEditor}
          onFocusCurrentMathControl={shortcuts.focusCurrentMathControl}
          onAddStep={shortcuts.addStep}
          onResetStep={shortcuts.resetStep}
          onDeleteStep={shortcuts.deleteStep}
          onInsert={shortcuts.insert}
          onOpenInsert={shortcuts.openInsert}
          onRequestDecision={c.request}
          onCopyReport={() => { void telemetry.copyReport(); }}
        />
      </div>
      <AppLessonOverlays
        lessonOrch={lessonOrch}
        loadedBank={bankSession.loadedBank}
        matchingBank={c.matchingBank}
        currentBankQuestion={c.currentBankQuestion}
        lessonProgressById={bankSession.lessonProgressById}
        lessonRemoteRevision={bankSession.lessonRemoteRevision}
        lessonPersistenceMessage={bankSession.lessonPersistenceMessage}
        rememberLessonProgress={bankSession.rememberLessonProgress}
        activityTracker={telemetry.activityTracker}
        lessonEventContext={telemetry.lessonEventContext}
        menuInvoker={c.menuInvoker}
        lessonButton={c.lessonButton}
        onOpenDriveBank={c.openDriveBank}
      />
      <input
        ref={sessionImport.fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Import backup file"
        onChange={e => { void sessionImport.importFile(e.target.files?.[0]); }}
      />
      <DialogsHost
        menuInvokerRef={c.menuInvoker}
        focusEditor={shortcuts.focusEditor}
        session={state.doc.session}
        shortcuts={{ open: c.shortcutsOpen, setOpen: c.setShortcutsOpen }}
        exportWarning={{
          questions: reviewCopy.exportWarning,
          dismiss: () => reviewCopy.setExportWarning(null),
          exportAnyway: () => { void reviewCopy.exportTutor(true); },
        }}
        reset={{
          kind: c.resetKind,
          cancel: () => c.setResetKind(null),
          downloadBackup: reviewCopy.downloadBackup,
          confirm: c.confirmReset,
        }}
        sessionImport={
          sessionImport.pendingSessionImport
            ? {
                source: sessionImport.pendingSessionImport.source,
                currentExercises: state.doc.exercises.length,
                incomingExercises: sessionImport.pendingSessionImport.payload.doc.exercises.length,
                cancel: sessionImport.cancelSessionImport,
                confirm: sessionImport.confirmSessionImport,
              }
            : null
        }
        wellbeing={c.wellbeing}
        confidence={{
          open: !!c.decision,
          initial: ex.confidence,
          invoker: c.invoker.current,
          onCancel: () => { c.decisionRef.current = null; c.setDecision(null); },
          onConfirm: c.confirmDecision,
        }}
        completion={{
          open: c.complete,
          totalQuestions: state.doc.exercises.length,
          answeredQuestions: c.answeredCount,
          skippedQuestions: c.skippedCount,
          draftQuestions: state.doc.exercises.filter(q => questionStatus(q) === 'Draft').length,
          onClose: () => c.setComplete(false),
          onReview: () => { c.setComplete(false); void reviewCopy.copyReview(); },
          onCopy: () => { c.setComplete(false); void reviewCopy.copySession(); },
          onAnalyze: () => { c.setComplete(false); c.setShowResults(true); },
        }}
        insert={{
          open: shortcuts.insertOpen,
          onOpenChange: value => {
            if (!value) {
              if (shortcuts.restoreInsert.current) shortcuts.closeInsert();
              else shortcuts.setInsertOpen(false);
            } else shortcuts.setInsertOpen(true);
          },
          wide: c.wide,
          onInsert: shortcuts.insert,
          onCloseAutoFocus: event => {
            event.preventDefault();
            if (shortcuts.insertInvoker.current?.isConnected)
              shortcuts.insertInvoker.current.focus({ preventScroll: true });
            shortcuts.restoreInsertFocus();
          },
        }}
        storageConflict={state.storageState?.kind === 'conflict'}
        serverConflict={{
          conflict: c.serverConflictState.serverConflict,
          busy: c.serverConflictState.serverConflictBusy,
          error: c.serverConflictState.serverConflictError,
          onResolve: choice => { void c.serverConflictState.resolveServerConflict(choice); },
        }}
      />
      {bankSession.chapterTransitioning && (
        <div role="status" aria-live="polite" dir="rtl" className="chapter-transition-overlay">
          <div>
            <strong>در حال آرشیو امن فصل قبلی</strong>
            <p>تا تأیید کامل Google Drive و Notion صفحه را نبند.</p>
          </div>
        </div>
      )}
    </main>
  );
}
