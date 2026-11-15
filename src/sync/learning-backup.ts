import {
  FULL_BACKUP_FORMAT,
  MAX_FULL_BACKUP_BYTES,
  storesSchema,
  digest,
  canonicalJson,
  validateCacheContents,
  validateStoreSemantics,
  validatedBackup,
  type FullLearningBackup,
  type LearningStores,
} from './learning-backup-validation';
export { FULL_BACKUP_FORMAT, MAX_FULL_BACKUP_BYTES, type FullLearningBackup } from './learning-backup-validation';
import { getDefaultSyncRuntime } from './runtime';
import {
  flushLearningStorage,
  getLearningDb,
  getLearningStorage,
  isServerStorageActive,
  memoryOutboxRecords,
  serverLearningStateRecords,
  queueLearnEvent,
  refreshLearningStorageValues,
  LEARNING_CACHE_STORE,
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  type CacheRecord,
  type MetaRecord,
  type OutboxRecord,
  type ServerEventRecord,
} from './browser-db';

type Counts = { cache: number; outbox: number; serverEvents: number; meta: number };
export type LearningBackupPreview = {
  incoming: Counts;
  additions: Counts;
  alreadyPresent: Counts;
  preservedConflicts: Counts;
  blockingConflicts: string[];
  canImport: boolean;
};
export type LearningBackupImportResult = LearningBackupPreview & { addedCacheKeys: string[]; removedQueuedIds: string[] };

type MergePlan = {
  preview: LearningBackupPreview;
  cache: CacheRecord[];
  outbox: OutboxRecord[];
  serverEvents: ServerEventRecord[];
  meta: MetaRecord[];
  removeOutboxIds: string[];
};

export function serializeFullLearningBackup(backup: FullLearningBackup, maxBytes = MAX_FULL_BACKUP_BYTES): string {
  const contents = `${JSON.stringify(backup, null, 2)}\n`;
  if (new TextEncoder().encode(contents).byteLength > maxBytes) throw new Error('حجم فایل پشتیبان از حد مجاز بیشتر است؛ خروجی ساخته نشد.');
  return contents;
}

function equal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function blankCounts(): Counts {
  return { cache: 0, outbox: 0, serverEvents: 0, meta: 0 };
}
function counts(stores: LearningStores): Counts {
  return { cache: stores.cache.length, outbox: stores.outbox.length, serverEvents: stores.serverEvents.length, meta: stores.meta.length };
}

