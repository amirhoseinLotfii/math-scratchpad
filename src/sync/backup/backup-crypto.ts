import { MAX_FULL_BACKUP_BYTES, type Counts, type FullLearningBackup, type LearningStores } from './backup-types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function digest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('رمزنگاری مرورگر در دسترس نیست؛ پشتیبان تغییر نکرد.');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function unsignedBackup(backup: FullLearningBackup) {
  return { format: backup.format, schemaVersion: backup.schemaVersion, createdAt: backup.createdAt, stores: backup.stores };
}

export function serializeFullLearningBackup(backup: FullLearningBackup, maxBytes = MAX_FULL_BACKUP_BYTES): string {
  const contents = `${JSON.stringify(backup, null, 2)}\n`;
  if (new TextEncoder().encode(contents).byteLength > maxBytes) throw new Error('حجم فایل پشتیبان از حد مجاز بیشتر است؛ خروجی ساخته نشد.');
  return contents;
}

export function equal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function blankCounts(): Counts {
  return { cache: 0, outbox: 0, serverEvents: 0, meta: 0 };
}

export function counts(stores: LearningStores): Counts {
  return { cache: stores.cache.length, outbox: stores.outbox.length, serverEvents: stores.serverEvents.length, meta: stores.meta.length };
}
