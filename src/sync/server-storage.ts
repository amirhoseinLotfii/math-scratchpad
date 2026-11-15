import { latestLocalValue, dispatchConflict } from './state-mirror/state-events';
import { sendStateWrite } from './state-mirror/send-state-write';
import { mergeStateSnapshot } from './state-mirror/merge-state-snapshot';
import {
  readServerSnapshot,
  SERVER_STORAGE_BUDGET_EVENT,
  type OversizedState,
  type ServerStateRecord,
  type ServerStorageChangeSource,
  type ServerStorageConflict,
  type ServerStorageConflictChoice,
} from './state-mirror/state-api';
export * from './state-mirror/state-api';
import { StateWriteCoalescer } from './state-write-coalescer';
/**
 * Authenticated server mirror for learner state.
 *
 * IndexedDB remains the durable local source. This adapter mirrors allowlisted
 * learning records through the authenticated Worker endpoint.
 */
import { SYNC_STATE_BUDGET_BYTES, utf8Bytes } from '../../shared/contracts/limits';
import { keepLocalServerConflictValue } from './server-conflict-merge';

export class ServerBackedStorage implements Storage {
  private readonly values = new Map<string, string>();
  private readonly baseValues = new Map<string, string | null>();
  private readonly revisions = new Map<string, number>();
  private token: string;
  private tail: Promise<void> = Promise.resolve();
  private error: Error | null = null;
  private readonly failedWrites = new Map<string, string | null>();
  private oversizedState = new Map<string, OversizedState>();
  private readonly conflicts = new Map<string, ServerStorageConflict>();
  private queued = 0;
  private readonly coalescer = new StateWriteCoalescer((key, value, keepalive) => this.enqueue(key, value, keepalive));
  private readonly onChange?: (key: string, value: string | null, source?: ServerStorageChangeSource) => void;

  constructor(
    records: ServerStateRecord[],
    token: string,
    onChange?: (key: string, value: string | null, source?: ServerStorageChangeSource) => void,
  ) {
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
    this.flushPendingWrites();
    this.retryFailedWrites();
  }
  get length() {
    return this.values.size;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (!key.startsWith('math-scratchpad')) throw new Error('Storage key is not owned by Math Scratchpad.');
    const stringValue = String(value);
    if (this.values.get(key) === stringValue) return;
    this.values.set(key, stringValue);
    const conflict = this.conflicts.get(key);
    if (conflict) this.conflicts.set(key, { ...conflict, localValue: stringValue });
    this.stage(key, stringValue);
  }

  removeItem(key: string): void {
    if (!this.values.has(key)) return;
    this.values.delete(key);
    this.stage(key, null);
  }

  clear(): void {
    for (const key of [...this.values.keys()]) this.removeItem(key);
  }

  getOversizedState(): ReadonlyMap<string, OversizedState> {
    return this.oversizedState;
  }

