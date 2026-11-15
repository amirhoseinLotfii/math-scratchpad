import { RuntimeResetGate } from '../reset-gate/runtime-reset-gate';
import { NETWORK_SYNC_DEBOUNCE_MS, NETWORK_SYNC_MAX_WAIT_MS } from '../../../shared/contracts/sync-timing';
import { readOutboxBatch, type OutboxRecord } from '../browser-db';

const MAX_BATCH_EVENTS = 50;
const MAX_KEEPALIVE_BATCH_BYTES = 60_000;

export abstract class RuntimeEventSender extends RuntimeResetGate {
  protected abstract canWriteToServer(): boolean;
  protected abstract pushOutbox(options?: { keepalive?: boolean; maxBytes?: number }): Promise<void>;

  protected readonly keepaliveOutbox = new Map<string, OutboxRecord>();
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private maxWaitTimer?: ReturnType<typeof setTimeout>;
  protected keepaliveFlushInProgress = false;
  protected readonly beaconQueuedEventIds = new Set<string>();

  protected async refreshKeepaliveOutbox(): Promise<void> {
    const batch = await readOutboxBatch(MAX_BATCH_EVENTS);
    this.keepaliveOutbox.clear();
    for (const record of batch) this.keepaliveOutbox.set(record.id, record);
  }

  protected async refreshCountAndTrigger() {
    const pending = await this.refreshCount();
    if (!this.canWriteToServer()) return;
    if (this.token) this.scheduleEventFlush();
    else this.update({ phase: pending ? 'needs-auth' : this.current.phase === 'synced' ? 'synced' : 'idle' });
  }

  private scheduleEventFlush(): void {
    if (!this.started || !this.token || !this.canWriteToServer()) return;
    if (this.debounceTimer) this.cancelTimeout(this.debounceTimer);
    this.debounceTimer = this.scheduleTimeout(() => {
      this.debounceTimer = undefined;
      void this.syncNow();
    }, NETWORK_SYNC_DEBOUNCE_MS);
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = this.scheduleTimeout(() => {
        this.maxWaitTimer = undefined;
        if (this.debounceTimer) this.cancelTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
        void this.syncNow();
      }, NETWORK_SYNC_MAX_WAIT_MS);
    }
  }

  protected clearEventFlushTimers(): void {
    if (this.debounceTimer) this.cancelTimeout(this.debounceTimer);
    if (this.maxWaitTimer) this.cancelTimeout(this.maxWaitTimer);
    this.debounceTimer = undefined;
    this.maxWaitTimer = undefined;
  }

  protected onWake = () => {
    if (!this.started || navigator.onLine === false) return;
    this.beaconQueuedEventIds.clear();
    void this.refreshResetStatus().then(() => {
      if (this.canWriteToServer()) void this.syncNow();
    });
  };
  protected onVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.onWake();
    else this.flushKeepaliveBatch();
  };
  protected onPageHide = () => {
    this.flushKeepaliveBatch();
  };

  private flushKeepaliveBatch(): void {
    if (!this.started || !this.token || this.keepaliveFlushInProgress || !this.canWriteToServer() || navigator.onLine === false) return;
    this.clearEventFlushTimers();
    // The page may be discarded before an async fetch starts. Queue a simple beacon synchronously;
    // the Worker authenticates its session token and deduplicates IDs when the durable outbox retries.
    const available = [...this.keepaliveOutbox.values()]
      .filter((record) => !this.beaconQueuedEventIds.has(record.id))
      .slice(0, MAX_BATCH_EVENTS);
    if (!available.length) return;

    const selected: OutboxRecord[] = [];
    let payload = '';
    for (const record of available) {
      const next = [...selected, record];
      const candidate = JSON.stringify({
        sessionToken: this.token,
        epoch: this.learningResetEpoch,
        events: next.map((item) => item.event),
      });
      if (new TextEncoder().encode(candidate).byteLength > MAX_KEEPALIVE_BATCH_BYTES) break;
      selected.push(record);
      payload = candidate;
    }
    if (!selected.length) return;

    try {
      const queued =
        typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon(`${this.apiOrigin}/events/beacon`, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
      if (queued) {
        for (const record of selected) this.beaconQueuedEventIds.add(record.id);
        return;
      }
    } catch {
      // Fall through to fetch keepalive for browsers that reject or lack sendBeacon.
    }

    this.keepaliveFlushInProgress = true;
    void this.pushOutbox({ keepalive: true, maxBytes: MAX_KEEPALIVE_BATCH_BYTES })
      .catch(() => {
        // The durable outbox remains the source of truth and will retry on the next visit.
      })
      .finally(() => {
        this.keepaliveFlushInProgress = false;
      });
  }
}
