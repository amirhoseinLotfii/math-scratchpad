import {
  acknowledgeOutbox,
  getSyncMeta,
  isLocalLearningResetPending,
  readOutboxBatch,
  setSyncMeta,
  storeServerEvents,
  type OutboxRecord,
} from '../browser-db';
import type { LearnEvent } from '../events';
import type { SyncHttpClient } from './sync-http-client';
import {
  isRecord,
  MAX_BATCH_BYTES,
  MAX_BATCH_EVENTS,
  MAX_KEEPALIVE_BATCH_BYTES,
  MAX_PULL_PAGES_PER_RUN,
  PAGE_LIMIT,
  SyncRequestError,
  type SyncPage,
} from './sync-runtime-types';

export type OutboxTransportContext = {
  apiOrigin: string;
  isStarted: () => boolean;
  getToken: () => string | null;
  getEpoch: () => string;
  canWriteToServer: () => boolean;
  clearEventFlushTimers: () => void;
  refreshCount: () => Promise<number>;
  http: SyncHttpClient;
};

export class OutboxTransport {
  private readonly keepaliveOutbox = new Map<string, OutboxRecord>();
  private readonly beaconQueuedEventIds = new Set<string>();
  private keepaliveFlushInProgress = false;

  constructor(private readonly ctx: OutboxTransportContext) {}

  clearBeaconIds(): void {
    this.beaconQueuedEventIds.clear();
  }

  resetOnStop(): void {
    this.keepaliveFlushInProgress = false;
    this.beaconQueuedEventIds.clear();
  }

  trackQueuedEvent(event: LearnEvent): void {
    this.keepaliveOutbox.set(event.id, {
      id: event.id,
      event,
      queuedAt: event.ts,
      creationEpoch: this.ctx.getEpoch(),
    });
  }

  async refreshKeepaliveOutbox(): Promise<void> {
    const batch = await readOutboxBatch(MAX_BATCH_EVENTS);
    this.keepaliveOutbox.clear();
    for (const record of batch) this.keepaliveOutbox.set(record.id, record);
  }

  flushKeepaliveBatch(): void {
    const token = this.ctx.getToken();
    if (!this.ctx.isStarted() || !token || this.keepaliveFlushInProgress || !this.ctx.canWriteToServer() || navigator.onLine === false) return;
    this.ctx.clearEventFlushTimers();
    const available = [...this.keepaliveOutbox.values()]
      .filter(record => !this.beaconQueuedEventIds.has(record.id))
      .slice(0, MAX_BATCH_EVENTS);
    if (!available.length) return;

    const selected: OutboxRecord[] = [];
    let payload = '';
    for (const record of available) {
      const next = [...selected, record];
      const candidate = JSON.stringify({
        sessionToken: token,
        epoch: this.ctx.getEpoch(),
        events: next.map(item => item.event),
      });
      if (new TextEncoder().encode(candidate).byteLength > MAX_KEEPALIVE_BATCH_BYTES) break;
      selected.push(record);
      payload = candidate;
    }
    if (!selected.length) return;

    try {
      const queued = typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon(`${this.ctx.apiOrigin}/events/beacon`, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
      if (queued) {
        for (const record of selected) this.beaconQueuedEventIds.add(record.id);
        return;
      }
    } catch {
      // Fall through to fetch keepalive for browsers that reject or lack sendBeacon.
    }

    this.keepaliveFlushInProgress = true;
    void this.pushOutbox({ keepalive: true, maxBytes: MAX_KEEPALIVE_BATCH_BYTES }).catch(() => {
      // The durable outbox remains the source of truth and will retry on the next visit.
    }).finally(() => { this.keepaliveFlushInProgress = false; });
  }

  async pushOutbox(options: { keepalive?: boolean; maxBytes?: number } = {}): Promise<void> {
    const maxBytes = options.maxBytes ?? MAX_BATCH_BYTES;
    while (true) {
      if (isLocalLearningResetPending()) return;
      const batch = options.keepalive
        ? [...this.keepaliveOutbox.values()].slice(0, MAX_BATCH_EVENTS)
        : await readOutboxBatch(MAX_BATCH_EVENTS);
      if (!batch.length) return;
      const selected: typeof batch = [];
      let bytes = 2;
      for (const item of batch) {
        const nextSize = new TextEncoder().encode(JSON.stringify(item.event)).byteLength + (selected.length ? 1 : 0);
        if (selected.length && bytes + nextSize > maxBytes) break;
        if (!selected.length && nextSize > maxBytes) {
          if (options.keepalive) return;
          throw new SyncRequestError('یک رویداد از حد مجاز سرور بزرگ‌تر است و در صف نگه داشته شد.', 413, false);
        }
        selected.push(item); bytes += nextSize;
      }
      const idempotencyKey = `events-${selected.map(item => item.id).join('.')}`;
      const response = await this.ctx.http.request('/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ events: selected.map(item => item.event) }),
        ...(options.keepalive ? { keepalive: true } : {}),
      });
      const body: unknown = await response.json();
      if (!isRecord(body) || !Array.isArray(body.events)) throw new SyncRequestError('پاسخ تأیید سرور معتبر نبود.');
      const acknowledged = new Map<string, number>();
      for (const row of body.events) {
        if (!isRecord(row) || typeof row.id !== 'string' || !Number.isSafeInteger(row.seq)) continue;
        acknowledged.set(row.id, Number(row.seq));
      }
      const confirmed = selected.filter(item => acknowledged.has(item.id));
      if (confirmed.length !== selected.length) throw new SyncRequestError('سرور همهٔ رویدادهای دسته را تأیید نکرد؛ رویدادها در صف باقی ماندند.');
      if (!this.ctx.canWriteToServer()) {
        throw new SyncRequestError('پاک‌سازی هنگام ارسال آغاز شد؛ رویدادها تا تأیید دوباره در صف ماندند.', 409, false);
      }
      const confirmedIds = confirmed.map(item => item.id);
      await acknowledgeOutbox(confirmedIds);
      for (const id of confirmedIds) {
        this.keepaliveOutbox.delete(id);
        this.beaconQueuedEventIds.delete(id);
      }
      if (options.keepalive) await this.refreshKeepaliveOutbox();
      await this.ctx.refreshCount();
      if (options.keepalive) return;
    }
  }

