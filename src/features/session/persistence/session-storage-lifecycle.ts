import { getAuthenticatedServerStorage, subscribeLearningStorage } from '../../../sync/browser-db';
import { SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT } from '../../../sync/server-storage';
type StorageChange = Parameters<Parameters<typeof subscribeLearningStorage>[0]>[0];
type StorageListener = (value: Omit<StorageChange, 'key'> & { key: string | null }) => void;
export function attachStorageLifecycle(
  flush: () => Promise<void>,
  storageEvent: StorageListener,
  serverSnapshotRequest: (event: Event) => void,
) {
  // Start the IndexedDB transaction before the browser suspends or tears down this page.
  const pagehide = () => {
    void flush();
    getAuthenticatedServerStorage()?.flushPendingWrites(true);
  };
  const visibilitychange = () => {
    if (document.visibilityState === 'hidden') pagehide();
  };
  const unsubscribeLearningStorage = subscribeLearningStorage(storageEvent);
  const nativeStorageEvent = (event: StorageEvent) => storageEvent(event);
  window.addEventListener(SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT, serverSnapshotRequest);
  window.addEventListener('storage', nativeStorageEvent);
  window.addEventListener('pagehide', pagehide);
  document.addEventListener('visibilitychange', visibilitychange);
  return () => {
    unsubscribeLearningStorage();
    window.removeEventListener(SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT, serverSnapshotRequest);
    window.removeEventListener('storage', nativeStorageEvent);
    window.removeEventListener('pagehide', pagehide);
    document.removeEventListener('visibilitychange', visibilitychange);
  };
}
