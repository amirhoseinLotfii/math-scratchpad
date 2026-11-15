import { NETWORK_SYNC_DEBOUNCE_MS, NETWORK_SYNC_MAX_WAIT_MS } from '../../shared/contracts/sync-timing';

type PendingWrite = {
  value: string | null;
  debounce: ReturnType<typeof setTimeout>;
  deadline: ReturnType<typeof setTimeout>;
};

export class StateWriteCoalescer {
  private readonly writes = new Map<string, PendingWrite>();

  constructor(private readonly send: (key: string, value: string | null, keepalive: boolean) => void) {}

  get size() { return this.writes.size; }
  has(key: string) { return this.writes.has(key); }

  set(key: string, value: string | null) {
    const existing = this.writes.get(key);
    if (existing) clearTimeout(existing.debounce);
    this.writes.set(key, {
      value,
      debounce: setTimeout(() => this.flushKey(key), NETWORK_SYNC_DEBOUNCE_MS),
      deadline: existing?.deadline ?? setTimeout(() => this.flushKey(key), NETWORK_SYNC_MAX_WAIT_MS),
    });
  }

  cancel(key: string) {
    const pending = this.writes.get(key);
    if (!pending) return;
    clearTimeout(pending.debounce);
    clearTimeout(pending.deadline);
    this.writes.delete(key);
  }

  flush(keepalive = false) {
    for (const key of this.writes.keys()) this.flushKey(key, keepalive);
  }

  private flushKey(key: string, keepalive = false) {
    const pending = this.writes.get(key);
    if (!pending) return;
    this.cancel(key);
    this.send(key, pending.value, keepalive);
  }
}
