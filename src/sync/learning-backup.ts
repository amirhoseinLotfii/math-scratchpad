import * as z from 'zod/mini';
import { ARCHIVE_KEY, BANK_CACHE_PREFIX, snapshotVersion, validateBank } from '../features/drive-bank/drive-bank';
import { LESSON_PROGRESS_PREFIX, readLessonProgress } from '../features/lessons/lesson-progress-store';
import { validateSession } from '../persistence';
import { learnEventSchema } from './events';
import { getDefaultSyncRuntime } from './runtime';
import {
  flushLearningStorage,
  getLearningDb,
  getLearningStorage,
  isServerStorageActive,
  memoryOutboxRecords,
  serverLearningStateRecords,
  queueLearnEvent,
  isLearningStorageKey,
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

export const FULL_BACKUP_FORMAT = 'math-scratchpad-full-backup/v1';
export const MAX_FULL_BACKUP_BYTES = 50 * 1024 * 1024;
const deviceIdKey = 'math-scratchpad-device-id-v1';
const isoDateTime = z.iso.datetime({ offset: true });
const cacheSchema = z.strictObject({
  key: z.string().check(z.minLength(1), z.maxLength(512)),
  value: z.string().check(z.maxLength(10_000_000)),
  updatedAt: isoDateTime,
});
const outboxSchema = z.strictObject({
  id: z.uuid(), event: learnEventSchema, queuedAt: isoDateTime,
  creationEpoch: z.optional(z.string().check(z.minLength(8), z.maxLength(128), z.regex(/^[a-zA-Z0-9._:-]+$/))),
  migrationId: z.optional(z.uuid()),
}).check(z.refine(record => record.id === record.event.id, { error: 'Outbox key must match its event ID.' }));
const serverEventSchema = z.strictObject({ seq: z.int().check(z.positive(), z.maximum(Number.MAX_SAFE_INTEGER)), event: learnEventSchema });
const metaSchema = z.custom<MetaRecord>(value => isRecord(value)
  && typeof value.key === 'string' && value.key.length > 0 && value.key.length <= 512 && Object.hasOwn(value, 'value'));
const storesSchema = z.strictObject({
  cache: z.array(cacheSchema).check(z.maxLength(100_000)),
  outbox: z.array(outboxSchema).check(z.maxLength(100_000)),
  serverEvents: z.array(serverEventSchema).check(z.maxLength(200_000)),
  meta: z.array(metaSchema).check(z.maxLength(10_000)),
});
const backupSchema = z.strictObject({
  format: z.literal(FULL_BACKUP_FORMAT),
  schemaVersion: z.literal(1),
  createdAt: isoDateTime,
  stores: storesSchema,
  sha256: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
});

export type FullLearningBackup = z.infer<typeof backupSchema>;
type LearningStores = z.infer<typeof storesSchema>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function digest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('رمزنگاری مرورگر در دسترس نیست؛ پشتیبان تغییر نکرد.');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function unsignedBackup(backup: FullLearningBackup) {
  return { format: backup.format, schemaVersion: backup.schemaVersion, createdAt: backup.createdAt, stores: backup.stores };
}

export function serializeFullLearningBackup(backup: FullLearningBackup, maxBytes = MAX_FULL_BACKUP_BYTES): string {
  const contents = `${JSON.stringify(backup, null, 2)}\n`;
  if (new TextEncoder().encode(contents).byteLength > maxBytes) throw new Error('حجم فایل پشتیبان از حد مجاز بیشتر است؛ خروجی ساخته نشد.');
  return contents;
}

function equal(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function blankCounts(): Counts { return { cache: 0, outbox: 0, serverEvents: 0, meta: 0 }; }
function counts(stores: LearningStores): Counts {
  return { cache: stores.cache.length, outbox: stores.outbox.length, serverEvents: stores.serverEvents.length, meta: stores.meta.length };
}

async function validateCacheContents(cache: CacheRecord[]): Promise<void> {
  const banks = new Map<string, { bankId: string; version: string; bank: ReturnType<typeof validateBank> }>();
  const orderedCache = [...cache].sort((left, right) => {
    const leftBank = left.key.startsWith(`${BANK_CACHE_PREFIX}:`), rightBank = right.key.startsWith(`${BANK_CACHE_PREFIX}:`);
    return Number(rightBank) - Number(leftBank) || left.key.localeCompare(right.key);
  });
  for (const item of orderedCache) {
    if (!isLearningStorageKey(item.key) && item.key !== deviceIdKey && !item.key.startsWith(`${BANK_CACHE_PREFIX}:`)) {
      throw new Error(`کلید ذخیره‌سازی ناشناخته است: ${item.key}`);
    }
    if (item.key === deviceIdKey) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.value)) throw new Error('شناسهٔ دستگاه در پشتیبان معتبر نیست.');
      continue;
    }
    if (item.key.startsWith(`${BANK_CACHE_PREFIX}:`)) {
      let parsed: unknown;
      try { parsed = JSON.parse(item.value); } catch { throw new Error('نسخهٔ ذخیره‌شدهٔ بانک در پشتیبان JSON معتبر ندارد.'); }
      if (!isRecord(parsed) || parsed.schemaVersion !== 1 || typeof parsed.fileId !== 'string' || typeof parsed.version !== 'string'
        || typeof parsed.fingerprint !== 'string' || !parsed.fingerprint || typeof parsed.savedAt !== 'string' || !Number.isFinite(Date.parse(parsed.savedAt))) {
        throw new Error('ساختار نسخهٔ ذخیره‌شدهٔ بانک در پشتیبان معتبر نیست.');
      }
      let keyFileId = '';
      try { keyFileId = decodeURIComponent(item.key.slice(`${BANK_CACHE_PREFIX}:`.length)); }
      catch { throw new Error('کلید فایل بانک در پشتیبان معتبر نیست.'); }
      if (parsed.fileId !== keyFileId) throw new Error('شناسهٔ فایل بانک با کلید ذخیره‌شده سازگار نیست.');
      const bank = validateBank(parsed.bank);
      if (await snapshotVersion(bank) !== parsed.version) throw new Error('نسخهٔ بانک ذخیره‌شده با محتوای آن سازگار نیست.');
      banks.set(`${bank.bank_id}:${parsed.version}`, { bankId: bank.bank_id, version: parsed.version, bank });
      continue;
    }
    if (item.key.startsWith(`${LESSON_PROGRESS_PREFIX}:`)) {
      let parsed: unknown;
      try { parsed = JSON.parse(item.value); } catch { throw new Error('پیشرفت درس در پشتیبان JSON معتبر ندارد.'); }
      const rest = item.key.slice(`${LESSON_PROGRESS_PREFIX}:`.length);
      const separator = rest.indexOf(':');
      if (separator <= 0 || !isRecord(parsed) || parsed.schemaVersion !== 1 || typeof parsed.bankId !== 'string' || typeof parsed.bankVersion !== 'string'
        || !isRecord(parsed.lessons) || !Array.isArray(parsed.lessonPanelEvents)) throw new Error('ساختار پیشرفت درس در پشتیبان معتبر نیست.');
      let keyBankId = '', keyVersion = '';
      try { keyBankId = decodeURIComponent(rest.slice(0, separator)); keyVersion = decodeURIComponent(rest.slice(separator + 1)); }
      catch { throw new Error('کلید پیشرفت درس در پشتیبان رمزگذاری معتبری ندارد.'); }
      if (parsed.bankId !== keyBankId || parsed.bankVersion !== keyVersion) throw new Error('شناسهٔ بانک پیشرفت درس با کلید آن سازگار نیست.');
      const matchingBank = banks.get(`${keyBankId}:${keyVersion}`);
      if (matchingBank) {
        const readonlyStorage = { getItem: (key: string) => key === item.key ? item.value : null, setItem: () => undefined } as unknown as Storage;
        const restored = readLessonProgress(matchingBank.bank, keyVersion, readonlyStorage);
        if (restored.persistenceBlocked) throw new Error('پیشرفت درس با نسخهٔ بانک داخل پشتیبان سازگار نیست.');
      }
      continue;
    }
    if (item.key === ARCHIVE_KEY) {
      try {
        const archived: unknown = JSON.parse(item.value);
        if (!Array.isArray(archived) || archived.some(entry => !isRecord(entry) || typeof entry.id !== 'string' || typeof entry.savedAt !== 'string'
          || !Number.isFinite(Date.parse(entry.savedAt)) || typeof entry.data !== 'string')) throw new Error('invalid_archive');
        for (const entry of archived) validateSession(JSON.parse(entry.data));
      } catch { throw new Error('یکی از نشست‌های آرشیوشده در پشتیبان معتبر نیست.'); }
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(item.value);
      if (item.key === 'math-scratchpad-session-v3') {
        if (!isRecord(parsed) || parsed.version !== 3 || !isRecord(parsed.state) || !isRecord(parsed.state.session) || !isRecord(parsed.state.sync)
          || typeof parsed.state.session.keyboardOpen !== 'boolean' || typeof parsed.state.sync.writerId !== 'string'
          || !Number.isSafeInteger(parsed.state.sync.revision) || Number(parsed.state.sync.revision) < 0) throw new Error('نشست ذخیره‌شده معتبر نیست.');
        validateSession({ version: 2, doc: parsed.state.session.doc, prefs: parsed.state.session.prefs });
      } else validateSession(parsed);
    } catch (error) { throw new Error(`نشست ذخیره‌شده در پشتیبان معتبر نیست${error instanceof Error ? `: ${error.message}` : '.'}`); }
  }
}

