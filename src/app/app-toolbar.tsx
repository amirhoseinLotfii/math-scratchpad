import { actions } from '../store';
import { example } from '../model';

import { isoLocal } from '../model';
import { writeKeyboardChoice } from '../shared/lib/ui-prefs';
import { StateBudgetMeter } from '../sync/state-sync-budget-ui';
import { AppHeader } from './app-header';
import { ExerciseMenu } from './exercise-menu';

import type { AppViewState } from './use-app-controller';
export function AppToolbar({
  batch,
  answeredCount,
  skippedCount,
  state,
  syncStatus,
  isMathAnswer,
  focusEditor,
  menu,
  setMenu,
  menuInvoker,
  ex,
  syncPanelOpen,
  setup,
  backup,
  request,
  exportTutor,
  openDriveBank,
  openInlinePanel,
  setLessonPickerOpen,
  wellbeing,
  setResetKind,
  setShortcutsOpen,
  setCloudPreviewOpen,
  copySession,
  downloadBackup,
  fileInput,
  jsonForm,
  setActiveInspector,
  dispatch,
  sessionSyncBytes,
}: AppViewState) {
  return (
    <>
      <AppHeader
        batch={batch}
        answeredCount={answeredCount}
        skippedCount={skippedCount}
        totalQuestions={state.doc.exercises.length}
        savedAt={state.savedAt}
        storageState={state.storageState}
        syncStatus={syncStatus}
        showKeyboardToggle={isMathAnswer}
        keyboardOpen={state.keyboardOpen}
        onToggleKeyboard={() => {
          const open = !state.keyboardOpen;
          writeKeyboardChoice(open);
          dispatch(actions.keyboard(open));
          if (open) requestAnimationFrame(focusEditor);
        }}
        onOpenSyncPanel={() => setActiveInspector('sync')}
      >
        <ExerciseMenu
          open={menu}
          setOpen={setMenu}
          invokerRef={menuInvoker}
          skipped={!!ex.skipped}
          session={state.doc.session}
          syncPanelOpen={syncPanelOpen}
          setup={setup}
          backup={backup}
          actions={{
            onCheckCopy: () => request('copy'),
            onExportTutor: () => {
              void exportTutor();
            },
            onOpenDriveBank: () => openDriveBank(),
            onNewProblem: () => openInlinePanel('new'),
            onToggleSkip: () => dispatch(actions.setSkipped(!ex.skipped)),
            onLessons: () => setLessonPickerOpen(true),
            onEditScales: wellbeing.editScales,
            onEndSession: () => dispatch(actions.setSessionMeta({ endedAt: isoLocal() })),
            onResetSession: () => setResetKind('session'),
            onShortcuts: () => setShortcutsOpen(true),
            onCloudPreview: () => setCloudPreviewOpen(true),
            onResetAll: () => setResetKind('all'),
            onStartFractions: () => openInlinePanel('fractions'),
            onStartDiagnostic: () => openInlinePanel('diagnostic'),
            onUseExample: () => dispatch(actions.command({ type: 'newExercise', source: example, mode: 'math' })),
            onUseCurrentExpression: () => dispatch(actions.command({ type: 'newProblem' })),
            onCopySession: () => {
              void copySession();
            },
            onDownloadBackup: downloadBackup,
            onImportFile: () => fileInput.current?.click(),
            onImportJson: () => {
              jsonForm.reset({ json: '' });
              openInlinePanel('backup');
            },
            onOpenSync: () => setActiveInspector('sync'),
          }}
        />
      </AppHeader>
      <StateBudgetMeter bytes={sessionSyncBytes} />
    </>
  );
}