  private setOversizedState(key: string, bytes?: number) {
    const current = this.oversizedState.get(key);
    if (current?.bytes === bytes) return;
    this.oversizedState = new Map(this.oversizedState);
    if (bytes === undefined) this.oversizedState.delete(key);
    else {
      this.oversizedState.set(key, { status: 'too_large', bytes });
      this.failedWrites.delete(key);
      if (this.failedWrites.size === 0) this.error = null;
    }
    if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event(SERVER_STORAGE_BUDGET_EVENT));
  }

  private stage(key: string, value: string | null) {
    this.failedWrites.delete(key);
    if (this.failedWrites.size === 0) this.error = null;
    const bytes = value === null ? 0 : utf8Bytes(value);
    if (bytes > SYNC_STATE_BUDGET_BYTES) {
      this.coalescer.cancel(key);
      this.setOversizedState(key, bytes);
      return;
    }
    this.setOversizedState(key);
    this.coalescer.set(key, value);
  }

  flushPendingWrites(keepalive = false) {
    this.coalescer.flush(keepalive);
  }

  private retryFailedWrites() {
    for (const [key, value] of this.failedWrites) {
      this.failedWrites.delete(key);
      this.enqueue(key, value);
    }
  }

  private async mergeConflict(key: string): Promise<{ done: true } | { done: false; value: string | null }> {
    this.coalescer.cancel(key);
    this.flushPendingWrites();
    const snapshot = await readServerSnapshot(this.token);
    if (this.oversizedState.has(key)) return { done: true };
    this.coalescer.cancel(key);
    const localValue = latestLocalValue(key, this.values.get(key) ?? null);
    const { remoteValue, remoteRevision, merge } = mergeStateSnapshot(snapshot, key, this.baseValues.get(key) ?? null, localValue);
    this.revisions.set(key, remoteRevision);
    this.baseValues.set(key, remoteValue);

    if (!merge.ok) {
      const conflict = { key, localValue, remoteValue, remoteRevision } satisfies ServerStorageConflict;
      this.setValue(key, localValue);
      this.conflicts.set(key, conflict);
      this.failedWrites.delete(key);
      if (this.failedWrites.size === 0) this.error = null;
      dispatchConflict(conflict);
      return { done: true };
    }

    const desiredValue = merge.value;
    this.setValue(key, desiredValue);
    if (desiredValue !== localValue) this.onChange?.(key, desiredValue, 'server-merge');
    if (desiredValue === remoteValue) {
      this.failedWrites.delete(key);
      if (this.failedWrites.size === 0) this.error = null;
      return { done: true };
    }
    const mergedBytes = desiredValue === null ? 0 : utf8Bytes(desiredValue);
    if (mergedBytes > SYNC_STATE_BUDGET_BYTES) {
      this.setOversizedState(key, mergedBytes);
      return { done: true };
    }
    return { done: false, value: desiredValue };
  }

  private enqueue(key: string, value: string | null, keepalive = false) {
    const bytes = value === null ? 0 : utf8Bytes(value);
    if (bytes > SYNC_STATE_BUDGET_BYTES) {
      this.setOversizedState(key, bytes);
      return;
    }
    this.setOversizedState(key);
    this.queued += 1;
    const operation = this.tail
      .then(async () => {
        if (this.conflicts.has(key) || this.oversizedState.has(key)) return;
        const result = await sendStateWrite(key, value, bytes, keepalive, {
          token: () => this.token,
          revision: () => this.revisions.get(key) ?? 0,
          mergeConflict: () => this.mergeConflict(key),
          currentValue: () => this.getItem(key),
          markOversized: (rejectedBytes) => this.setOversizedState(key, rejectedBytes),
        });
        if (!result) return;
        const { revision, desiredValue } = result;
        this.revisions.set(key, revision);
        this.baseValues.set(key, desiredValue);
        const latestValue = this.values.has(key) ? this.values.get(key)! : null;
        if (latestValue === desiredValue || this.oversizedState.has(key) || this.coalescer.has(key)) this.failedWrites.delete(key);
        else this.failedWrites.set(key, latestValue);
        if (this.failedWrites.size === 0) this.error = null;
      })
      .catch((error) => {
        if (this.oversizedState.has(key) || this.coalescer.has(key)) return;
        // A later edit may already be queued; keep only the latest desired value.
        const latestValue = this.values.has(key) ? this.values.get(key)! : null;
        this.failedWrites.set(key, latestValue);
        this.error = error instanceof Error ? error : new Error('Server storage write failed.');
        if (typeof globalThis.dispatchEvent === 'function')
          globalThis.dispatchEvent(
            new CustomEvent('math-scratchpad:storage-error', {
              detail: this.error.message,
            }),
          );
      })
      .finally(() => {
        this.queued = Math.max(0, this.queued - 1);
      });
    this.tail = operation;
  }

  async flush(): Promise<void> {
    this.flushPendingWrites();
    let tail: Promise<void>;
    do {
      tail = this.tail;
      await tail;
    } while (this.tail !== tail);
    if (this.failedWrites.size && navigator.onLine !== false) {
      this.retryFailedWrites();
      do {
        tail = this.tail;
        await tail;
      } while (this.tail !== tail);
    }
    if (this.error) throw this.error;
  }

  get hasPendingWrites() {
    return this.queued > 0 || this.coalescer.size > 0;
  }

  get pendingKeyCount() {
    return this.coalescer.size;
  }

  getConflicts(): ServerStorageConflict[] {
    return [...this.conflicts.values()];
  }

  async resolveConflict(key: string, choice: ServerStorageConflictChoice): Promise<void> {
    const conflict = this.conflicts.get(key);
    if (!conflict) return;
    this.conflicts.delete(key);
    this.coalescer.cancel(key);
    this.failedWrites.delete(key);
    this.revisions.set(key, conflict.remoteRevision);
    this.baseValues.set(key, conflict.remoteValue);
    if (this.failedWrites.size === 0) this.error = null;

    if (choice === 'remote') {
      this.setOversizedState(key);
      this.setValue(key, conflict.remoteValue);
      this.onChange?.(key, conflict.remoteValue, 'server-resolution-remote');
      return;
    }

    const latestLocal = latestLocalValue(key, this.values.get(key) ?? null);
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
    const incoming = new Map(records.map((record) => [record.key, record]));
    for (const key of new Set([...this.values.keys(), ...incoming.keys()])) {
      if (this.oversizedState.has(key)) continue;
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
}
