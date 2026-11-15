import { database, closeLearningDatabase } from '../idb/database';
import { deleteIndexedDbDatabase, withLegacyMigrationLock } from '../idb/legacy-storage';
import { localStorageIfAvailable } from '../idb/local-storage';
import { flushLearningStorage } from '../browser-db';
import {
  LEARNING_DB_NAME,
  LEGACY_LEARNING_DB_NAMES,
  LOCAL_RESET_EPOCH_KEY,
  LOCAL_RESET_EPOCH,
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_QUARANTINE_STORE,
  type OutboxRecord,
} from '../idb/schema';
import {
  LEARNING_RESET_EPOCH,
  LOCAL_RESET_PENDING_KEY,
  LOCAL_SERVER_RESET_EPOCH_KEY,
  isValidLearningResetEpoch,
  LOCAL_PENDING_EPOCH_PREFIX,
  LOCAL_PENDING_RESET_EPOCH_KEY,
  LOCAL_PENDING_RESET_SCOPE_KEY,
  clearLocalPendingResetMetadata,
  markLocalLearningResetPending,
  notifyServerWriteGuardReleased,
  setLocalPendingResetEpoch,
} from '../learning-reset-epoch';

export function isLocalLearningResetPending(): boolean {
  try {
    return localStorageIfAvailable()?.getItem(LOCAL_RESET_PENDING_KEY) === '1';
  } catch {
    return true;
  }
}

/** Record the current client build without removing any learning data or blocking local work. */
export async function prepareLocalLearningReset(): Promise<boolean> {
  const storage = localStorageIfAvailable();
  if (!storage) throw new Error('Local browser storage is unavailable; old learning data was left untouched and sync is paused.');
  return withLegacyMigrationLock(async () => {
    if (storage.getItem(LOCAL_RESET_EPOCH_KEY) !== LOCAL_RESET_EPOCH) storage.setItem(LOCAL_RESET_EPOCH_KEY, LOCAL_RESET_EPOCH);
    return isLocalLearningResetPending();
  });
}

/** Reconcile browser learning data against a server-issued reset generation before sync. */
export async function reconcileServerLearningResetEpoch(epoch: string): Promise<boolean> {
  if (!isValidLearningResetEpoch(epoch)) throw new Error('The server reset epoch is invalid; sync remains paused.');
  const storage = localStorageIfAvailable();
  if (!storage) throw new Error('Local browser storage is unavailable; old learning data was left untouched and sync is paused.');
  return withLegacyMigrationLock(async () => {
    const current = storage.getItem(LOCAL_SERVER_RESET_EPOCH_KEY);
    if (current === epoch && !isLocalLearningResetPending()) return false;
    if (!current && epoch === LEARNING_RESET_EPOCH && !isLocalLearningResetPending()) {
      storage.setItem(LOCAL_SERVER_RESET_EPOCH_KEY, epoch);
      return false;
    }

    // Set the guard before touching data so concurrent sync paths cannot send old work.
    markLocalLearningResetPending();
    if (storage.getItem(LOCAL_RESET_PENDING_KEY) !== '1') {
      throw new Error('The local reset guard could not be set; sync remains paused.');
    }
    setLocalPendingResetEpoch(epoch);
    await completeLocalLearningReset(epoch);
    return true;
  });
}

/** Quarantine stale outbox items, adopt a server-confirmed epoch, and release sync without clearing work. */
export async function completeLocalLearningReset(epoch: string): Promise<void> {
  if (!isValidLearningResetEpoch(epoch)) throw new Error('The server reset epoch is invalid; sync remains paused.');
  const storage = localStorageIfAvailable();
  if (!storage) throw new Error('Local browser storage is unavailable; sync remains paused.');
  await reconcileOutboxEpoch(epoch);
  storage.setItem(LOCAL_SERVER_RESET_EPOCH_KEY, epoch);
  storage.setItem(LOCAL_RESET_EPOCH_KEY, LOCAL_RESET_EPOCH);
  clearLocalPendingResetMetadata();
  storage.removeItem(LOCAL_RESET_PENDING_KEY);
  if (storage.getItem(LOCAL_RESET_PENDING_KEY) !== null)
    throw new Error('The local reset guard could not be cleared; sync remains paused.');
  notifyServerWriteGuardReleased();
}

async function reconcileOutboxEpoch(epoch: string): Promise<void> {
  const db = await database();
  const storage = localStorageIfAvailable();
  const previousEpoch = storage?.getItem(LOCAL_SERVER_RESET_EPOCH_KEY) || LEARNING_RESET_EPOCH;
  const pendingCandidate = storage?.getItem(LOCAL_PENDING_RESET_EPOCH_KEY);
  const pendingScope = storage?.getItem(LOCAL_PENDING_RESET_SCOPE_KEY);
  const pendingMarker = pendingScope ? `${LOCAL_PENDING_EPOCH_PREFIX}${pendingScope}` : null;
  const pendingCandidateIsForRelease = pendingCandidate === epoch;
  const tx = db.transaction([LEARNING_OUTBOX_STORE, LEARNING_QUARANTINE_STORE], 'readwrite');
  const rows = await tx.objectStore(LEARNING_OUTBOX_STORE).getAll();
  const quarantinedAt = new Date().toISOString();
  for (const row of rows) {
    const creationEpoch = row.creationEpoch ?? previousEpoch;
    if (creationEpoch === epoch) {
      if (!row.creationEpoch) await tx.objectStore(LEARNING_OUTBOX_STORE).put({ ...row, creationEpoch: epoch });
      continue;
    }
    if ((pendingCandidateIsForRelease && creationEpoch === pendingCandidate) || (pendingMarker && creationEpoch === pendingMarker)) {
      await tx.objectStore(LEARNING_OUTBOX_STORE).put({ ...row, creationEpoch: epoch });
      continue;
    }
    const quarantineId = `${row.id}:${encodeURIComponent(creationEpoch)}`;
    await tx.objectStore(LEARNING_QUARANTINE_STORE).put({
      ...row,
      creationEpoch,
      quarantineId,
      quarantinedAt,
      requiredEpoch: epoch,
      reason: 'stale_epoch',
    });
    await tx.objectStore(LEARNING_OUTBOX_STORE).delete(row.id);
  }
  await tx.done;
}
