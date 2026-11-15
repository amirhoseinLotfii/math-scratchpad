import { useAppController } from './use-app-controller';
import type { LoadedBank } from './use-bank-session';
import { AppToolbar } from './app-toolbar';
import { AppPanels } from './app-panels';
import { AppWorkspace } from './app-workspace';
import { AppLessons } from './app-lessons';
import { AppDialogs } from './app-dialogs';
export { INSERT_VISIBLE } from '../features/math-editor/components/math-insert-dialog';
/** `initialBank` is used by isolated browser previews/tests; normal startup loads through DriveBankPanel. */
export function App({ initialBank }: { initialBank?: LoadedBank } = {}) {
  const view = useAppController(initialBank);
  const { layout, editorRoot, modalOpenWithEditor, menu, chapterTransitioning, lessonScreen, keyboard } = view;
  return (
    <main
      ref={editorRoot}
      className="scratchpad"
      data-layout={layout}
      inert={modalOpenWithEditor || menu}
      aria-busy={chapterTransitioning}
      aria-label="Math Scratchpad"
      lang="en"
      dir="ltr"
      tabIndex={0}
      onKeyDownCapture={keyboard}
    >
      <div className="app-content" hidden={!!lessonScreen} inert={modalOpenWithEditor}>
        <AppToolbar {...view} />
        <AppPanels {...view} />
        <AppWorkspace {...view} />
      </div>
      <AppLessons {...view} />
      <AppDialogs {...view} />
      {chapterTransitioning && (
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
