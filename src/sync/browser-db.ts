import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LearnEvent } from './events';

export const LEARNING_DB_NAME = 'math-scratchpad-sync-v1';
export const LEARNING_DB_VERSION = 1;
export const LEARNING_CACHE_STORE = 'cache';
export const LEARNING_OUTBOX_STORE = 'outbox';
export const LEARNING_SERVER_EVENTS_STORE = 'serverEvents';
export const LEARNING_META_STORE = 'meta';
export const LEGACY_MIGRATION_META_KEY = 'legacy-migration-v1';

export type OutboxRecord = { id: string; event: LearnEvent; queuedAt: string; migrationId?: string };
export type ServerEventRecord = { seq: number; event: LearnEvent };
export type LegacyLearningEntry = { key: string; value: string; sha256: string };
export type LegacyMigration = {
  id: string;
  createdAt: string;
  entries: LegacyLearningEntry[];
  eventIds: string[];
  status: 'pending' | 'server-verified' | 'drive-backed-up' | 'complete';
  serverVerifiedAt?: string;
  backupFileId?: string;
  backupFileName?: string;
  backupVerifiedAt?: string;
};
export type MetaRecord = { key: string; value: unknown };
export type CacheRecord = { key: string; value: string; updatedAt: string };

interface LearningDb extends DBSchema {
  cache: { key: string; value: CacheRecord };
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: { 'by-queued-at': string; 'by-migration-id': string };
  };
  serverEvents: {
    key: number;
    value: ServerEventRecord;
    indexes: { 'by-event-id': string; 'by-migration-id': string };
  };
  meta: { key: string; value: MetaRecord };
}

const SESSION_KEYS = new Set([
  'math-scratchpad-session-v3',
  'math-scratchpad-redux-v2',
  'math-scratchpad-flow-v1',
  'math-scratchpad-drive-session-archive-v1',
  'math-scratchpad-inline-fractions-round1-v1',
]);
const DEVICE_ID_KEY = 'math-scratchpad-device-id-v1';

export function isLearningStorageKey(key: string): boolean {
  return SESSION_KEYS.has(key) || key.startsWith('math-scratchpad-lesson-progress-v1:');
}
function isIndexedDbCacheKey(key: string): boolean {
  return isLearningStorageKey(key) || key === DEVICE_ID_KEY || key.startsWith('math-scratchpad-drive-bank-cache-v1:');
}

let dbPromise: Promise<IDBPDatabase<LearningDb>> | undefined;
let dbInstance: IDBPDatabase<LearningDb> | undefined;
let storageWritable = false;
let values = new Map<string, string>();
let activeStorage: Storage | undefined;
let pendingWrites = new Set<Promise<unknown>>();
let bootstrapPromise: Promise<LearningStorageBootstrap> | undefined;
let channel: BroadcastChannel | undefined;
const storageListeners = new Set<(change: { key: string; newValue: string | null }) => void>();

function database(): Promise<IDBPDatabase<LearningDb>> {
  if (!dbPromise) {
    dbPromise = openDB<LearningDb>(LEARNING_DB_NAME, LEARNING_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(LEARNING_CACHE_STORE)) db.createObjectStore(LEARNING_CACHE_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(LEARNING_OUTBOX_STORE)) {
          const store = db.createObjectStore(LEARNING_OUTBOX_STORE, { keyPath: 'id' });
          store.createIndex('by-queued-at', 'queuedAt');
          store.createIndex('by-migration-id', 'migrationId');
        }
        if (!db.objectStoreNames.contains(LEARNING_SERVER_EVENTS_STORE)) {
          const store = db.createObjectStore(LEARNING_SERVER_EVENTS_STORE, { keyPath: 'seq' });
          store.createIndex('by-event-id', 'event.id', { unique: true });
          store.createIndex('by-migration-id', 'event.migrationChunk.id');
        }
        if (!db.objectStoreNames.contains(LEARNING_META_STORE)) db.createObjectStore(LEARNING_META_STORE, { keyPath: 'key' });
      },
      blocked() {
        // A second tab may hold an old database connection; it will close on versionchange.
      },
    }).then(opened => {
      dbInstance = opened;
      opened.onversionchange = () => { opened.close(); dbInstance = undefined; dbPromise = undefined; };
      return opened;
    });
  }
  return dbPromise;
}

