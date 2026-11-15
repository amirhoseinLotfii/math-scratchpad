import { isIndexedDbCacheKey } from './idb/cache-keys';
import { connectStateMirror } from './state-mirror/connect';
import { localStorageIfAvailable } from './idb/local-storage';
import { withLegacyMigrationLock } from './idb/legacy-storage';
export * from './idb/legacy-storage';
export * from './reset-gate/local-reset';
import { database, dbInstance, closeLearningDatabase } from './idb/database';
import {
  LEARNING_DB_NAME,
  LEARNING_CACHE_STORE,
  LEARNING_META_STORE,
  LEGACY_MIGRATION_META_KEY,
  type CacheRecord,
  type MetaRecord,
  type OutboxRecord,
  type ServerEventRecord,
  type LegacyLearningEntry,
  type LegacyMigration,
  type LearningDb,
} from './idb/schema';
export * from './idb/schema';
export * from './idb/outbox';
import { isLearningStorageKey } from '../../shared/contracts/storage-keys';
export { isLearningStorageKey } from '../../shared/contracts/storage-keys';
import { deleteDB, type IDBPDatabase } from 'idb';
import { ServerBackedStorage, type ServerStorageChangeSource } from './server-storage';

let storageWritable = false;
let values = new Map<string, string>();
let activeStorage: Storage | undefined;
let pendingWrites = new Set<Promise<unknown>>();
let bootstrapPromise: Promise<LearningStorageBootstrap> | undefined;
let channel: BroadcastChannel | undefined;
const storageListeners = new Set<(change: { key: string; newValue: string | null; source?: ServerStorageChangeSource }) => void>();
let serverStorage: ServerBackedStorage | undefined;
const memoryOutbox = new Map<string, OutboxRecord>();
const memoryServerEvents = new Map<number, ServerEventRecord>();
const memoryMeta = new Map<string, unknown>();

export function isServerStorageActive(): boolean {
  return !!serverStorage;
}
export function getAuthenticatedServerStorage(): ServerBackedStorage | undefined {
  return serverStorage;
}

/** Connect an optional server mirror without replacing the durable browser store. */
export async function initializeAuthenticatedServerStorage(token: string): Promise<void> {
  const bootstrap = await initializeLearningStorage();
  const localStorageFacade = activeStorage;
  if (!bootstrap.dbAvailable || !localStorageFacade) {
    throw new Error('ذخیره‌سازی پایدار این مرورگر آماده نیست؛ اتصال سرور به‌تنهایی برای ویرایش کافی نیست.');
  }

  await connectStateMirror(
    token,
    localStorageFacade,
    serverStorage,
    (mirror) => {
      serverStorage = mirror;
    },
    (change) => {
      for (const listener of storageListeners) listener(change);
    },
  );
  await flushLearningStorage();
}

export function updateAuthenticatedServerToken(token: string) {
  serverStorage?.setToken(token);
}

export async function refreshAuthenticatedServerStorage(token: string): Promise<void> {
  await initializeAuthenticatedServerStorage(token);
}

export function memoryOutboxRecords(): OutboxRecord[] {
  return [...memoryOutbox.values()];
}
export function memoryServerEventRecords(): ServerEventRecord[] {
  return [...memoryServerEvents.values()].sort((a, b) => a.seq - b.seq);
}
export function serverLearningStateRecords(): CacheRecord[] {
  return serverStorage?.exportRecords().map((row) => ({ key: row.key, value: row.value, updatedAt: new Date().toISOString() })) ?? [];
}

function trackWrite<T>(promise: Promise<T>): Promise<T> {
  pendingWrites.add(promise);
  void promise.finally(() => pendingWrites.delete(promise)).catch(() => undefined);
  return promise;
}

function notifyTabs(key: string, value: string | null) {
  // BroadcastChannel reaches other tabs; the writing tab already applied this change locally.
  try {
    channel?.postMessage({ key, value, updatedAt: new Date().toISOString() });
  } catch {
    /* Optional cross-tab hint. */
  }
}

class IndexedDbStorage implements Storage {
  get length(): number {
    return values.size;
  }
  clear(): void {
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; stored learning data was left untouched.');
    const removed = [...values.keys()];
    values.clear();
    trackWrite(dbInstance.clear(LEARNING_CACHE_STORE));
    for (const key of removed) notifyTabs(key, null);
  }
  getItem(key: string): string | null {
    return values.get(String(key)) ?? null;
  }
  key(index: number): string | null {
    return [...values.keys()].sort()[index] ?? null;
  }
  removeItem(key: string): void {
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; stored learning data was left untouched.');
    const normalized = String(key);
    values.delete(normalized);
    trackWrite(dbInstance.delete(LEARNING_CACHE_STORE, normalized));
    notifyTabs(normalized, null);
    if (serverStorage && isLearningStorageKey(normalized)) serverStorage.removeItem(normalized);
  }
  setItem(key: string, value: string): void {
    const normalized = String(key),
      text = String(value);
    if (!storageWritable || !dbInstance)
      throw new Error('IndexedDB is not available; the draft remains in memory and was not written to localStorage.');
    values.set(normalized, text);
    trackWrite(dbInstance.put(LEARNING_CACHE_STORE, { key: normalized, value: text, updatedAt: new Date().toISOString() }));
    notifyTabs(normalized, text);
    // Large question-bank caches remain in IndexedDB and never enter the server
    // app-state endpoint, whose per-record payload limit is intentionally small.
    if (serverStorage && isLearningStorageKey(normalized)) serverStorage.setItem(normalized, text);
  }
}

