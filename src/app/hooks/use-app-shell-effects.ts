import {
  useContext,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type MutableRefObject,
} from 'react';
import { getDefaultSyncRuntime } from '../../sync/runtime';
import { ServerConnectionOverlayContext } from '../../sync/server-connection-gate';

const EMPTY_SYNC_STATUS = {
  phase: 'idle' as const,
  pending: 0,
  quarantined: 0,
  driveMirror: null,
  notionMirror: null,
};
const NO_SYNC_SUBSCRIBE = () => () => undefined;

export function useAppShellEffects({
  menu,
  modalOpen,
  driveBankOpen,
  syncPanelOpen,
  hasLessonScreen,
  exId,
  editorRoot,
}: {
  menu: boolean;
  modalOpen: boolean;
  driveBankOpen: boolean;
  syncPanelOpen: boolean;
  hasLessonScreen: boolean;
  exId: string;
  editorRoot: MutableRefObject<HTMLElement | null>;
}) {
  const setConnectionOverlayOpen = useContext(ServerConnectionOverlayContext);
  const syncRuntime = getDefaultSyncRuntime();
  const syncStatus = useSyncExternalStore(
    syncRuntime?.subscribe ?? NO_SYNC_SUBSCRIBE,
    syncRuntime?.getSnapshot ?? (() => EMPTY_SYNC_STATUS),
    () => EMPTY_SYNC_STATUS
  );

  useLayoutEffect(() => {
    setConnectionOverlayOpen(
      menu || modalOpen || driveBankOpen || syncPanelOpen || hasLessonScreen
    );
  }, [setConnectionOverlayOpen, menu, modalOpen, driveBankOpen, syncPanelOpen, hasLessonScreen]);

  useEffect(() => {
    if (!menu && !modalOpen) return;
    const policyFooter = document.querySelector('body > footer');
    if (!(policyFooter instanceof HTMLElement)) return;
    const focusable = Array.from(
      policyFooter.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]'
      )
    );
    const previousTabIndexes = focusable.map(element => ({
      element,
      tabIndex: element.getAttribute('tabindex'),
    }));
    for (const { element } of previousTabIndexes) element.setAttribute('tabindex', '-1');
    return () => {
      for (const { element, tabIndex } of previousTabIndexes) {
        if (tabIndex === null) element.removeAttribute('tabindex');
        else element.setAttribute('tabindex', tabIndex);
      }
    };
  }, [menu, modalOpen]);

  useEffect(() => {
    editorRoot.current?.focus({ preventScroll: true });
  }, [editorRoot, exId]);

  return { syncRuntime, syncStatus };
}
