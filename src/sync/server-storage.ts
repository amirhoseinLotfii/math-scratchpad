/**
 * Authenticated, server-authoritative learning preferences and editor state.
 *
 * Only an in-memory mirror lives in the browser. Every mutation is sent through
 * an authenticated owner-scoped Worker endpoint using optimistic revisions.
 * No IndexedDB, localStorage or sessionStorage is used here.
 */
import { SYNC_API_ORIGIN } from './sync-config';

export type ServerStateRecord = { key: string; value: string | null; revision: number };
type ServerSnapshot = { records: ServerStateRecord[]; revision: number };

function isSnapshot(value: unknown): value is ServerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return Array.isArray(row.records) && Number.isSafeInteger(row.revision)
    && row.records.every(x => !!x && typeof x.key === 'string' && x.key.startsWith('math-scratchpad')
      && (typeof x.value === 'string' || x.value === null) && Number.isSafeInteger(x.revision));
}

export async function readServerSnapshot(token: string, signal?: AbortSignal): Promise<ServerSnapshot> {
  const response = await fetch(`${SYNC_API_ORIGIN}/state`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(response.status === 401
    ? 'برای خواندن اطلاعات از سرور باید دوباره با Google وارد شوی.'
    : `دریافت وضعیت ذخیره‌شدهٔ سرور ناموفق بود (HTTP ${response.status}).`);
  const value: unknown = await response.json();
  if (!isSnapshot(value)) throw new Error('پاسخ وضعیت یادگیری از سرور معتبر نیست.');
  return value;
}

/** Tiny owner-authenticated heartbeat. Never downloads a large learning snapshot every five seconds. */
export async function verifyOwnerServerConnection(token: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${SYNC_API_ORIGIN}/drive/status`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(response.status === 401
    ? 'ورود Google منقضی شده است؛ برای ادامه دوباره وارد شو.'
    : `دسترسی احراز هویت‌شده به سرور تأیید نشد (HTTP ${response.status}).`);
}

export class ServerBackedStorage implements Storage {
  private readonly values = new Map<string, string>();
  private readonly revisions = new Map<string, number>();
  private token: string;
  private tail: Promise<void> = Promise.resolve();
  private error: Error | null = null;
  private readonly failedWrites = new Map<string, string | null>();
  private queued = 0;
  private readonly onChange?: (key: string, value: string | null) => void;

  constructor(records: ServerStateRecord[], token: string, onChange?: (key: string, value: string | null) => void) {
    this.token = token;
    this.onChange = onChange;
    for (const row of records) {
      if (row.value !== null) this.values.set(row.key, row.value);
      this.revisions.set(row.key, row.revision);
    }
  }

  setToken(token: string) {
    this.token = token;
    // A re-authenticated owner can resume writes that failed with HTTP 401.
    for (const [key, value] of [...this.failedWrites]) this.enqueue(key, value);
  }
  get length() { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }

  setItem(key: string, value: string): void {
    if (!key.startsWith('math-scratchpad')) throw new Error('Storage key is not owned by Math Scratchpad.');
    const stringValue = String(value);
    if (this.values.get(key) === stringValue) return;
    this.values.set(key, stringValue);
    this.enqueue(key, stringValue);
  }

  removeItem(key: string): void {
    if (!this.values.has(key)) return;
    this.values.delete(key);
    this.enqueue(key, null);
  }

  clear(): void {
    for (const key of [...this.values.keys()]) this.removeItem(key);
  }

  private enqueue(key: string, value: string | null) {
    this.queued += 1;
    const operation = this.tail.then(async () => {
      const revision = this.revisions.get(key) ?? 0;
      let response: Response | undefined;
      let lastNetworkError: Error | undefined;
      // Fast, bounded retries for transient Cloudflare/network errors.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          response = await fetch(`${SYNC_API_ORIGIN}/state`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
            body: JSON.stringify({ key, value, revision }),
          });
          if (response.status !== 429 && response.status < 500) break;
        } catch (error) {
          lastNetworkError = error instanceof Error ? error : new Error('Network request failed.');
        }
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
      }
      if (!response) throw lastNetworkError ?? new Error('دسترسی به سرور ذخیره‌سازی برقرار نشد.');
      if (!response.ok) throw new Error(response.status === 409
        ? 'این داده در دستگاه دیگری تغییر کرده است؛ پیش از ادامه صفحه را دوباره بارگذاری کن.'
        : response.status === 401
          ? 'ورود Google منقضی شده است؛ ذخیرهٔ روی سرور تأیید نشد.'
          : `ذخیرهٔ سروری ${key} ناموفق بود (HTTP ${response.status}).`);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !Number.isSafeInteger((result as { revision?: unknown }).revision))
        throw new Error('تأیید ذخیرهٔ سروری معتبر نبود.');
      this.revisions.set(key, Number((result as { revision: number }).revision));
      if (this.failedWrites.get(key) === value) this.failedWrites.delete(key);
      if (this.failedWrites.size === 0) this.error = null;
    }).catch(error => {
      this.failedWrites.set(key, value);
      this.error = error instanceof Error ? error : new Error('Server storage write failed.');
      if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new CustomEvent('math-scratchpad:storage-error', {
        detail: this.error.message,
      }));
    }).finally(() => { this.queued = Math.max(0, this.queued - 1); });
    this.tail = operation;
  }

  async flush(): Promise<void> {
    await this.tail;
    if (this.failedWrites.size && navigator.onLine !== false) {
      for (const [key, value] of [...this.failedWrites]) this.enqueue(key, value);
      await this.tail;
    }
    if (this.error) throw this.error;
  }

  get hasPendingWrites() { return this.queued > 0; }

  /** A newer server record is adopted only when local writes have completed. */
  applyRemote(records: ServerStateRecord[]) {
    if (this.hasPendingWrites || this.error) return;
    const incoming = new Map(records.map(record => [record.key, record]));
    for (const key of new Set([...this.values.keys(), ...incoming.keys()])) {
      const remote = incoming.get(key);
      const old = this.values.get(key) ?? null;
      const next = remote?.value ?? null;
      if (remote) this.revisions.set(key, remote.revision);
      else this.revisions.delete(key);
      if (old === next) continue;
      if (next === null) this.values.delete(key);
      else this.values.set(key, next);
      this.onChange?.(key, next);
    }
  }

  exportRecords(): Array<ServerStateRecord & { value: string }> {
    return [...this.values].map(([key, value]) => ({ key, value, revision: this.revisions.get(key) ?? 0 }));
  }
}
