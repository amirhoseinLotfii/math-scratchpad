import { setActiveLearningStorage } from '../../shared/lib/learning-storage-provider';
import type { ServerStorageChangeSource } from '../clients/server-storage-types';
import { closeAndResetLearningDbConnection, database, getCurrentLearningDbInstance, withLegacyMigrationLock } from './learning-db-connection';
import {
  isIndexedDbCacheKey,
  isLearningStorageKey,
  LEARNING_CACHE_STORE,
  LEARNING_META_STORE,
  LEGACY_MIGRATION_META_KEY,
  localStorageIfAvailable,
  type CacheRecord,
  type LearningStorageBootstrap,
  type LegacyLearningEntry,
  type LegacyMigration,
  type MetaRecord,
} from './learning-db-schema';

type ServerStorageMirror = { setItem: (key: string, value: string) => void; removeItem: (key: string) => void };
type StorageChangeListener = (change: { key: string; newValue: string | null; source?: ServerStorageChangeSource }) => void;

let storageWritable = false;
let values = new Map<string, string>();
let activeStorage: Storage | undefined;
let pendingWrites = new Set<Promise<unknown>>();
let bootstrapPromise: Promise<LearningStorageBootstrap> | undefined;
let channel: BroadcastChannel | undefined;
const storageListeners = new Set<StorageChangeListener>();
let serverStorageMirror: ServerStorageMirror | undefined;

export function registerServerStorageMirror(mirror: ServerStorageMirror | undefined): void {
  serverStorageMirror = mirror;
}

export function getActiveLocalStorage(): Storage | undefined {
  return activeStorage;
}

export function dispatchStorageListeners(change: { key: string; newValue: string | null; source?: ServerStorageChangeSource }): void {
  for (const listener of storageListeners) listener(change);
}

function trackWrite<T>(promise: Promise<T>): Promise<T> {
  pendingWrites.add(promise);
  void promise.finally(() => pendingWrites.delete(promise)).catch(() => undefined);
  return promise;
}

function notifyTabs(key: string, value: string | null) {
  try { channel?.postMessage({ key, value, updatedAt: new Date().toISOString() }); } catch { /* Optional cross-tab hint. */ }
}

class IndexedDbStorage implements Storage {
  get length(): number { return values.size; }
  clear(): void {
    const dbInstance = getCurrentLearningDbInstance();
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; stored learning data was left untouched.');
    const removed = [...values.keys()];
    values.clear();
    trackWrite(dbInstance.clear(LEARNING_CACHE_STORE));
    for (const key of removed) notifyTabs(key, null);
  }
  getItem(key: string): string | null { return values.get(String(key)) ?? null; }
  key(index: number): string | null { return [...values.keys()].sort()[index] ?? null; }
  removeItem(key: string): void {
    const dbInstance = getCurrentLearningDbInstance();
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; stored learning data was left untouched.');
    const normalized = String(key);
    values.delete(normalized);
    trackWrite(dbInstance.delete(LEARNING_CACHE_STORE, normalized));
    notifyTabs(normalized, null);
    if (serverStorageMirror && isLearningStorageKey(normalized)) serverStorageMirror.removeItem(normalized);
  }
  setItem(key: string, value: string): void {
    const dbInstance = getCurrentLearningDbInstance();
    const normalized = String(key), text = String(value);
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; the draft remains in memory and was not written to localStorage.');
    values.set(normalized, text);
    trackWrite(dbInstance.put(LEARNING_CACHE_STORE, { key: normalized, value: text, updatedAt: new Date().toISOString() }));
    notifyTabs(normalized, text);
    if (serverStorageMirror && isLearningStorageKey(normalized)) serverStorageMirror.setItem(normalized, text);
  }
}

