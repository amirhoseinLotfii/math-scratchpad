import { isLearningStorageKey } from '../../../shared/contracts/storage-keys';
import { SYNC_STATE_BUDGET_BYTES, utf8Bytes } from '../../../shared/contracts/limits';
import { database } from '../idb/database';
import { LEARNING_CACHE_STORE } from '../idb/schema';
import { ServerBackedStorage, readServerSnapshot, SERVER_STORAGE_BUDGET_EVENT, type ServerStorageChangeSource } from '../server-storage';

export async function connectStateMirror(
  token: string,
  localStorageFacade: Storage,
  serverStorage: ServerBackedStorage | undefined,
  setMirror: (mirror: ServerBackedStorage) => void,
  notify: (change: { key: string; newValue: string | null; source?: ServerStorageChangeSource }) => void,
): Promise<void> {
  // Settle scheduled writes before rebuilding the mirror from the latest durable records.
  if (serverStorage) {
    serverStorage.setToken(token);
    await serverStorage.flush().catch(() => {});
  }
  const snapshot = await readServerSnapshot(token);
  const remoteRecords = snapshot.records.filter((record) => isLearningStorageKey(record.key));
  const db = await database();
  const localRecords = await db.getAll(LEARNING_CACHE_STORE);
  const localByKey = new Map(localRecords.filter((record) => isLearningStorageKey(record.key)).map((record) => [record.key, record]));
  const remoteByKey = new Map(remoteRecords.map((record) => [record.key, record]));

  const mirror = new ServerBackedStorage(remoteRecords, token, (key, value, source) => {
    if (isLearningStorageKey(key)) {
      if (value === null) localStorageFacade.removeItem(key);
      else localStorageFacade.setItem(key, value);
    }
    notify({ key, newValue: value, ...(source ? { source } : {}) });
  });
  setMirror(mirror);

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
    if (utf8Bytes(local.value) > SYNC_STATE_BUDGET_BYTES) {
      mirror.setItem(key, local.value);
      continue;
    }
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
  if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event(SERVER_STORAGE_BUDGET_EVENT));
}
