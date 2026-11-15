import { useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

import { getSessionSyncBytes } from '../features/session/persistence/persistent-store';
import { getAuthenticatedServerStorage } from '../sync/browser-db';
import { SERVER_STORAGE_CONFLICT_EVENT, type ServerStorageConflict, type ServerStorageConflictChoice } from '../sync/server-storage';
import { getDefaultSyncRuntime } from '../sync/runtime';
import { ServerConnectionOverlayContext } from '../sync/server-connection-gate';

import type { ScratchState } from '../store';
import type { RefObject } from 'react';
const EMPTY_SYNC_STATUS = { phase: 'idle' as const, pending: 0, quarantined: 0, driveMirror: null, notionMirror: null };
const NO_SYNC_SUBSCRIBE = () => () => undefined;

export function useAppSync(state: ScratchState) {
  const syncRuntime = getDefaultSyncRuntime();
  const syncStatus = useSyncExternalStore(
    syncRuntime?.subscribe ?? NO_SYNC_SUBSCRIBE,
    syncRuntime?.getSnapshot ?? (() => EMPTY_SYNC_STATUS),
    () => EMPTY_SYNC_STATUS,
  );
  const [serverConflict, setServerConflict] = useState<ServerStorageConflict | null>(null);
  const [serverConflictBusy, setServerConflictBusy] = useState(false),
    [serverConflictError, setServerConflictError] = useState('');
  const { doc, prefs, keyboardOpen } = state;
  const [sessionSyncBytes, setSessionSyncBytes] = useState(() => getSessionSyncBytes({ doc, prefs, keyboardOpen }));
  useEffect(() => {
    const timeout = window.setTimeout(() => setSessionSyncBytes(getSessionSyncBytes({ doc, prefs, keyboardOpen })), 300);
    return () => window.clearTimeout(timeout);
  }, [doc, prefs, keyboardOpen]);
  useEffect(() => {
    const refreshConflict = () => setServerConflict(getAuthenticatedServerStorage()?.getConflicts()[0] ?? null);
    window.addEventListener(SERVER_STORAGE_CONFLICT_EVENT, refreshConflict);
    refreshConflict();
    return () => window.removeEventListener(SERVER_STORAGE_CONFLICT_EVENT, refreshConflict);
  }, []);
  async function resolveServerConflict(choice: ServerStorageConflictChoice) {
    const storage = getAuthenticatedServerStorage();
    if (!storage || !serverConflict || serverConflictBusy) return;
    setServerConflictBusy(true);
    setServerConflictError('');
    try {
      await storage.resolveConflict(serverConflict.key, choice);
      setServerConflict(storage.getConflicts()[0] ?? null);
    } catch (problem) {
      setServerConflictError(problem instanceof Error ? problem.message : 'The saved version could not be resolved. Try again.');
      setServerConflict(storage.getConflicts()[0] ?? serverConflict);
    } finally {
      setServerConflictBusy(false);
    }
  }
  return { syncRuntime, syncStatus, sessionSyncBytes, serverConflict, serverConflictBusy, serverConflictError, resolveServerConflict };
}
type AppFocusOptions = {
  menu: boolean;
  modalOpenWithEditor: boolean;
  driveBankOpen: boolean;
  syncPanelOpen: boolean;
  lessonScreen: boolean;
  editorRoot: RefObject<HTMLElement | null>;
  exerciseId: string;
  setGuidanceOpen: (open: boolean) => void;
};
export function useAppFocus({
  menu,
  modalOpenWithEditor,
  driveBankOpen,
  syncPanelOpen,
  lessonScreen,
  editorRoot,
  exerciseId,
  setGuidanceOpen,
}: AppFocusOptions) {
  const setConnectionOverlayOpen = useContext(ServerConnectionOverlayContext);
  useLayoutEffect(() => {
    setConnectionOverlayOpen(menu || modalOpenWithEditor || driveBankOpen || syncPanelOpen || !!lessonScreen);
  }, [setConnectionOverlayOpen, menu, modalOpenWithEditor, driveBankOpen, syncPanelOpen, lessonScreen]);
  useEffect(() => {
    if (!menu && !modalOpenWithEditor) return;
    const policyFooter = document.querySelector('body > footer');
    if (!(policyFooter instanceof HTMLElement)) return;
    const focusable = Array.from(
      policyFooter.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]',
      ),
    );
    const previousTabIndexes = focusable.map((element) => ({ element, tabIndex: element.getAttribute('tabindex') }));
    for (const { element } of previousTabIndexes) element.setAttribute('tabindex', '-1');
    return () => {
      for (const { element, tabIndex } of previousTabIndexes) {
        if (tabIndex === null) element.removeAttribute('tabindex');
        else element.setAttribute('tabindex', tabIndex);
      }
    };
  }, [menu, modalOpenWithEditor]);
  useEffect(() => {
    editorRoot.current?.focus({ preventScroll: true });
    setGuidanceOpen(false);
  }, [exerciseId]);
}