  async pullEvents(): Promise<boolean> {
    const snapshotDone = await getSyncMeta<boolean>('snapshot-initialized');
    let hasMore = false;
    if (!snapshotDone) {
      let cursor = 0, through: number | undefined;
      for (let page = 0; page < MAX_PULL_PAGES_PER_RUN; page++) {
        const params = new URLSearchParams({ cursor: String(cursor), limit: String(PAGE_LIMIT) });
        if (through !== undefined) params.set('through', String(through));
        const response = await this.ctx.http.request(`/snapshot?${params}`, { method: 'GET' });
        const result = await response.json() as SyncPage;
        if (!Array.isArray(result.events) || !Number.isSafeInteger(result.cursor) || !Number.isSafeInteger(result.snapshotCursor) || typeof result.hasMore !== 'boolean') throw new SyncRequestError('پاسخ snapshot سرور معتبر نبود.');
        through ??= result.snapshotCursor;
        await storeServerEvents(result.events);
        cursor = result.cursor;
        await setSyncMeta('server-cursor', cursor);
        if (!result.hasMore) { await setSyncMeta('snapshot-initialized', true); return false; }
        hasMore = true;
      }
      return hasMore;
    }

    let cursor = Number(await getSyncMeta<number>('server-cursor') ?? 0), through: number | undefined;
    for (let page = 0; page < MAX_PULL_PAGES_PER_RUN; page++) {
      const params = new URLSearchParams({ cursor: String(cursor), limit: String(PAGE_LIMIT) });
      if (through !== undefined) params.set('through', String(through));
      const response = await this.ctx.http.request(`/sync?${params}`, { method: 'GET' });
      const result = await response.json() as SyncPage;
      if (!Array.isArray(result.events) || !Number.isSafeInteger(result.cursor) || !Number.isSafeInteger(result.through) || typeof result.hasMore !== 'boolean') throw new SyncRequestError('پاسخ sync سرور معتبر نبود.');
      through ??= result.through;
      await storeServerEvents(result.events);
      cursor = result.cursor;
      await setSyncMeta('server-cursor', cursor);
      if (!result.hasMore) return false;
      hasMore = true;
    }
    return hasMore;
  }
}
