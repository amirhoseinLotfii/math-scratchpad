import { keepLocalServerConflictValue } from './server-conflict-merge';
import { writeServerRecordWithRetry } from './server-state-writer';
import {
  SERVER_STORAGE_CONFLICT_EVENT,
  SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT,
  type ServerStateRecord,
  type ServerStorageChangeSource,
  type ServerStorageConflict,
  type ServerStorageConflictChoice,
  type ServerStorageSnapshotRequest,
} from './server-storage-types';

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
    const operation = this.tail.then(() => writeServerRecordWithRetry(key, value, {
      token: this.token,
      getRevision: k => this.revisions.get(k) ?? 0,
      setRevision: (k, revision) => this.revisions.set(k, revision),
      getBaseValue: k => this.baseValues.get(k) ?? null,
      setBaseValue: (k, val) => this.baseValues.set(k, val),
      getLatestLocalValue: k => this.latestLocalValue(k, this.values.get(k) ?? null),
      setLocalValue: (k, val) => this.setValue(k, val),
      hasConflict: k => this.conflicts.has(k),
      onConflict: conflict => {
        this.conflicts.set(conflict.key, conflict);
        this.failedWrites.delete(conflict.key);
        if (this.failedWrites.size === 0) this.error = null;
        this.dispatchConflict(conflict);
      },
      onServerMerge: (k, mergedValue) => { this.onChange?.(k, mergedValue, 'server-merge'); },
      onClearFailedWrite: k => {
        this.failedWrites.delete(k);
        if (this.failedWrites.size === 0) this.error = null;
      },
      onSuccessRecord: (k, desiredValue, revision) => {
        this.revisions.set(k, revision);
        this.baseValues.set(k, desiredValue);
        const latestValue = this.values.has(k) ? this.values.get(k)! : null;
        if (latestValue === desiredValue) this.failedWrites.delete(k);
        else this.failedWrites.set(k, latestValue);
        if (this.failedWrites.size === 0) this.error = null;
      },
    })).catch(error => {
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
