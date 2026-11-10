/**
 * Authenticated server mirror for learner state.
 *
 * IndexedDB remains the durable local source. This adapter mirrors allowlisted
 * learning records through the authenticated Worker endpoint.
 */
import { SYNC_API_ORIGIN } from './sync-config';
import { reportApiUnauthorized } from './api-unauthorized';
import { keepLocalServerConflictValue, mergeServerStateValues } from './server-conflict-merge';

export type ServerStateRecord = { key: string; value: string | null; revision: number; updatedAt?: string };
type ServerSnapshot = { records: ServerStateRecord[]; revision: number };

export const SERVER_STORAGE_CONFLICT_EVENT = 'math-scratchpad:server-conflict';
export const SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT = 'math-scratchpad:server-snapshot-request';

export type ServerStorageConflict = {
  key: string;
  localValue: string | null;
  remoteValue: string | null;
  remoteRevision: number;
};
export type ServerStorageConflictChoice = 'local' | 'remote';
export type ServerStorageChangeSource = 'server-merge' | 'server-resolution-local' | 'server-resolution-remote';
export type ServerStorageSnapshotRequest = { key: string; value: string | null; provided: boolean };

function isSnapshot(value: unknown): value is ServerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return Array.isArray(row.records) && Number.isSafeInteger(row.revision)
    && row.records.every(x => !!x && typeof x.key === 'string' && x.key.startsWith('math-scratchpad')
      && (typeof x.value === 'string' || x.value === null) && Number.isSafeInteger(x.revision)
      && (x.updatedAt === undefined || typeof x.updatedAt === 'string'));
}