async function readStores(source: 'auto' | 'local' = 'auto'): Promise<LearningStores> {
  await flushLearningStorage();
  if (source === 'auto' && isServerStorageActive()) {
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

export async function createFullLearningBackup(now = new Date(), source: 'auto' | 'local' = 'auto'): Promise<string> {
  const stores = readStores(source);
  let validatedStores: LearningStores;
  try {
    validatedStores = storesSchema.parse(await stores);
  } catch {
    throw new Error('داده‌های ذخیره‌شده برای ساخت پشتیبان کامل ساختار معتبری ندارند.');
  }
  validateStoreSemantics(validatedStores);
  await validateCacheContents(validatedStores.cache);
  const unsigned = {
    format: FULL_BACKUP_FORMAT as typeof FULL_BACKUP_FORMAT,
    schemaVersion: 1 as const,
    createdAt: now.toISOString(),
    stores: validatedStores,
  };
  const backup = { ...unsigned, sha256: await digest(unsigned) };
  return serializeFullLearningBackup(backup);
}

export async function parseFullLearningBackup(contents: string): Promise<FullLearningBackup> {
  if (new TextEncoder().encode(contents).byteLength > MAX_FULL_BACKUP_BYTES) throw new Error('فایل پشتیبان از حد ۵۰ مگابایت بزرگ‌تر است.');
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('فایل انتخاب‌شده JSON معتبر نیست.');
  }
  return validatedBackup(value);
}

function planMerge(current: LearningStores, incoming: LearningStores): MergePlan {
  const preview: LearningBackupPreview = {
    incoming: counts(incoming),
    additions: blankCounts(),
    alreadyPresent: blankCounts(),
    preservedConflicts: blankCounts(),
    blockingConflicts: [],
    canImport: true,
  };
  const addCache: CacheRecord[] = [],
    addOutbox: OutboxRecord[] = [],
    addServerEvents: ServerEventRecord[] = [],
    addMeta: MetaRecord[] = [];
  const cacheByKey = new Map(current.cache.map((item) => [item.key, item]));
  for (const item of incoming.cache) {
    const previous = cacheByKey.get(item.key);
    if (!previous) {
      addCache.push(item);
      continue;
    }
    if (previous.value === item.value) preview.alreadyPresent.cache += 1;
    else preview.preservedConflicts.cache += 1;
  }

  const localEvents = new Map<string, string>();
  const currentServerById = new Map(
    current.serverEvents.map((item) => [item.event.id, { seq: item.seq, content: canonicalJson(item.event) }]),
  );
  for (const item of current.outbox) localEvents.set(item.id, canonicalJson(item.event));
  for (const item of current.serverEvents) localEvents.set(item.event.id, canonicalJson(item.event));
  for (const item of incoming.outbox) {
    const content = canonicalJson(item.event),
      previous = localEvents.get(item.id);
    if (previous !== undefined) {
      if (previous !== content) preview.blockingConflicts.push(`رویداد ${item.id} با محتوای متفاوت وجود دارد.`);
      else preview.alreadyPresent.outbox += 1;
      continue;
    }
    addOutbox.push(item);
    localEvents.set(item.id, content);
  }

  const currentServerBySeq = new Map(current.serverEvents.map((item) => [item.seq, item]));
  for (const item of incoming.serverEvents) {
    const byId = currentServerById.get(item.event.id);
    if (byId) {
      if (byId.seq !== item.seq || byId.content !== canonicalJson(item.event))
        preview.blockingConflicts.push(`ترتیب تاریخچهٔ رویداد ${item.event.id} با نسخهٔ موجود فرق دارد.`);
      else preview.alreadyPresent.serverEvents += 1;
      continue;
    }
    const bySeq = currentServerBySeq.get(item.seq);
    if (bySeq) {
      if (bySeq.event.id !== item.event.id || canonicalJson(bySeq.event) !== canonicalJson(item.event))
        preview.blockingConflicts.push(`شمارهٔ ${item.seq} در دو تاریخچه به رویدادهای متفاوت تعلق دارد.`);
      else preview.alreadyPresent.serverEvents += 1;
      continue;
    }
    addServerEvents.push(item);
    currentServerById.set(item.event.id, { seq: item.seq, content: canonicalJson(item.event) });
    currentServerBySeq.set(item.seq, item);
  }

  const metaByKey = new Map(current.meta.map((item) => [item.key, item]));
  for (const item of incoming.meta) {
    const previous = metaByKey.get(item.key);
    if (!previous) {
      addMeta.push(item);
      continue;
    }
    if (equal(previous.value, item.value)) preview.alreadyPresent.meta += 1;
    else preview.preservedConflicts.meta += 1;
  }

  const mergedServerIds = new Set([...current.serverEvents, ...addServerEvents].map((item) => item.event.id));
  const removeOutboxIds = current.outbox.filter((item) => mergedServerIds.has(item.id)).map((item) => item.id);
  for (const item of addOutbox)
    if (mergedServerIds.has(item.id)) {
      const index = addOutbox.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) addOutbox.splice(index, 1);
      preview.alreadyPresent.outbox += 1;
    }

  preview.additions = { cache: addCache.length, outbox: addOutbox.length, serverEvents: addServerEvents.length, meta: addMeta.length };
  preview.canImport = preview.blockingConflicts.length === 0;
  return { preview, cache: addCache, outbox: addOutbox, serverEvents: addServerEvents, meta: addMeta, removeOutboxIds };
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
    // Server values always win on conflict. Add missing keys without overwriting current work.
    const storage = getLearningStorage();
    for (const item of plan.cache) storage.setItem(item.key, item.value);
    await flushLearningStorage();
    // Event IDs are idempotent in the owner's Durable Object SQLite log.
    for (const item of [...plan.outbox, ...plan.serverEvents]) await queueLearnEvent(item.event);
    await getDefaultSyncRuntime()?.syncNow();
    return {
      ...plan.preview,
      addedCacheKeys: plan.cache.map((item) => item.key),
      removedQueuedIds: [],
    };
  }
  // Settle writes already queued by the synchronous Storage facade before taking the merge snapshot.
  await flushLearningStorage();
  const db = await getLearningDb();
  const tx = db.transaction([LEARNING_CACHE_STORE, LEARNING_OUTBOX_STORE, LEARNING_SERVER_EVENTS_STORE, LEARNING_META_STORE], 'readwrite');
  const cacheStore = tx.objectStore(LEARNING_CACHE_STORE),
    outboxStore = tx.objectStore(LEARNING_OUTBOX_STORE);
  const serverStore = tx.objectStore(LEARNING_SERVER_EVENTS_STORE),
    metaStore = tx.objectStore(LEARNING_META_STORE);
  const [cache, outbox, serverEvents, meta] = await Promise.all([
    cacheStore.getAll(),
    outboxStore.getAll(),
    serverStore.getAll(),
    metaStore.getAll(),
  ]);
  const plan = planMerge({ cache, outbox, serverEvents, meta }, backup.stores);
  if (!plan.preview.canImport) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error(`پشتیبان با تاریخچهٔ موجود ناسازگار است: ${plan.preview.blockingConflicts.join('؛ ')}`);
  }
  await Promise.all([
    ...plan.cache.map((item) => cacheStore.put(item)),
    ...plan.outbox.map((item) => outboxStore.put(item)),
    ...plan.serverEvents.map((item) => serverStore.put(item)),
    ...plan.meta.map((item) => metaStore.put(item)),
    ...plan.removeOutboxIds.map((id) => outboxStore.delete(id)),
  ]);
  await tx.done;
  const mergedCache = [...cache, ...plan.cache];
  refreshLearningStorageValues(mergedCache);
  return { ...plan.preview, addedCacheKeys: plan.cache.map((item) => item.key), removedQueuedIds: plan.removeOutboxIds };
}
