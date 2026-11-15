import { lazy, Suspense } from 'react';

import { contentDirection, languageForText, LessonText } from '../features/lessons/lesson-content';
import { CloudResetPreviewDialog } from '../features/session/components/cloud-reset-preview';
import { ContinueLearningButton } from '../features/progress/reading-position-context';
import { PracticeLauncher } from './practice-launcher';

import type { AppViewState } from './use-app-controller';
const DriveBankPanel = lazy(() =>
  import('../features/drive-bank/drive-bank-panel').then(({ DriveBankPanel: panel }) => ({ default: panel })),
);
const SyncPanel = lazy(() => import('../sync/sync-panel').then(({ SyncPanel: panel }) => ({ default: panel })));

export function AppPanels({
  driveBankInitialized,
  driveBankOpen,
  menuInvoker,
  setActiveInspector,
  setDriveBankAvailable,
  bankReady,
  prepareBankTransition,
  resumeBankLesson,
  syncPanelOpen,
  cloudPreviewOpen,
  setCloudPreviewOpen,
  syncRuntime,
  lessonPersistenceMessage,
  launcher,
  wide,
  setShowResults,
  requestSessionImport,
  canUndoSessionImport,
  undoSessionImport,
  resumeCandidate,
  continueLearning,
}: AppViewState) {
  return (
    <>
      {driveBankInitialized && (
        <Suspense
          fallback={
            <div role="status" aria-live="polite">
              Loading question bank…
            </div>
          }
        >
          <DriveBankPanel
            open={driveBankOpen}
            close={() => {
              setActiveInspector((current) => (current === 'drive' ? null : current));
              requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true }));
            }}
            onAvailable={setDriveBankAvailable}
            onBankReady={bankReady}
            onBeforeBankLoad={prepareBankTransition}
            onResumeBank={resumeBankLesson}
          />
        </Suspense>
      )}
      {syncPanelOpen && (
        <Suspense
          fallback={
            <div role="status" aria-live="polite">
              Loading sync settings…
            </div>
          }
        >
          <SyncPanel
            onClose={() => {
              setActiveInspector((current) => (current === 'sync' ? null : current));
              requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true }));
            }}
          />
        </Suspense>
      )}
      <CloudResetPreviewDialog open={cloudPreviewOpen} onOpenChange={setCloudPreviewOpen} runtime={syncRuntime} />
      {lessonPersistenceMessage && (
        <p className="lesson-persistence-warning" role="alert">
          {lessonPersistenceMessage}
        </p>
      )}

      <PracticeLauncher
        launcher={launcher}
        wide={wide}
        onSessionChanged={() => setShowResults(false)}
        onRestoreRequest={requestSessionImport}
        canUndoImport={canUndoSessionImport}
        onUndoImport={undoSessionImport}
      />
      {resumeCandidate && (
        <ContinueLearningButton
          title={
            <span lang={languageForText(resumeCandidate.lesson.title)} dir={contentDirection(resumeCandidate.lesson.title)}>
              <LessonText text={resumeCandidate.lesson.title} />
            </span>
          }
          section={resumeCandidate.sectionTitle}
          meta={[
            resumeCandidate.chapterLabel,
            resumeCandidate.sectionCount > 0
              ? resumeCandidate.sectionIndex !== undefined
                ? `Section ${resumeCandidate.sectionIndex + 1} of ${resumeCandidate.sectionCount}`
                : `${resumeCandidate.sectionCount} sections`
              : undefined,
            resumeCandidate.completedSections > 0
              ? `${resumeCandidate.completedSections} of ${resumeCandidate.sectionCount} sections complete`
              : undefined,
          ]}
          onResume={continueLearning}
        />
      )}
    </>
  );
}