export async function readServerSnapshot(token: string, signal?: AbortSignal): Promise<ServerSnapshot> {
  const response = await fetch(`${SYNC_API_ORIGIN}/state`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (response.status === 401) reportApiUnauthorized(token);
  if (!response.ok) throw new Error(response.status === 401
    ? 'برای خواندن اطلاعات از سرور باید دوباره با Google وارد شوی.'
    : `دریافت وضعیت ذخیره‌شدهٔ سرور ناموفق بود (HTTP ${response.status}).`);
  const value: unknown = await response.json();
  if (!isSnapshot(value)) throw new Error('پاسخ وضعیت یادگیری از سرور معتبر نیست.');
  return value;
}

/** Tiny owner-authenticated heartbeat; it avoids downloading the learning snapshot. */
export async function verifyOwnerServerConnection(token: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${SYNC_API_ORIGIN}/drive/status`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', ...(signal ? { signal } : {}),
  });
  if (response.status === 401) reportApiUnauthorized(token);
  if (!response.ok) throw new Error(response.status === 401
    ? 'ورود Google منقضی شده است؛ برای ادامه دوباره وارد شو.'
    : `دسترسی احراز هویت‌شده به سرور تأیید نشد (HTTP ${response.status}).`);
}

export class ServerBackedStorage implements Storage {
  private readonly values = new Map<string, string>();
  private readonly baseValues = new Map<string, string | null>();
  private readonly revisions = new Map<string, number>();
  private token: string;
  private tail: Promise<void> = Promise.resolve();
  private error: Error | null = null;
  private readonly failedWrites = new Map<string, string | null>();
  private readonly conflicts = new Map<string, ServerStorageConflict>();
  private queued = 0;
  private readonly onChange?: (key: string, value: string | null, source?: ServerStorageChangeSource) => void;

  constructor(records: ServerStateRecord[], token: string, onChange?: (key: string, value: string | null, source?: ServerStorageChangeSource) => void) {
    this.token = token;
    this.onChange = onChange;
    for (const row of records) {
      if (row.value !== null) this.values.set(row.key, row.value);
      this.baseValues.set(row.key, row.value);
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
    const conflict = this.conflicts.get(key);
    if (conflict) this.conflicts.set(key, { ...conflict, localValue: stringValue });
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
      if (this.conflicts.has(key)) return;
      let response: Response | undefined;
      let lastNetworkError: Error | undefined;
      let desiredValue = value;
      // Fast, bounded retries for transient Cloudflare/network errors and stale revisions.
      for (let attempt = 0; attempt < 4; attempt++) {
        const revision = this.revisions.get(key) ?? 0;
        try {
          response = await fetch(`${SYNC_API_ORIGIN}/state`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
            body: JSON.stringify({ key, value: desiredValue, revision }),
          });
          if (response.status === 409) {
            const snapshot = await readServerSnapshot(this.token);
            const remote = snapshot.records.find(record => record.key === key);
            const remoteValue = remote?.value ?? null;
            const remoteRevision = remote?.revision ?? 0;
            const localValue = this.latestLocalValue(key, this.values.get(key) ?? null);
            const baseValue = this.baseValues.get(key) ?? null;
            const merge = mergeServerStateValues(key, baseValue, localValue, remoteValue);
            this.revisions.set(key, remoteRevision);
            this.baseValues.set(key, remoteValue);

            if (!merge.ok) {
              const conflict = { key, localValue, remoteValue, remoteRevision } satisfies ServerStorageConflict;
              this.setValue(key, localValue);
              this.conflicts.set(key, conflict);
              this.failedWrites.delete(key);
              if (this.failedWrites.size === 0) this.error = null;
              this.dispatchConflict(conflict);
              return;
            }

            desiredValue = merge.value;
            this.setValue(key, desiredValue);
            if (desiredValue !== localValue) this.onChange?.(key, desiredValue, 'server-merge');
            if (desiredValue === remoteValue) {
              this.failedWrites.delete(key);
              if (this.failedWrites.size === 0) this.error = null;
              return;
            }
            if (attempt < 3) continue;
            throw new Error('Server state kept changing while merging this saved item. Try again.');
          }
          if (response.status !== 429 && response.status < 500) break;
        } catch (error) {
          lastNetworkError = error instanceof Error ? error : new Error('Network request failed.');
        }
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
      }
      if (!response) throw lastNetworkError ?? new Error('دسترسی به سرور ذخیره‌سازی برقرار نشد.');
      if (response.status === 401) reportApiUnauthorized(this.token);
      if (!response.ok) throw new Error(response.status === 409
        ? 'این داده در دستگاه دیگری تغییر کرده است؛ پیش از ادامه صفحه را دوباره بارگذاری کن.'
        : response.status === 401
          ? 'ورود Google منقضی شده است؛ ذخیرهٔ روی سرور تأیید نشد.'
          : `ذخیرهٔ سروری ${key} ناموفق بود (HTTP ${response.status}).`);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !Number.isSafeInteger((result as { revision?: unknown }).revision))
        throw new Error('تأیید ذخیرهٔ سروری معتبر نبود.');
      this.revisions.set(key, Number((result as { revision: number }).revision));
      this.baseValues.set(key, desiredValue);
      const latestValue = this.values.has(key) ? this.values.get(key)! : null;
      if (latestValue === desiredValue) this.failedWrites.delete(key);
      else this.failedWrites.set(key, latestValue);
      if (this.failedWrites.size === 0) this.error = null;
    }).catch(error => {
      // A later edit may already be queued; keep only the latest desired value.
      const latestValue = this.values.has(key) ? this.values.get(key)! : null;
      this.failedWrites.set(key, latestValue);
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

  getConflicts(): ServerStorageConflict[] { return [...this.conflicts.values()]; }

  async resolveConflict(key: string, choice: ServerStorageConflictChoice): Promise<void> {
    const conflict = this.conflicts.get(key);
    if (!conflict) return;
    this.conflicts.delete(key);
    this.failedWrites.delete(key);
    this.revisions.set(key, conflict.remoteRevision);
    this.baseValues.set(key, conflict.remoteValue);
    if (this.failedWrites.size === 0) this.error = null;

    if (choice === 'remote') {
      this.setValue(key, conflict.remoteValue);
      this.onChange?.(key, conflict.remoteValue, 'server-resolution-remote');
      return;
    }

    const latestLocal = this.latestLocalValue(key, this.values.get(key) ?? null);
    const localValue = keepLocalServerConflictValue(key, latestLocal, conflict.remoteValue);
    this.setValue(key, localValue);
    this.onChange?.(key, localValue, 'server-resolution-local');
    if (localValue === conflict.remoteValue) return;
    try {
      this.enqueue(key, localValue);
      await this.flush();
    } catch (error) {
      this.failedWrites.delete(key);
      this.conflicts.set(key, { ...conflict, localValue });
      throw error;
    }
  }

  /** A newer server record is adopted only when local writes have completed. */
  applyRemote(records: ServerStateRecord[]) {
    if (this.hasPendingWrites || this.error || this.conflicts.size) return;
    const incoming = new Map(records.map(record => [record.key, record]));
    for (const key of new Set([...this.values.keys(), ...incoming.keys()])) {
      const remote = incoming.get(key);
      const old = this.values.get(key) ?? null;
      const next = remote?.value ?? null;
      this.baseValues.set(key, next);
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

  private setValue(key: string, value: string | null) {
    if (value === null) this.values.delete(key);
    else this.values.set(key, value);
  }

  private latestLocalValue(key: string, fallback: string | null): string | null {
    if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return fallback;
    const detail: ServerStorageSnapshotRequest = { key, value: fallback, provided: false };
    try { globalThis.dispatchEvent(new CustomEvent(SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT, { detail })); }
    catch { return fallback; }
    return detail.provided && (typeof detail.value === 'string' || detail.value === null) ? detail.value : fallback;
  }

  private dispatchConflict(conflict: ServerStorageConflict) {
    if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
    globalThis.dispatchEvent(new CustomEvent(SERVER_STORAGE_CONFLICT_EVENT, { detail: conflict }));
  }
}