function localStorageIfAvailable(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
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
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; stored learning data was left untouched.');
    const removed = [...values.keys()];
    values.clear();
    trackWrite(dbInstance.clear(LEARNING_CACHE_STORE));
    for (const key of removed) notifyTabs(key, null);
  }
  getItem(key: string): string | null { return values.get(String(key)) ?? null; }
  key(index: number): string | null { return [...values.keys()].sort()[index] ?? null; }
  removeItem(key: string): void {
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; stored learning data was left untouched.');
    const normalized = String(key);
    values.delete(normalized);
    trackWrite(dbInstance.delete(LEARNING_CACHE_STORE, normalized));
    notifyTabs(normalized, null);
  }
  setItem(key: string, value: string): void {
    const normalized = String(key), text = String(value);
    if (!storageWritable || !dbInstance) throw new Error('IndexedDB is not available; the draft remains in memory and was not written to localStorage.');
    values.set(normalized, text);
    trackWrite(dbInstance.put(LEARNING_CACHE_STORE, { key: normalized, value: text, updatedAt: new Date().toISOString() }));
    notifyTabs(normalized, text);
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
      values = new Map(cached.map(item => [item.key, item.value]));

      const legacyStorage = localStorageIfAvailable();
      const migrationRecord = await db.get(LEARNING_META_STORE, LEGACY_MIGRATION_META_KEY) as MetaRecord | undefined;
      let migration = migrationRecord?.value as LegacyMigration | undefined;
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
            values.set(key, value);
            await db.put(LEARNING_CACHE_STORE, { key, value, updatedAt: new Date().toISOString() });
          }
          if (isLearningStorageKey(key)) entries.push({ key, value, sha256: '' });
          else if (stored?.value === value || !stored) copiedCaches.push({ key, value });
        }
        if (entries.length) {
          migration = {
            id: crypto.randomUUID(), createdAt: new Date().toISOString(), entries, eventIds: [], status: 'pending',
          };
          await db.put(LEARNING_META_STORE, { key: LEGACY_MIGRATION_META_KEY, value: migration });
        }
        for (const cache of copiedCaches) {
          const saved = await db.get(LEARNING_CACHE_STORE, cache.key);
          if (saved?.value === cache.value && legacyStorage.getItem(cache.key) === cache.value) legacyStorage.removeItem(cache.key);
        }
      } else if (migration) {
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
          channel.onmessage = event => {
            const record = event.data as { key?: unknown; value?: unknown } | null;
            if (!record || typeof record.key !== 'string') return;
            if (record.value === null) values.delete(record.key);
            else if (typeof record.value === 'string') values.set(record.key, record.value);
            const newValue = typeof record.value === 'string' ? record.value : null;
            for (const listener of storageListeners) listener({ key: record.key, newValue });
          };
        }
      } catch { /* IndexedDB remains the durable source when BroadcastChannel is unavailable. */ }
      storageWritable = true;
      return { storage: activeStorage, dbAvailable: true, migration: migration ?? null, warning: '' };
    } catch {
      // Keep old data readable but never write new learning state back to localStorage.
      storageWritable = false;
      dbInstance?.close();
      dbInstance = undefined;
      dbPromise = undefined;
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
      return { storage: activeStorage, dbAvailable: false, migration: null, warning: 'ذخیره‌سازی پایدار مرورگر در دسترس نیست؛ داده‌های قدیمی دست‌نخورده مانده‌اند.' };
    }
  })();
  return bootstrapPromise;
}

/** Uses IndexedDB after app bootstrap; direct unit renders retain their Storage mock behavior. */
export function getLearningStorage(): Storage {
  return activeStorage ?? localStorageIfAvailable() ?? new IndexedDbStorage();
}

export function subscribeLearningStorage(listener: (change: { key: string; newValue: string | null }) => void): () => void {
  storageListeners.add(listener);
  return () => storageListeners.delete(listener);
}

export function getLearningDb(): Promise<IDBPDatabase<LearningDb>> { return database(); }

