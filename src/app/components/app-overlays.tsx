import { lazy, Suspense, type MutableRefObject } from 'react';
import type { BankQuestion, DriveBank } from '../../features/drive-bank/drive-bank';
import { contentDirection, languageForText, LessonText } from '../../features/lessons/lesson-content';
import { LessonPicker } from '../../features/lessons/lesson-picker';
import { LessonReferenceDialog } from '../../features/lessons/lesson-reference-dialog';
import { LessonScreen } from '../../features/lessons/lesson-screen';
import type { Lesson, LessonProgress } from '../../features/lessons/types';
import { ContinueLearningButton } from '../../features/progress/reading-position-context';
import { CloudResetPreviewDialog } from '../../features/session/components/cloud-reset-preview';
import type { ActivityTracker } from '../../sync/activity-tracker';
import type { LearnEventContext } from '../../sync/events';
import type { BrowserSyncRuntime } from '../../sync/runtime';
import type { useLessonOrchestration } from '../hooks/use-lesson-orchestration';
import { PracticeLauncher, type usePracticeLauncher } from '../practice-launcher';

const DriveBankPanel = lazy(() =>
  import('../../features/drive-bank/drive-bank-panel').then(({ DriveBankPanel: panel }) => ({
    default: panel,
  }))
);
const SyncPanel = lazy(() =>
  import('../../sync/sync-panel').then(({ SyncPanel: panel }) => ({ default: panel }))
);

export function AppInspectors({
  driveBankInitialized,
  driveBankOpen,
  syncPanelOpen,
  setActiveInspector,
  menuInvoker,
  setDriveBankAvailable,
  bankReady,
  prepareBankTransition,
  lessonOrch,
  cloudPreviewOpen,
  setCloudPreviewOpen,
  syncRuntime,
  lessonPersistenceMessage,
  launcher,
  wide,
  onSessionChanged,
  onRestoreRequest,
  canUndoImport,
  onUndoImport,
}: {
  driveBankInitialized: boolean;
  driveBankOpen: boolean;
  syncPanelOpen: boolean;
  setActiveInspector: (
    updater:
      | 'drive'
      | 'sync'
      | null
      | ((current: 'drive' | 'sync' | null) => 'drive' | 'sync' | null)
  ) => void;
  menuInvoker: MutableRefObject<HTMLButtonElement | null>;
  setDriveBankAvailable: (available: boolean) => void;
  bankReady: (bank: DriveBank | null, version: string) => void;
  prepareBankTransition: (bank: DriveBank, version: string) => Promise<void>;
  lessonOrch: ReturnType<typeof useLessonOrchestration>;
  cloudPreviewOpen: boolean;
  setCloudPreviewOpen: (open: boolean) => void;
  syncRuntime: BrowserSyncRuntime | undefined;
  lessonPersistenceMessage: string;
  launcher: ReturnType<typeof usePracticeLauncher>;
  wide: boolean;
  onSessionChanged: () => void;
  onRestoreRequest: (payload: any, source: string) => void;
  canUndoImport: boolean;
  onUndoImport: () => void;
}) {
  return (
    <>
      {driveBankInitialized && (
        <Suspense fallback={<div role="status" aria-live="polite">Loading question bank…</div>}>
          <DriveBankPanel
            open={driveBankOpen}
            close={() => {
              setActiveInspector(current => (current === 'drive' ? null : current));
              requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true }));
            }}
            onAvailable={setDriveBankAvailable}
            onBankReady={bankReady}
            onBeforeBankLoad={prepareBankTransition}
            onResumeBank={lessonOrch.resumeBankLesson}
          />
        </Suspense>
      )}
      {syncPanelOpen && (
        <Suspense fallback={<div role="status" aria-live="polite">Loading sync settings…</div>}>
          <SyncPanel
            onClose={() => {
              setActiveInspector(current => (current === 'sync' ? null : current));
              requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true }));
            }}
          />
        </Suspense>
      )}
      <CloudResetPreviewDialog
        open={cloudPreviewOpen}
        onOpenChange={setCloudPreviewOpen}
        runtime={syncRuntime}
      />
      {lessonPersistenceMessage && (
        <p className="lesson-persistence-warning" role="alert">
          {lessonPersistenceMessage}
        </p>
      )}
      <PracticeLauncher
        launcher={launcher}
        wide={wide}
        onSessionChanged={onSessionChanged}
        onRestoreRequest={onRestoreRequest}
        canUndoImport={canUndoImport}
        onUndoImport={onUndoImport}
      />
      {lessonOrch.resumeCandidate && (
        <ContinueLearningButton
          title={
            <span
              lang={languageForText(lessonOrch.resumeCandidate.lesson.title)}
              dir={contentDirection(lessonOrch.resumeCandidate.lesson.title)}
            >
              <LessonText text={lessonOrch.resumeCandidate.lesson.title} />
            </span>
          }
          section={lessonOrch.resumeCandidate.sectionTitle}
          meta={[
            lessonOrch.resumeCandidate.chapterLabel,
            lessonOrch.resumeCandidate.sectionCount > 0
              ? lessonOrch.resumeCandidate.sectionIndex !== undefined
                ? `Section ${lessonOrch.resumeCandidate.sectionIndex + 1} of ${lessonOrch.resumeCandidate.sectionCount}`
                : `${lessonOrch.resumeCandidate.sectionCount} sections`
              : undefined,
            lessonOrch.resumeCandidate.completedSections > 0
              ? `${lessonOrch.resumeCandidate.completedSections} of ${lessonOrch.resumeCandidate.sectionCount} sections complete`
              : undefined,
          ]}
          onResume={lessonOrch.continueLearning}
        />
      )}
    </>
  );
}

