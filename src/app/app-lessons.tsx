import { LessonScreen } from '../features/lessons/lesson-screen';
import { LessonPicker } from '../features/lessons/lesson-picker';
import { LessonReferenceDialog } from '../features/lessons/lesson-reference-dialog';

import type { AppViewState } from './use-app-controller';
export function AppLessons({
  lessonScreen,
  lessonRemoteRevision,
  loadedBank,
  lessonProgressById,
  restoreTarget,
  closeLesson,
  rememberLessonProgress,
  startLessonPractice,
  practiceStartError,
  lessonPersistenceMessage,
  activityTracker,
  lessonEventContext,
  lessonPickerOpen,
  lessons,
  matchingBank,
  loadBankFromLessons,
  setLessonPickerOpen,
  openLesson,
  menuInvoker,
  referenceLesson,
  currentBankQuestion,
  openQuestionFromReference,
  openInteractiveLessonFromReference,
  closeReference,
  lessonButton,
}: AppViewState) {
  return (
    <>
      {lessonScreen && (
        <div className="learn-workspace">
          <LessonScreen
            key={`${lessonScreen.id}:${lessonRemoteRevision}`}
            bank={loadedBank?.bank ?? null}
            lesson={loadedBank?.bank.lessons?.find((lesson) => lesson.id === lessonScreen.id) ?? null}
            initialProgress={lessonProgressById[lessonScreen.id]}
            restore={restoreTarget ?? undefined}
            onBack={closeLesson}
            onProgress={rememberLessonProgress}
            onStartPractice={(lesson, progress, questions, sectionId) => startLessonPractice(lesson, progress, questions, sectionId)}
            practiceError={practiceStartError}
            progressMessage={lessonPersistenceMessage}
            activityTracker={activityTracker}
            eventContext={lessonEventContext}
          />
        </div>
      )}
      <LessonPicker
        open={lessonPickerOpen}
        lessons={lessons}
        progressByLesson={lessonProgressById}
        hasBank={!!matchingBank}
        onLoadBank={loadBankFromLessons}
        onOpenChange={setLessonPickerOpen}
        onChoose={openLesson}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!lessonScreen) menuInvoker.current?.focus({ preventScroll: true });
        }}
      />
      {matchingBank && (
        <LessonReferenceDialog
          lesson={referenceLesson}
          bank={matchingBank.bank}
          question={currentBankQuestion}
          onSelectPracticeQuestion={openQuestionFromReference}
          onOpenInteractiveLesson={openInteractiveLessonFromReference}
          onOpenChange={(open) => {
            if (!open) closeReference();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => lessonButton.current?.focus({ preventScroll: true }));
          }}
        />
      )}
    </>
  );
}
