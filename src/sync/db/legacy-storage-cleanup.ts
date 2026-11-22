import { deleteDB } from 'idb';
import { closeAndResetLearningDbConnection, database, deleteIndexedDbDatabase } from './learning-db-connection';
import {
  isLearningStorageKey,
  LEARNING_DB_NAME,
  LEARNING_META_STORE,
  LEGACY_LEARNING_DB_NAMES,
  LEGACY_MIGRATION_META_KEY,
  localStorageIfAvailable,
  type LegacyMigration,
  type MetaRecord,
} from './learning-db-schema';
import { clearMemoryEventStores } from './learning-outbox-store';
import { resetStorageFacadeForTests } from './learning-storage-facade';
import { resetServerStorageBridgeForTests } from './server-storage-bridge';

/** Explicit owner-authorized transition: remove older local copies on this device. */
export async function clearLegacyBrowserLearningData(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('math-scratchpad')) localStorage.removeItem(key);
    }
  } catch { /* May be disabled by browser privacy settings. */ }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('math-scratchpad')) sessionStorage.removeItem(key);
    }
  } catch { /* May be disabled by browser privacy settings. */ }
  for (const name of [LEARNING_DB_NAME, ...LEGACY_LEARNING_DB_NAMES]) {
    try { await deleteIndexedDbDatabase(name); }
    catch { /* A blocked browser database remains a failed best-effort legacy cleanup. */ }
  }
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
  const canResumeVerifiedCleanup = migration.status === 'drive-backed-up'
    && Boolean(migration.backupFileId && migration.backupVerifiedAt);
  const expectedKeys = new Set(migration.entries.map(entry => entry.key));
  const addedKeys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && isLearningStorageKey(key) && !expectedKeys.has(key)) addedKeys.push(key);
  }
  const changedKeys = migration.entries.filter(entry => {
    const current = storage.getItem(entry.key);
    return current !== entry.value && !(canResumeVerifiedCleanup && current === null);
  }).map(entry => entry.key);
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
    cleared.push(entry.key);
  }
  return { cleared, changed: [] };
}

export async function resetLearningDbForTests(): Promise<void> {
  closeAndResetLearningDbConnection();
  resetStorageFacadeForTests();
  resetServerStorageBridgeForTests();
  clearMemoryEventStores();
  await deleteDB(LEARNING_DB_NAME);
}