export type LearningStorageBootstrap = {
  storage: Storage;
  dbAvailable: boolean;
  migration: LegacyMigration | null;
  warning: string;
};

/** Hydrate the synchronous app storage facade from IndexedDB before rendering React. */
export function initializeLearningStorage(): Promise<LearningStorageBootstrap> {
  if (bootstrapPromise) return bootstrapPromise;
  storageWritable = false;
  bootstrapPromise = (async () => {
    try {
      const db = await database();
      const cached = await db.getAll(LEARNING_CACHE_STORE);
      values = new Map(cached.map((item) => [item.key, item.value]));

      const legacyStorage = localStorageIfAvailable();
      const migration = await withLegacyMigrationLock(async (): Promise<LegacyMigration | null> => {
        const migrationRecord = (await db.get(LEARNING_META_STORE, LEGACY_MIGRATION_META_KEY)) as MetaRecord | undefined;
        let migration = (migrationRecord?.value as LegacyMigration | undefined) ?? null;
        if (!migration && legacyStorage) {
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
            migration = {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              entries,
              eventIds: [],
              status: 'pending',
            };
            await db.put(LEARNING_META_STORE, { key: LEGACY_MIGRATION_META_KEY, value: migration });
          }
          for (const cache of copiedCaches) {
            const saved = await db.get(LEARNING_CACHE_STORE, cache.key);
            if (saved?.value === cache.value && legacyStorage.getItem(cache.key) === cache.value) legacyStorage.removeItem(cache.key);
          }
        }
        return migration;
      });
      // Refresh after acquiring the lock so a second tab sees the first tab's durable copy.
      const cachedAfterMigration = await db.getAll(LEARNING_CACHE_STORE);
      values = new Map(cachedAfterMigration.map((item) => [item.key, item.value]));
      if (migration) {
        // The original localStorage snapshot remains authoritative for the one-time migration.
        // It may intentionally differ from the newer IndexedDB cache after this page has resumed.
        for (const entry of migration.entries) {
          if (!values.has(entry.key)) values.set(entry.key, entry.value);
        }
      }

      activeStorage = new IndexedDbStorage();
      try {
        if (!channel && typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel('math-scratchpad-learning-cache-v1');
          channel.onmessage = (event) => {
            const record = event.data as { key?: unknown; value?: unknown } | null;
            if (!record || typeof record.key !== 'string') return;
            if (record.value === null) values.delete(record.key);
            else if (typeof record.value === 'string') values.set(record.key, record.value);
            const newValue = typeof record.value === 'string' ? record.value : null;
            for (const listener of storageListeners) listener({ key: record.key, newValue });
          };
        }
      } catch {
        /* IndexedDB remains the durable source when BroadcastChannel is unavailable. */
      }
      storageWritable = true;
      return { storage: activeStorage, dbAvailable: true, migration: migration ?? null, warning: '' };
    } catch {
      // Keep old data readable but never write new learning state back to localStorage.
      storageWritable = false;
      closeLearningDatabase();
      const legacyStorage = localStorageIfAvailable();
      values = new Map();
      if (legacyStorage)
        for (let index = 0; index < legacyStorage.length; index++) {
          const key = legacyStorage.key(index);
          if (key && isIndexedDbCacheKey(key)) {
            const value = legacyStorage.getItem(key);
            if (value !== null) values.set(key, value);
          }
        }
      activeStorage = new IndexedDbStorage();
      return {
        storage: activeStorage,
        dbAvailable: false,
        migration: null,
        warning: 'ذخیره‌سازی پایدار مرورگر در دسترس نیست؛ داده‌های قدیمی دست‌نخورده مانده‌اند.',
      };
    }
  })();
  return bootstrapPromise;
}

/** Uses IndexedDB after app bootstrap; direct unit renders retain their Storage mock behavior. */
export function getLearningStorage(): Storage {
  return activeStorage ?? localStorageIfAvailable() ?? new IndexedDbStorage();
}

export function subscribeLearningStorage(
  listener: (change: { key: string; newValue: string | null; source?: ServerStorageChangeSource }) => void,
): () => void {
  storageListeners.add(listener);
  return () => storageListeners.delete(listener);
}

export function getLearningDb(): Promise<IDBPDatabase<LearningDb>> {
  return database();
}

export function refreshLearningStorageValues(records: CacheRecord[]): void {
  values = new Map(records.map((record) => [record.key, record.value]));
}

export async function flushLearningStorage(): Promise<void> {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
}

export async function writeLearningItem(key: string, value: string): Promise<void> {
  getLearningStorage().setItem(key, value);
  await flushLearningStorage();
}

export async function resetLearningDbForTests(): Promise<void> {
  closeLearningDatabase();
  bootstrapPromise = undefined;
  activeStorage = undefined;
  serverStorage = undefined;
  values = new Map();
  pendingWrites = new Set();
  channel?.close();
  channel = undefined;
  storageListeners.clear();
  memoryOutbox.clear();
  memoryServerEvents.clear();
  memoryMeta.clear();
  storageWritable = false;
  await deleteDB(LEARNING_DB_NAME);
}

export function learningDbWriteError(): string {
  return storageWritable && dbInstance ? '' : 'IndexedDB is not initialized.';
}
