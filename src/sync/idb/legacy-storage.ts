import type { IDBPDatabase } from 'idb';
import { database } from './database';
import { localStorageIfAvailable } from './local-storage';
import { isLearningStorageKey } from '../../../shared/contracts/storage-keys';
import {
  LEARNING_DB_NAME,
  LEGACY_LEARNING_DB_NAMES,
  LEARNING_META_STORE,
  LEGACY_MIGRATION_META_KEY,
  LEGACY_MIGRATION_LOCK_KEY,
  LEGACY_MIGRATION_LOCK_LEASE_MS,
  LEGACY_MIGRATION_LOCK_NAME,
  LEGACY_MIGRATION_LOCK_TIMEOUT_MS,
  type LearningDb,
  type LegacyMigration,
  type MetaRecord,
} from './schema';

export function deleteIndexedDbDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable; old local data could not be deleted.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    const timeout = setTimeout(
      () => reject(new Error('An older tab is still using the previous browser database; close it and reload this page.')),
      15_000,
    );
    request.onsuccess = () => {
      clearTimeout(timeout);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timeout);
      reject(request.error ?? new Error('The previous browser database could not be deleted.'));
    };
    // Existing tabs receive versionchange and close their DB. Keep waiting for the delete to finish.
    request.onblocked = () => undefined;
  });
}

/** Explicit owner-authorized transition: remove older local copies on this device. */
export async function clearLegacyBrowserLearningData(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('math-scratchpad')) localStorage.removeItem(key);
    }
  } catch {
    /* May be disabled by browser privacy settings. */
  }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('math-scratchpad')) sessionStorage.removeItem(key);
    }
  } catch {
    /* May be disabled by browser privacy settings. */
  }
  for (const name of [LEARNING_DB_NAME, ...LEGACY_LEARNING_DB_NAMES]) {
    try {
      await deleteIndexedDbDatabase(name);
    } catch {
      /* A blocked browser database remains a failed best-effort legacy cleanup. */
    }
  }
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
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  let renewal = Promise.resolve();
  const timer = setInterval(() => {
    renewal = renewal
      .then(async () => {
        const tx = db.transaction(LEARNING_META_STORE, 'readwrite');
        const record = await tx.store.get(LEGACY_MIGRATION_LOCK_KEY);
        const lease = record?.value as { owner?: unknown } | undefined;
        if (lease?.owner === owner) {
          await tx.store.put({ key: LEGACY_MIGRATION_LOCK_KEY, value: { owner, expiresAt: Date.now() + LEGACY_MIGRATION_LOCK_LEASE_MS } });
        }
        await tx.done;
      })
      .catch(() => undefined);
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
    } catch {
      /* An expired lease is safe; the next tab can acquire it. */
    }
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

export async function readLegacyMigration(): Promise<LegacyMigration | null> {
  const db = await database();
  const record = (await db.get(LEARNING_META_STORE, LEGACY_MIGRATION_META_KEY)) as MetaRecord | undefined;
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
  const canResumeVerifiedCleanup = migration.status === 'drive-backed-up' && Boolean(migration.backupFileId && migration.backupVerifiedAt);
  const expectedKeys = new Set(migration.entries.map((entry) => entry.key));
  const addedKeys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && isLearningStorageKey(key) && !expectedKeys.has(key)) addedKeys.push(key);
  }
  const changedKeys = migration.entries
    .filter((entry) => {
      const current = storage.getItem(entry.key);
      return current !== entry.value && !(canResumeVerifiedCleanup && current === null);
    })
    .map((entry) => entry.key);
  const changed = [...new Set([...changedKeys, ...addedKeys])].sort();
  if (changed.length) return { cleared: [], changed };

  const cleared: string[] = [];
  for (const entry of migration.entries) {
    const current = storage.getItem(entry.key);
    if (current === entry.value) {
      storage.removeItem(entry.key);
      if (storage.getItem(entry.key) !== null) throw new Error(`Legacy key ${entry.key} could not be cleared safely.`);
    } else if (!(canResumeVerifiedCleanup && current === null)) {
      return { cleared: [], changed: [entry.key] };
    }
    // A missing key is an already-completed deletion only after a verified Drive backup.
    cleared.push(entry.key);
  }
  return { cleared, changed: [] };
}