function validateStoreSemantics(stores: LearningStores): void {
  const cacheKeys = new Set<string>();
  for (const item of stores.cache) {
    if (cacheKeys.has(item.key)) throw new Error(`کلید تکراری در پشتیبان: ${item.key}`);
    cacheKeys.add(item.key);
  }
  const outboxIds = new Map<string, string>();
  for (const item of stores.outbox) {
    const serialized = canonicalJson(item.event);
    const previous = outboxIds.get(item.id);
    if (previous && previous !== serialized) throw new Error('شناسهٔ رویداد تکراری با محتوای متفاوت در صف پشتیبان وجود دارد.');
    if (previous) throw new Error('شناسهٔ رویداد تکراری در صف پشتیبان وجود دارد.');
    outboxIds.set(item.id, serialized);
  }
  const seqs = new Set<number>(), serverIds = new Map<string, { seq: number; event: string }>();
  for (const item of stores.serverEvents) {
    if (seqs.has(item.seq) || serverIds.has(item.event.id)) throw new Error('شماره یا شناسهٔ رویداد تکراری در تاریخچهٔ پشتیبان وجود دارد.');
    seqs.add(item.seq);
    serverIds.set(item.event.id, { seq: item.seq, event: canonicalJson(item.event) });
  }
  const metaKeys = new Set<string>();
  for (const item of stores.meta) {
    if (metaKeys.has(item.key)) throw new Error(`کلید تکراری در فرادادهٔ پشتیبان: ${item.key}`);
    metaKeys.add(item.key);
    if (item.key === 'server-cursor' && (!Number.isSafeInteger(item.value) || Number(item.value) < 0)) throw new Error('نشانگر همگام‌سازی در پشتیبان معتبر نیست.');
    if (item.key === 'snapshot-initialized' && typeof item.value !== 'boolean') throw new Error('وضعیت snapshot در پشتیبان معتبر نیست.');
  }
  for (const [id, event] of outboxIds) {
    const serverEvent = serverIds.get(id);
    if (serverEvent && serverEvent.event !== event) throw new Error('یک شناسهٔ رویداد با دو محتوای متفاوت در پشتیبان وجود دارد.');
  }
}

