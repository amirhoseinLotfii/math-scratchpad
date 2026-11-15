import * as z from 'zod/mini';
import { ARCHIVE_KEY, BANK_CACHE_PREFIX, snapshotVersion, validateBank } from '../features/drive-bank/drive-bank';
import { LESSON_PROGRESS_PREFIX, readLessonProgress } from '../features/lessons/lesson-progress-store';
import { validateSession } from '../persistence';
import { learnEventSchema } from './events';
import { isLearningStorageKey, type CacheRecord, type MetaRecord } from './browser-db';

export const FULL_BACKUP_FORMAT = 'math-scratchpad-full-backup/v1';
export const MAX_FULL_BACKUP_BYTES = 50 * 1024 * 1024;
const deviceIdKey = 'math-scratchpad-device-id-v1';
const isoDateTime = z.iso.datetime({ offset: true });
const cacheSchema = z.strictObject({
  key: z.string().check(z.minLength(1), z.maxLength(512)),
  value: z.string().check(z.maxLength(10_000_000)),
  updatedAt: isoDateTime,
});
const outboxSchema = z
  .strictObject({
    id: z.uuid(),
    event: learnEventSchema,
    queuedAt: isoDateTime,
    creationEpoch: z.optional(z.string().check(z.minLength(8), z.maxLength(128), z.regex(/^[a-zA-Z0-9._:-]+$/))),
    migrationId: z.optional(z.uuid()),
  })
  .check(z.refine((record) => record.id === record.event.id, { error: 'Outbox key must match its event ID.' }));
const serverEventSchema = z.strictObject({ seq: z.int().check(z.positive(), z.maximum(Number.MAX_SAFE_INTEGER)), event: learnEventSchema });
const metaSchema = z.custom<MetaRecord>(
  (value) =>
    isRecord(value) && typeof value.key === 'string' && value.key.length > 0 && value.key.length <= 512 && Object.hasOwn(value, 'value'),
);
export const storesSchema = z.strictObject({
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
export type LearningStores = z.infer<typeof storesSchema>;
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function digest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('رمزنگاری مرورگر در دسترس نیست؛ پشتیبان تغییر نکرد.');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function unsignedBackup(backup: FullLearningBackup) {
  return { format: backup.format, schemaVersion: backup.schemaVersion, createdAt: backup.createdAt, stores: backup.stores };
}

export async function validateCacheContents(cache: CacheRecord[]): Promise<void> {
  const banks = new Map<string, { bankId: string; version: string; bank: ReturnType<typeof validateBank> }>();
  const orderedCache = [...cache].sort((left, right) => {
    const leftBank = left.key.startsWith(`${BANK_CACHE_PREFIX}:`),
      rightBank = right.key.startsWith(`${BANK_CACHE_PREFIX}:`);
    return Number(rightBank) - Number(leftBank) || left.key.localeCompare(right.key);
  });
  for (const item of orderedCache) {
    if (!isLearningStorageKey(item.key) && item.key !== deviceIdKey && !item.key.startsWith(`${BANK_CACHE_PREFIX}:`)) {
      throw new Error(`کلید ذخیره‌سازی ناشناخته است: ${item.key}`);
    }
    if (item.key === deviceIdKey) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.value))
        throw new Error('شناسهٔ دستگاه در پشتیبان معتبر نیست.');
      continue;
    }
    if (item.key.startsWith(`${BANK_CACHE_PREFIX}:`)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(item.value);
      } catch {
        throw new Error('نسخهٔ ذخیره‌شدهٔ بانک در پشتیبان JSON معتبر ندارد.');
      }
      if (
        !isRecord(parsed) ||
        parsed.schemaVersion !== 1 ||
        typeof parsed.fileId !== 'string' ||
        typeof parsed.version !== 'string' ||
        typeof parsed.fingerprint !== 'string' ||
        !parsed.fingerprint ||
        typeof parsed.savedAt !== 'string' ||
        !Number.isFinite(Date.parse(parsed.savedAt))
      ) {
        throw new Error('ساختار نسخهٔ ذخیره‌شدهٔ بانک در پشتیبان معتبر نیست.');
      }
      let keyFileId = '';
      try {
        keyFileId = decodeURIComponent(item.key.slice(`${BANK_CACHE_PREFIX}:`.length));
      } catch {
        throw new Error('کلید فایل بانک در پشتیبان معتبر نیست.');
      }
      if (parsed.fileId !== keyFileId) throw new Error('شناسهٔ فایل بانک با کلید ذخیره‌شده سازگار نیست.');
      const bank = validateBank(parsed.bank);
      if ((await snapshotVersion(bank)) !== parsed.version) throw new Error('نسخهٔ بانک ذخیره‌شده با محتوای آن سازگار نیست.');
      banks.set(`${bank.bank_id}:${parsed.version}`, { bankId: bank.bank_id, version: parsed.version, bank });
      continue;
    }
    if (item.key.startsWith(`${LESSON_PROGRESS_PREFIX}:`)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(item.value);
      } catch {
        throw new Error('پیشرفت درس در پشتیبان JSON معتبر ندارد.');
      }
      const rest = item.key.slice(`${LESSON_PROGRESS_PREFIX}:`.length);
      const separator = rest.indexOf(':');
      if (
        separator <= 0 ||
        !isRecord(parsed) ||
        parsed.schemaVersion !== 1 ||
        typeof parsed.bankId !== 'string' ||
        typeof parsed.bankVersion !== 'string' ||
        !isRecord(parsed.lessons) ||
        !Array.isArray(parsed.lessonPanelEvents)
      )
        throw new Error('ساختار پیشرفت درس در پشتیبان معتبر نیست.');
      let keyBankId = '',
        keyVersion = '';
      try {
        keyBankId = decodeURIComponent(rest.slice(0, separator));
        keyVersion = decodeURIComponent(rest.slice(separator + 1));
      } catch {
        throw new Error('کلید پیشرفت درس در پشتیبان رمزگذاری معتبری ندارد.');
      }
      if (parsed.bankId !== keyBankId || parsed.bankVersion !== keyVersion)
        throw new Error('شناسهٔ بانک پیشرفت درس با کلید آن سازگار نیست.');
      const matchingBank = banks.get(`${keyBankId}:${keyVersion}`);
      if (matchingBank) {
        const readonlyStorage = {
          getItem: (key: string) => (key === item.key ? item.value : null),
          setItem: () => undefined,
        } as unknown as Storage;
        const restored = readLessonProgress(matchingBank.bank, keyVersion, readonlyStorage);
        if (restored.persistenceBlocked) throw new Error('پیشرفت درس با نسخهٔ بانک داخل پشتیبان سازگار نیست.');
      }
      continue;
    }
    if (item.key === ARCHIVE_KEY) {
      try {
        const archived: unknown = JSON.parse(item.value);
        if (
          !Array.isArray(archived) ||
          archived.some(
            (entry) =>
              !isRecord(entry) ||
              typeof entry.id !== 'string' ||
              typeof entry.savedAt !== 'string' ||
              !Number.isFinite(Date.parse(entry.savedAt)) ||
              typeof entry.data !== 'string',
          )
        )
          throw new Error('invalid_archive');
        for (const entry of archived) validateSession(JSON.parse(entry.data));
      } catch {
        throw new Error('یکی از نشست‌های آرشیوشده در پشتیبان معتبر نیست.');
      }
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(item.value);
      if (item.key === 'math-scratchpad-session-v3') {
        if (
          !isRecord(parsed) ||
          parsed.version !== 3 ||
          !isRecord(parsed.state) ||
          !isRecord(parsed.state.session) ||
          !isRecord(parsed.state.sync) ||
          typeof parsed.state.session.keyboardOpen !== 'boolean' ||
          typeof parsed.state.sync.writerId !== 'string' ||
          !Number.isSafeInteger(parsed.state.sync.revision) ||
          Number(parsed.state.sync.revision) < 0
        )
          throw new Error('نشست ذخیره‌شده معتبر نیست.');
        validateSession({ version: 2, doc: parsed.state.session.doc, prefs: parsed.state.session.prefs });
      } else validateSession(parsed);
    } catch (error) {
      throw new Error(`نشست ذخیره‌شده در پشتیبان معتبر نیست${error instanceof Error ? `: ${error.message}` : '.'}`);
    }
  }
}