export async function flushLearningStorage(): Promise<void> {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
}

export async function writeLearningItem(key: string, value: string): Promise<void> {
  getLearningStorage().setItem(key, value);
  await flushLearningStorage();
}

export async function readLegacyMigration(): Promise<LegacyMigration | null> {
  const db = await database();
  const record = await db.get(LEARNING_META_STORE, LEGACY_MIGRATION_META_KEY) as MetaRecord | undefined;
  return (record?.value as LegacyMigration | undefined) ?? null;
}

export async function writeLegacyMigration(migration: LegacyMigration): Promise<void> {
  const db = await database();
  await db.put(LEARNING_META_STORE, { key: LEGACY_MIGRATION_META_KEY, value: migration });
}

/** Delete only the exact legacy values that were copied and verified; changed keys are preserved. */
export async function clearVerifiedLegacyKeys(migration: LegacyMigration): Promise<{ cleared: string[]; changed: string[] }> {
  const storage = localStorageIfAvailable();
  if (!storage) throw new Error('Legacy browser storage is unavailable; no legacy values were removed.');
  const changed = migration.entries.filter(entry => storage.getItem(entry.key) !== entry.value).map(entry => entry.key);
  if (changed.length) return { cleared: [], changed };
  const cleared: string[] = [];
  for (const entry of migration.entries) {
    storage.removeItem(entry.key);
    if (storage.getItem(entry.key) !== null) throw new Error(`Legacy key ${entry.key} could not be cleared safely.`);
    cleared.push(entry.key);
  }
  return { cleared, changed: [] };
}

export async function resetLearningDbForTests(): Promise<void> {
  dbInstance?.close();
  dbInstance = undefined; dbPromise = undefined; bootstrapPromise = undefined; activeStorage = undefined;
  values = new Map(); pendingWrites = new Set(); channel?.close(); channel = undefined; storageListeners.clear();
  storageWritable = false;
  await deleteDB(LEARNING_DB_NAME);
}

export function learningDbWriteError(): string {
  return storageWritable && dbInstance ? '' : 'IndexedDB is not initialized.';
}

export async function queueLearnEvent(event: LearnEvent, migrationId?: string): Promise<void> {
  const db = await database();
  const existing = await db.get(LEARNING_OUTBOX_STORE, event.id);
  const serialized = JSON.stringify(event);
  if (existing && JSON.stringify(existing.event) !== serialized) throw new Error('An event id was reused with different content.');
  if (!existing) await db.put(LEARNING_OUTBOX_STORE, { id: event.id, event, queuedAt: event.ts, ...(migrationId ? { migrationId } : {}) });
}

export async function readOutboxBatch(maxItems = 50): Promise<OutboxRecord[]> {
  const db = await database();
  return db.getAllFromIndex(LEARNING_OUTBOX_STORE, 'by-queued-at', undefined, Math.max(1, Math.min(50, maxItems)));
}

export async function readOutboxCount(): Promise<number> {
  return (await database()).count(LEARNING_OUTBOX_STORE);
}

export async function acknowledgeOutbox(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await database();
  const tx = db.transaction(LEARNING_OUTBOX_STORE, 'readwrite');
  await Promise.all(ids.map(id => tx.store.delete(id)));
  await tx.done;
}

export async function storeServerEvents(events: ServerEventRecord[]): Promise<void> {
  if (!events.length) return;
  const db = await database();
  const tx = db.transaction(LEARNING_SERVER_EVENTS_STORE, 'readwrite');
  await Promise.all(events.map(item => tx.store.put(item)));
  await tx.done;
}

export async function readServerEventsByMigration(migrationId: string): Promise<ServerEventRecord[]> {
  const db = await database();
  return db.getAllFromIndex(LEARNING_SERVER_EVENTS_STORE, 'by-migration-id', migrationId);
}

export async function getSyncMeta<T>(key: string): Promise<T | undefined> {
  const value = await (await database()).get(LEARNING_META_STORE, key) as MetaRecord | undefined;
  return value?.value as T | undefined;
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  await (await database()).put(LEARNING_META_STORE, { key, value });
}