/** Hydrate the synchronous app storage facade from IndexedDB before rendering React. */
export function initializeLearningStorage(): Promise<LearningStorageBootstrap> {
  if (bootstrapPromise) return bootstrapPromise;
  storageWritable = false;
  bootstrapPromise = (async () => {
    try {
      const db = await database();
      const cached = await db.getAll(LEARNING_CACHE_STORE);
      values = new Map(cached.map(item => [item.key, item.value]));

      const legacyStorage = localStorageIfAvailable();
      const migration = await withLegacyMigrationLock(async (): Promise<LegacyMigration | null> => {
        const migrationRecord = await db.get(LEARNING_META_STORE, LEGACY_MIGRATION_META_KEY) as MetaRecord | undefined;
        let currentMigration = (migrationRecord?.value as LegacyMigration | undefined) ?? null;
        if (!currentMigration && legacyStorage) {
          const entries: LegacyLearningEntry[] = [];
          const copiedCaches: Array<{ key: string; value: string }> = [];
          for (let index = 0; index < legacyStorage.length; index++) {
            const key = legacyStorage.key(index);
            if (!key || !isIndexedDbCacheKey(key)) continue;
            const value = legacyStorage.getItem(key);
            if (value === null) continue;
            const stored = await db.get(LEARNING_CACHE_STORE, key);
            if (!stored) {
              await db.put(LEARNING_CACHE_STORE, { key, value, updatedAt: new Date().toISOString() });
            }
            if (isLearningStorageKey(key)) entries.push({ key, value, sha256: '' });
            else if (stored?.value === value || !stored) copiedCaches.push({ key, value });
          }
          if (entries.length) {
            currentMigration = {
              id: crypto.randomUUID(), createdAt: new Date().toISOString(), entries, eventIds: [], status: 'pending',
            };
            await db.put(LEARNING_META_STORE, { key: LEGACY_MIGRATION_META_KEY, value: currentMigration });
          }
          for (const cache of copiedCaches) {
            const saved = await db.get(LEARNING_CACHE_STORE, cache.key);
            if (saved?.value === cache.value && legacyStorage.getItem(cache.key) === cache.value) legacyStorage.removeItem(cache.key);
          }
        }
        return currentMigration;
      });
      const cachedAfterMigration = await db.getAll(LEARNING_CACHE_STORE);
      values = new Map(cachedAfterMigration.map(item => [item.key, item.value]));
      if (migration) {
        for (const entry of migration.entries) {
          if (!values.has(entry.key)) values.set(entry.key, entry.value);
        }
      }

      activeStorage = new IndexedDbStorage();
      setActiveLearningStorage(activeStorage);
      try {
        if (!channel && typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel('math-scratchpad-learning-cache-v1');
          channel.onmessage = event => {
            const record = event.data as { key?: unknown; value?: unknown } | null;
            if (!record || typeof record.key !== 'string') return;
            if (record.value === null) values.delete(record.key);
            else if (typeof record.value === 'string') values.set(record.key, record.value);
            const newValue = typeof record.value === 'string' ? record.value : null;
            dispatchStorageListeners({ key: record.key, newValue });
          };
        }
      } catch { /* IndexedDB remains the durable source when BroadcastChannel is unavailable. */ }
      storageWritable = true;
      return { storage: activeStorage, dbAvailable: true, migration: migration ?? null, warning: '' };
    } catch {
      storageWritable = false;
      closeAndResetLearningDbConnection();
      const legacyStorage = localStorageIfAvailable();
      values = new Map();
      if (legacyStorage) for (let index = 0; index < legacyStorage.length; index++) {
        const key = legacyStorage.key(index);
        if (key && isIndexedDbCacheKey(key)) {
          const value = legacyStorage.getItem(key);
          if (value !== null) values.set(key, value);
        }
      }
      activeStorage = new IndexedDbStorage();
      setActiveLearningStorage(activeStorage);
      return { storage: activeStorage, dbAvailable: false, warning: 'ذخیره‌سازی پایدار مرورگر در دسترس نیست؛ داده‌های قدیمی دست‌نخورده مانده‌اند.', migration: null };
    }
  })();
  return bootstrapPromise;
}

/** Uses IndexedDB after app bootstrap; direct unit renders retain their Storage mock behavior. */
export function getLearningStorage(): Storage {
  return activeStorage ?? localStorageIfAvailable() ?? new IndexedDbStorage();
}

export function subscribeLearningStorage(listener: StorageChangeListener): () => void {
  storageListeners.add(listener);
  return () => storageListeners.delete(listener);
}

export function refreshLearningStorageValues(records: CacheRecord[]): void {
  values = new Map(records.map(record => [record.key, record.value]));
}

export async function flushLearningStorage(): Promise<void> {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
}

export async function writeLearningItem(key: string, value: string): Promise<void> {
  getLearningStorage().setItem(key, value);
  await flushLearningStorage();
}

export function learningDbWriteError(): string {
  return storageWritable && getCurrentLearningDbInstance() ? '' : 'IndexedDB is not initialized.';
}

export function resetStorageFacadeForTests(): void {
  bootstrapPromise = undefined;
  activeStorage = undefined;
  setActiveLearningStorage(undefined);
  serverStorageMirror = undefined;
  values = new Map();
  pendingWrites = new Set();
  channel?.close();
  channel = undefined;
  storageListeners.clear();
  storageWritable = false;
}
