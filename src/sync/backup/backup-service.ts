import {
  flushLearningStorage,
  getLearningDb,
  getLearningStorage,
  isServerStorageActive,
  LEARNING_CACHE_STORE,
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  memoryOutboxRecords,
  queueLearnEvent,
  refreshLearningStorageValues,
  serverLearningStateRecords,
} from '../browser-db';
import { getDefaultSyncRuntime } from '../runtime';
import { digest, serializeFullLearningBackup } from './backup-crypto';
import { planMerge } from './backup-merge';
import {
  FULL_BACKUP_FORMAT,
  storesSchema,
  type FullLearningBackup,
  type LearningBackupImportResult,
  type LearningBackupPreview,
  type LearningStores,
} from './backup-types';
import { validateCacheContents, validatedBackup, validateStoreSemantics } from './backup-validation';

async function readStores(): Promise<LearningStores> {
  await flushLearningStorage();
  if (isServerStorageActive()) {
    const runtime = getDefaultSyncRuntime();
    if (!runtime) throw new Error('نسخهٔ امن سرور در دسترس نیست.');
    const serverEvents = await runtime.readAllServerEvents();
    return {
      cache: serverLearningStateRecords().sort((a, b) => a.key.localeCompare(b.key)),
      outbox: memoryOutboxRecords().sort((a, b) => a.id.localeCompare(b.id)),
      serverEvents: serverEvents.sort((a, b) => a.seq - b.seq),
      meta: [],
    };
  }
  const db = await getLearningDb();
  const tx = db.transaction([LEARNING_CACHE_STORE, LEARNING_OUTBOX_STORE, LEARNING_SERVER_EVENTS_STORE, LEARNING_META_STORE], 'readonly');
  const [cache, outbox, serverEvents, meta] = await Promise.all([
    tx.objectStore(LEARNING_CACHE_STORE).getAll(),
    tx.objectStore(LEARNING_OUTBOX_STORE).getAll(),
    tx.objectStore(LEARNING_SERVER_EVENTS_STORE).getAll(),
    tx.objectStore(LEARNING_META_STORE).getAll(),
  ]);
  await tx.done;
  return {
    cache: cache.sort((a, b) => a.key.localeCompare(b.key)),
    outbox: outbox.sort((a, b) => a.id.localeCompare(b.id)),
    serverEvents: serverEvents.sort((a, b) => a.seq - b.seq),
    meta: meta.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export async function createFullLearningBackup(now = new Date()): Promise<string> {
  const stores = readStores();
  let validatedStores: LearningStores;
  try { validatedStores = storesSchema.parse(await stores); }
  catch { throw new Error('داده‌های ذخیره‌شده برای ساخت پشتیبان کامل ساختار معتبری ندارند.'); }
  validateStoreSemantics(validatedStores);
  await validateCacheContents(validatedStores.cache);
  const unsigned = { format: FULL_BACKUP_FORMAT as typeof FULL_BACKUP_FORMAT, schemaVersion: 1 as const, createdAt: now.toISOString(), stores: validatedStores };
  const backup = { ...unsigned, sha256: await digest(unsigned) };
  return serializeFullLearningBackup(backup);
}

export async function previewFullLearningBackup(backupInput: FullLearningBackup): Promise<LearningBackupPreview> {
  const backup = await validatedBackup(backupInput);
  return planMerge(await readStores(), backup.stores).preview;
}

export async function importFullLearningBackup(backupInput: FullLearningBackup): Promise<LearningBackupImportResult> {
  const backup = await validatedBackup(backupInput);
  if (isServerStorageActive()) {
    const plan = planMerge(await readStores(), backup.stores);
    if (!plan.preview.canImport) throw new Error(`پشتیبان با نسخهٔ سرور ناسازگار است: ${plan.preview.blockingConflicts.join('؛ ')}`);
    const storage = getLearningStorage();
    for (const item of plan.cache) storage.setItem(item.key, item.value);
    await flushLearningStorage();
    for (const item of [...plan.outbox, ...plan.serverEvents]) await queueLearnEvent(item.event);
    await getDefaultSyncRuntime()?.syncNow();
    return {
      ...plan.preview,
      addedCacheKeys: plan.cache.map(item => item.key),
      removedQueuedIds: [],
    };
  }
  await flushLearningStorage();
  const db = await getLearningDb();
  const tx = db.transaction([LEARNING_CACHE_STORE, LEARNING_OUTBOX_STORE, LEARNING_SERVER_EVENTS_STORE, LEARNING_META_STORE], 'readwrite');
  const cacheStore = tx.objectStore(LEARNING_CACHE_STORE), outboxStore = tx.objectStore(LEARNING_OUTBOX_STORE);
  const serverStore = tx.objectStore(LEARNING_SERVER_EVENTS_STORE), metaStore = tx.objectStore(LEARNING_META_STORE);
  const [cache, outbox, serverEvents, meta] = await Promise.all([cacheStore.getAll(), outboxStore.getAll(), serverStore.getAll(), metaStore.getAll()]);
  const plan = planMerge({ cache, outbox, serverEvents, meta }, backup.stores);
  if (!plan.preview.canImport) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error(`پشتیبان با تاریخچهٔ موجود ناسازگار است: ${plan.preview.blockingConflicts.join('؛ ')}`);
  }
  await Promise.all([
    ...plan.cache.map(item => cacheStore.put(item)),
    ...plan.outbox.map(item => outboxStore.put(item)),
    ...plan.serverEvents.map(item => serverStore.put(item)),
    ...plan.meta.map(item => metaStore.put(item)),
    ...plan.removeOutboxIds.map(id => outboxStore.delete(id)),
  ]);
  await tx.done;
  const mergedCache = [...cache, ...plan.cache];
  refreshLearningStorageValues(mergedCache);
  return { ...plan.preview, addedCacheKeys: plan.cache.map(item => item.key), removedQueuedIds: plan.removeOutboxIds };
}
