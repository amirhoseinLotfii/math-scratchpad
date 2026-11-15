import {
  acknowledgeOutbox,
  readOutboxBatch,
  storeServerEvents,
  getSyncMeta,
  setSyncMeta,
  isLocalLearningResetPending,
  type OutboxRecord,
} from '../browser-db';
import type { LearnEvent } from '../events';
import { isRecord, SyncRequestError } from './request';

const PAGE_LIMIT = 100;
const MAX_PULL_PAGES_PER_RUN = 100;
const MAX_BATCH_BYTES = 190_000;
const MAX_BATCH_EVENTS = 50;

type SyncPage = {
  events: Array<{ seq: number; event: LearnEvent }>;
  cursor: number;
  through: number;
  hasMore: boolean;
  snapshotCursor?: number;
};
type AckResponse = { events: Array<{ id: string; seq: number; duplicate: boolean }>; cursor: number };
type EventTransferDependencies = {
  request: (path: string, init: RequestInit) => Promise<Response>;
  canWrite: () => boolean;
  refreshKeepaliveOutbox: () => Promise<void>;
  refreshCount: () => Promise<number>;
  beaconQueuedEventIds: Set<string>;
  keepaliveOutbox: Map<string, OutboxRecord>;
};

export async function pushOutbox(deps: EventTransferDependencies, options: { keepalive?: boolean; maxBytes?: number } = {}): Promise<void> {
  const maxBytes = options.maxBytes ?? MAX_BATCH_BYTES;
  while (true) {
    if (isLocalLearningResetPending()) return;
    const batch = options.keepalive
      ? [...deps.keepaliveOutbox.values()].slice(0, MAX_BATCH_EVENTS)
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
      selected.push(item);
      bytes += nextSize;
    }
    const idempotencyKey = `events-${selected.map((item) => item.id).join('.')}`;
    const response = await deps.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ events: selected.map((item) => item.event) }),
      ...(options.keepalive ? { keepalive: true } : {}),
    });
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.events)) throw new SyncRequestError('پاسخ تأیید سرور معتبر نبود.');
    const acknowledged = new Map<string, number>();
    for (const row of body.events) {
      if (!isRecord(row) || typeof row.id !== 'string' || !Number.isSafeInteger(row.seq)) continue;
      acknowledged.set(row.id, Number(row.seq));
    }
    const confirmed = selected.filter((item) => acknowledged.has(item.id));
    if (confirmed.length !== selected.length)
      throw new SyncRequestError('سرور همهٔ رویدادهای دسته را تأیید نکرد؛ رویدادها در صف باقی ماندند.');
    if (!deps.canWrite()) {
      throw new SyncRequestError('پاک‌سازی هنگام ارسال آغاز شد؛ رویدادها تا تأیید دوباره در صف ماندند.', 409, false);
    }
    const confirmedIds = confirmed.map((item) => item.id);
    await acknowledgeOutbox(confirmedIds);
    for (const id of confirmedIds) {
      deps.keepaliveOutbox.delete(id);
      deps.beaconQueuedEventIds.delete(id);
    }
    if (options.keepalive) await deps.refreshKeepaliveOutbox();
    await deps.refreshCount();
    if (options.keepalive) return;
  }
}

export async function pullEvents(deps: EventTransferDependencies): Promise<boolean> {
  const snapshotDone = await getSyncMeta<boolean>('snapshot-initialized');
  let hasMore = false;
  if (!snapshotDone) {
    let cursor = 0,
      through: number | undefined;
    for (let page = 0; page < MAX_PULL_PAGES_PER_RUN; page++) {
      const params = new URLSearchParams({ cursor: String(cursor), limit: String(PAGE_LIMIT) });
      if (through !== undefined) params.set('through', String(through));
      const response = await deps.request(`/snapshot?${params}`, { method: 'GET' });
      const result = (await response.json()) as SyncPage;
      if (
        !Array.isArray(result.events) ||
        !Number.isSafeInteger(result.cursor) ||
        !Number.isSafeInteger(result.snapshotCursor) ||
        typeof result.hasMore !== 'boolean'
      )
        throw new SyncRequestError('پاسخ snapshot سرور معتبر نبود.');
      through ??= result.snapshotCursor;
      await storeServerEvents(result.events);
      cursor = result.cursor;
      await setSyncMeta('server-cursor', cursor);
      if (!result.hasMore) {
        await setSyncMeta('snapshot-initialized', true);
        return false;
      }
      hasMore = true;
    }
    return hasMore;
  }

  let cursor = Number((await getSyncMeta<number>('server-cursor')) ?? 0),
    through: number | undefined;
  for (let page = 0; page < MAX_PULL_PAGES_PER_RUN; page++) {
    const params = new URLSearchParams({ cursor: String(cursor), limit: String(PAGE_LIMIT) });
    if (through !== undefined) params.set('through', String(through));
    const response = await deps.request(`/sync?${params}`, { method: 'GET' });
    const result = (await response.json()) as SyncPage;
    if (
      !Array.isArray(result.events) ||
      !Number.isSafeInteger(result.cursor) ||
      !Number.isSafeInteger(result.through) ||
      typeof result.hasMore !== 'boolean'
    )
      throw new SyncRequestError('پاسخ sync سرور معتبر نبود.');
    through ??= result.through;
    await storeServerEvents(result.events);
    cursor = result.cursor;
    await setSyncMeta('server-cursor', cursor);
    if (!result.hasMore) return false;
    hasMore = true;
  }
  return hasMore;
}
