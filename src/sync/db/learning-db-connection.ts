import { openDB, type IDBPDatabase } from 'idb';
import {
  LEARNING_CACHE_STORE,
  LEARNING_DB_NAME,
  LEARNING_DB_VERSION,
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_QUARANTINE_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  LEGACY_MIGRATION_LOCK_KEY,
  LEGACY_MIGRATION_LOCK_LEASE_MS,
  LEGACY_MIGRATION_LOCK_NAME,
  LEGACY_MIGRATION_LOCK_TIMEOUT_MS,
  type LearningDb,
} from './learning-db-schema';

let dbPromise: Promise<IDBPDatabase<LearningDb>> | undefined;
let dbInstance: IDBPDatabase<LearningDb> | undefined;

export function database(): Promise<IDBPDatabase<LearningDb>> {
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
        if (!db.objectStoreNames.contains(LEARNING_QUARANTINE_STORE)) {
          db.createObjectStore(LEARNING_QUARANTINE_STORE, { keyPath: 'quarantineId' });
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

export function getLearningDb(): Promise<IDBPDatabase<LearningDb>> {
  return database();
}

export function getCurrentLearningDbInstance(): IDBPDatabase<LearningDb> | undefined {
  return dbInstance;
}

export function closeAndResetLearningDbConnection(): void {
  dbInstance?.close();
  dbInstance = undefined;
  dbPromise = undefined;
}

export function deleteIndexedDbDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable; old local data could not be deleted.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    const timeout = setTimeout(() => reject(new Error('An older tab is still using the previous browser database; close it and reload this page.')), 15_000);
    request.onsuccess = () => { clearTimeout(timeout); resolve(); };
    request.onerror = () => { clearTimeout(timeout); reject(request.error ?? new Error('The previous browser database could not be deleted.')); };
    // Existing tabs receive versionchange and close their DB. Keep waiting for the delete to finish.
    request.onblocked = () => undefined;
  });
}

async function withIndexedDbMigrationLease<T>(db: IDBPDatabase<LearningDb>, operation: () => Promise<T>): Promise<T> {
  const owner = crypto.randomUUID();
  const startedAt = Date.now();
  while (true) {
    const tx = db.transaction(LEARNING_META_STORE, 'readwrite');
    const record = await tx.store.get(LEGACY_MIGRATION_LOCK_KEY);
    const lease = record?.value as { owner?: unknown; expiresAt?: unknown } | undefined;
    if (!lease || typeof lease.owner !== 'string' || typeof lease.expiresAt !== 'number' || lease.expiresAt <= Date.now()) {
      await tx.store.put({ key: LEGACY_MIGRATION_LOCK_KEY, value: { owner, expiresAt: Date.now() + LEGACY_MIGRATION_LOCK_LEASE_MS } });
      await tx.done;
      break;
    }
    await tx.done;
    if (Date.now() - startedAt >= LEGACY_MIGRATION_LOCK_TIMEOUT_MS) {
      throw new Error('Another tab is completing the data migration. Try again; legacy data was left untouched.');
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }

  let renewal = Promise.resolve();
  const timer = setInterval(() => {
    renewal = renewal.then(async () => {
      const tx = db.transaction(LEARNING_META_STORE, 'readwrite');
      const record = await tx.store.get(LEGACY_MIGRATION_LOCK_KEY);
      const lease = record?.value as { owner?: unknown } | undefined;
      if (lease?.owner === owner) {
        await tx.store.put({ key: LEGACY_MIGRATION_LOCK_KEY, value: { owner, expiresAt: Date.now() + LEGACY_MIGRATION_LOCK_LEASE_MS } });
      }
      await tx.done;
    }).catch(() => undefined);
  }, 20_000);

  try {
    return await operation();
  } finally {
    clearInterval(timer);
    await renewal;
    try {
      const tx = db.transaction(LEARNING_META_STORE, 'readwrite');
      const record = await tx.store.get(LEGACY_MIGRATION_LOCK_KEY);
      const lease = record?.value as { owner?: unknown } | undefined;
      if (lease?.owner === owner) await tx.store.delete(LEGACY_MIGRATION_LOCK_KEY);
      await tx.done;
    } catch { /* An expired lease is safe; the next tab can acquire it. */ }
  }
}

/** Serialize migration work across tabs; Web Locks is preferred, with an IndexedDB lease fallback. */
export async function withLegacyMigrationLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (typeof lockManager?.request === 'function') {
    return lockManager.request(LEGACY_MIGRATION_LOCK_NAME, { mode: 'exclusive' }, operation);
  }
  return withIndexedDbMigrationLease(await database(), operation);
}
