import { ServerBackedStorage, readServerSnapshot } from '../server-storage';
import { database } from './learning-db-connection';
import { isLearningStorageKey, LEARNING_CACHE_STORE, type CacheRecord } from './learning-db-schema';
import {
  dispatchStorageListeners,
  flushLearningStorage,
  getActiveLocalStorage,
  initializeLearningStorage,
  registerServerStorageMirror,
} from './learning-storage-facade';

let serverStorage: ServerBackedStorage | undefined;

export function isServerStorageActive(): boolean { return !!serverStorage; }
export function getAuthenticatedServerStorage(): ServerBackedStorage | undefined { return serverStorage; }

/** Connect an optional server mirror without replacing the durable browser store. */
export async function initializeAuthenticatedServerStorage(token: string): Promise<void> {
  const bootstrap = await initializeLearningStorage();
  const localStorageFacade = getActiveLocalStorage();
  if (!bootstrap.dbAvailable || !localStorageFacade) {
    throw new Error('ذخیره‌سازی پایدار این مرورگر آماده نیست؛ اتصال سرور به‌تنهایی برای ویرایش کافی نیست.');
  }

  const snapshot = await readServerSnapshot(token);
  const remoteRecords = snapshot.records.filter(record => isLearningStorageKey(record.key));
  const db = await database();
  const localRecords = await db.getAll(LEARNING_CACHE_STORE);
  const localByKey = new Map(localRecords.filter(record => isLearningStorageKey(record.key)).map(record => [record.key, record]));
  const remoteByKey = new Map(remoteRecords.map(record => [record.key, record]));

  const mirror = new ServerBackedStorage(remoteRecords, token, (key, value, source) => {
    if (isLearningStorageKey(key)) {
      if (value === null) localStorageFacade.removeItem(key);
      else localStorageFacade.setItem(key, value);
    }
    dispatchStorageListeners({ key, newValue: value, ...(source ? { source } : {}) });
  });
  serverStorage = mirror;
  registerServerStorageMirror(mirror);

  const keys = new Set([...localByKey.keys(), ...remoteByKey.keys()]);
  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    if (!local) {
      if (remote?.value !== null && remote?.value !== undefined) localStorageFacade.setItem(key, remote.value);
      continue;
    }
    if (!remote) {
      mirror.setItem(key, local.value);
      continue;
    }
    if (local.value === remote.value) continue;
    const localTime = Date.parse(local.updatedAt) || 0;
    const remoteTime = typeof remote.updatedAt === 'string' ? Date.parse(remote.updatedAt) || 0 : 0;
    if (remoteTime > localTime) {
      if (remote.value === null) localStorageFacade.removeItem(key);
      else localStorageFacade.setItem(key, remote.value);
    } else {
      // Local data wins ties and records from older Workers without timestamps.
      mirror.setItem(key, local.value);
    }
  }
  await flushLearningStorage();
}

export function updateAuthenticatedServerToken(token: string) { serverStorage?.setToken(token); }

export async function refreshAuthenticatedServerStorage(token: string): Promise<void> {
  await initializeAuthenticatedServerStorage(token);
}

export function serverLearningStateRecords(): CacheRecord[] {
  return serverStorage?.exportRecords().map(row => ({ key: row.key, value: row.value, updatedAt: new Date().toISOString() })) ?? [];
}

export function resetServerStorageBridgeForTests(): void {
  serverStorage = undefined;
  registerServerStorageMirror(undefined);
}