async function validatedBackup(value: unknown): Promise<FullLearningBackup> {
  let backup: FullLearningBackup;
  try { backup = backupSchema.parse(value); }
  catch { throw new Error('ساختار پشتیبان یا یکی از رکوردهای آن معتبر نیست.'); }
  validateStoreSemantics(backup.stores);
  await validateCacheContents(backup.stores.cache);
  if (await digest(unsignedBackup(backup)) !== backup.sha256) throw new Error('هش پشتیبان درست نیست؛ هیچ داده‌ای وارد نشد.');
  return backup;
}

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

export async function parseFullLearningBackup(contents: string): Promise<FullLearningBackup> {
  if (new TextEncoder().encode(contents).byteLength > MAX_FULL_BACKUP_BYTES) throw new Error('فایل پشتیبان از حد ۵۰ مگابایت بزرگ‌تر است.');
  let value: unknown;
  try { value = JSON.parse(contents); } catch { throw new Error('فایل انتخاب‌شده JSON معتبر نیست.'); }
  return validatedBackup(value);
}

function planMerge(current: LearningStores, incoming: LearningStores): MergePlan {
  const preview: LearningBackupPreview = {
    incoming: counts(incoming), additions: blankCounts(), alreadyPresent: blankCounts(), preservedConflicts: blankCounts(), blockingConflicts: [], canImport: true,
  };
  const addCache: CacheRecord[] = [], addOutbox: OutboxRecord[] = [], addServerEvents: ServerEventRecord[] = [], addMeta: MetaRecord[] = [];
  const cacheByKey = new Map(current.cache.map(item => [item.key, item]));
  for (const item of incoming.cache) {
    const previous = cacheByKey.get(item.key);
    if (!previous) { addCache.push(item); continue; }
    if (previous.value === item.value) preview.alreadyPresent.cache += 1;
    else preview.preservedConflicts.cache += 1;
  }

  const localEvents = new Map<string, string>();
  const currentServerById = new Map(current.serverEvents.map(item => [item.event.id, { seq: item.seq, content: canonicalJson(item.event) }]));
  for (const item of current.outbox) localEvents.set(item.id, canonicalJson(item.event));
  for (const item of current.serverEvents) localEvents.set(item.event.id, canonicalJson(item.event));
  for (const item of incoming.outbox) {
    const content = canonicalJson(item.event), previous = localEvents.get(item.id);
    if (previous !== undefined) {
      if (previous !== content) preview.blockingConflicts.push(`رویداد ${item.id} با محتوای متفاوت وجود دارد.`);
      else preview.alreadyPresent.outbox += 1;
      continue;
    }
    addOutbox.push(item);
    localEvents.set(item.id, content);
  }

  const currentServerBySeq = new Map(current.serverEvents.map(item => [item.seq, item]));
  for (const item of incoming.serverEvents) {
    const byId = currentServerById.get(item.event.id);
    if (byId) {
      if (byId.seq !== item.seq || byId.content !== canonicalJson(item.event)) preview.blockingConflicts.push(`ترتیب تاریخچهٔ رویداد ${item.event.id} با نسخهٔ موجود فرق دارد.`);
      else preview.alreadyPresent.serverEvents += 1;
      continue;
    }
    const bySeq = currentServerBySeq.get(item.seq);
    if (bySeq) {
      if (bySeq.event.id !== item.event.id || canonicalJson(bySeq.event) !== canonicalJson(item.event)) preview.blockingConflicts.push(`شمارهٔ ${item.seq} در دو تاریخچه به رویدادهای متفاوت تعلق دارد.`);
      else preview.alreadyPresent.serverEvents += 1;
      continue;
    }
    addServerEvents.push(item);
    currentServerById.set(item.event.id, { seq: item.seq, content: canonicalJson(item.event) });
    currentServerBySeq.set(item.seq, item);
  }

  const metaByKey = new Map(current.meta.map(item => [item.key, item]));
  for (const item of incoming.meta) {
    const previous = metaByKey.get(item.key);
    if (!previous) { addMeta.push(item); continue; }
    if (equal(previous.value, item.value)) preview.alreadyPresent.meta += 1;
    else preview.preservedConflicts.meta += 1;
  }

  const mergedServerIds = new Set([...current.serverEvents, ...addServerEvents].map(item => item.event.id));
  const removeOutboxIds = current.outbox.filter(item => mergedServerIds.has(item.id)).map(item => item.id);
  for (const item of addOutbox) if (mergedServerIds.has(item.id)) {
    const index = addOutbox.findIndex(candidate => candidate.id === item.id);
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
      addedCacheKeys: plan.cache.map(item => item.key),
      removedQueuedIds: [],
    };
  }
  // Settle writes already queued by the synchronous Storage facade before taking the merge snapshot.
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