export function validateStoreSemantics(stores: LearningStores): void {
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
  const seqs = new Set<number>(),
    serverIds = new Map<string, { seq: number; event: string }>();
  for (const item of stores.serverEvents) {
    if (seqs.has(item.seq) || serverIds.has(item.event.id)) throw new Error('شماره یا شناسهٔ رویداد تکراری در تاریخچهٔ پشتیبان وجود دارد.');
    seqs.add(item.seq);
    serverIds.set(item.event.id, { seq: item.seq, event: canonicalJson(item.event) });
  }
  const metaKeys = new Set<string>();
  for (const item of stores.meta) {
    if (metaKeys.has(item.key)) throw new Error(`کلید تکراری در فرادادهٔ پشتیبان: ${item.key}`);
    metaKeys.add(item.key);
    if (item.key === 'server-cursor' && (!Number.isSafeInteger(item.value) || Number(item.value) < 0))
      throw new Error('نشانگر همگام‌سازی در پشتیبان معتبر نیست.');
    if (item.key === 'snapshot-initialized' && typeof item.value !== 'boolean') throw new Error('وضعیت snapshot در پشتیبان معتبر نیست.');
  }
  for (const [id, event] of outboxIds) {
    const serverEvent = serverIds.get(id);
    if (serverEvent && serverEvent.event !== event) throw new Error('یک شناسهٔ رویداد با دو محتوای متفاوت در پشتیبان وجود دارد.');
  }
}

export async function validatedBackup(value: unknown): Promise<FullLearningBackup> {
  let backup: FullLearningBackup;
  try {
    backup = backupSchema.parse(value);
  } catch {
    throw new Error('ساختار پشتیبان یا یکی از رکوردهای آن معتبر نیست.');
  }
  validateStoreSemantics(backup.stores);
  await validateCacheContents(backup.stores.cache);
  if ((await digest(unsignedBackup(backup))) !== backup.sha256) throw new Error('هش پشتیبان درست نیست؛ هیچ داده‌ای وارد نشد.');
  return backup;
}