export function AppLessonOverlays({
  lessonOrch,
  loadedBank,
  matchingBank,
  currentBankQuestion,
  lessonProgressById,
  lessonRemoteRevision,
  lessonPersistenceMessage,
  rememberLessonProgress,
  activityTracker,
  lessonEventContext,
  menuInvoker,
  lessonButton,
  onOpenDriveBank,
}: {
  lessonOrch: ReturnType<typeof useLessonOrchestration>;
  loadedBank: { bank: DriveBank; version: string } | null;
  matchingBank: { bank: DriveBank; version: string } | null;
  currentBankQuestion: BankQuestion | undefined;
  lessonProgressById: Record<string, LessonProgress>;
  lessonRemoteRevision: number;
  lessonPersistenceMessage: string;
  rememberLessonProgress: (progress: LessonProgress) => void;
  activityTracker: ActivityTracker;
  lessonEventContext: LearnEventContext;
  menuInvoker: MutableRefObject<HTMLButtonElement | null>;
  lessonButton: MutableRefObject<HTMLButtonElement | null>;
  onOpenDriveBank: () => void;
}) {
  return (
    <>
      {lessonOrch.lessonScreen && (
        <div className="learn-workspace">
          <LessonScreen
            key={`${lessonOrch.lessonScreen.id}:${lessonRemoteRevision}`}
            bank={loadedBank?.bank ?? null}
            lesson={
              loadedBank?.bank.lessons?.find(
                (lesson: Lesson) => lesson.id === lessonOrch.lessonScreen?.id
              ) ?? null
            }
            initialProgress={lessonProgressById[lessonOrch.lessonScreen.id]}
            restore={lessonOrch.restoreTarget ?? undefined}
            onBack={lessonOrch.closeLesson}
            onProgress={rememberLessonProgress}
            onStartPractice={(lesson, progress, questions, sectionId) => {
              void lessonOrch.startLessonPractice(lesson, progress, questions, sectionId);
            }}
            practiceError={lessonOrch.practiceStartError}
            progressMessage={lessonPersistenceMessage}
            activityTracker={activityTracker}
            eventContext={{
              ...lessonEventContext,
              lesson: lessonOrch.lessonScreen.id,
            }}
          />
        </div>
      )}
      <LessonPicker
        open={lessonOrch.lessonPickerOpen}
        lessons={loadedBank?.bank.lessons ?? []}
        progressByLesson={lessonProgressById}
        hasBank={!!matchingBank}
        onLoadBank={() => {
          lessonOrch.setLessonPickerOpen(false);
          onOpenDriveBank();
        }}
        onOpenChange={lessonOrch.setLessonPickerOpen}
        onChoose={lessonOrch.openLesson}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!lessonOrch.lessonScreen) menuInvoker.current?.focus({ preventScroll: true });
        }}
      />
      {matchingBank && (
        <LessonReferenceDialog
          lesson={lessonOrch.referenceLesson}
          bank={matchingBank.bank}
          question={currentBankQuestion}
          onSelectPracticeQuestion={id => {
            void lessonOrch.openQuestionFromReference(id);
          }}
          onOpenInteractiveLesson={lessonOrch.openInteractiveLessonFromReference}
          onOpenChange={open => {
            if (!open) lessonOrch.closeReference();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            requestAnimationFrame(() => lessonButton.current?.focus({ preventScroll: true }));
          }}
        />
      )}
    </>
  );
}
