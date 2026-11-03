import type { LearnEvent } from './events';
import { subscribeToLearnEvents } from './events';
import {
  acknowledgeOutbox,
  getSyncMeta,
  queueLearnEvent,
  readOutboxBatch,
  readOutboxCount,
  setSyncMeta,
  storeServerEvents,
  updateAuthenticatedServerToken,
} from './browser-db';

export const SYNC_API_ORIGIN = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';
const PAGE_LIMIT = 100;
const MAX_PULL_PAGES_PER_RUN = 100;
const MAX_BATCH_BYTES = 190_000;
const MAX_BATCH_EVENTS = 50;

export type SyncPhase = 'idle' | 'needs-auth' | 'queued' | 'syncing' | 'synced' | 'retrying' | 'error';
export type MirrorPhase = 'not_configured' | 'pending' | 'syncing' | 'synced' | 'error';
export type MirrorSyncStatus = {
  status: MirrorPhase;
  pendingCount: number;
  quarantinedCount?: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  weeklyBackup?: {
    status: 'not_configured' | 'scheduled' | 'created' | 'error';
    lastCreatedAt: string | null;
    lastError: string | null;
  };
};
export type SyncStatus = {
  phase: SyncPhase;
  pending: number;
  lastSyncedAt?: string;
  lastError?: string;
  driveMirror: MirrorSyncStatus | null;
  notionMirror: MirrorSyncStatus | null;
};

type SyncPage = { events: Array<{ seq: number; event: LearnEvent }>; cursor: number; through: number; hasMore: boolean; snapshotCursor?: number };
type AckResponse = { events: Array<{ id: string; seq: number; duplicate: boolean }>; cursor: number };
type RuntimeOptions = { apiOrigin?: string; fetcher?: typeof fetch; random?: () => number; now?: () => number };

class SyncRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = true, readonly retryAfterMs?: number) { super(message); }
}

function retryDelay(attempt: number, random: () => number): number {
  const base = Math.min(300_000, 1_000 * (2 ** Math.max(0, attempt - 1)));
  return Math.round(base * (0.75 + Math.min(1, Math.max(0, random())) * 0.5));
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

export class BrowserSyncRuntime {
  private readonly apiOrigin: string;
  private readonly fetcher: typeof fetch;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private current: SyncStatus = { phase: 'idle', pending: 0, driveMirror: null, notionMirror: null };
  private token: string | null = null;
  private unsubscribeEvents?: () => void;
  private running?: Promise<void>;
  private mirrorStatusObservers = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempt = 0;
  private started = false;

  constructor(options: RuntimeOptions = {}) {
    this.apiOrigin = (options.apiOrigin ?? SYNC_API_ORIGIN).replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  getSnapshot = (): SyncStatus => this.current;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  private update(next: Partial<SyncStatus>) {
    this.current = { ...this.current, ...next };
    for (const listener of this.listeners) listener();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.unsubscribeEvents = subscribeToLearnEvents(event => {
      void queueLearnEvent(event).then(() => this.refreshCountAndTrigger()).catch(() => {
        this.update({ phase: 'error', lastError: 'رویداد در صف آفلاین ذخیره نشد؛ اتصال یا فضای مرورگر را بررسی کن.' });
      });
    });
    window.addEventListener('online', this.onWake);
    window.addEventListener('focus', this.onWake);
    window.addEventListener('pageshow', this.onWake);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    await this.refreshCount();
    void this.syncNow();
  }

  stop(): void {
    this.unsubscribeEvents?.(); this.unsubscribeEvents = undefined;
    window.removeEventListener('online', this.onWake);
    window.removeEventListener('focus', this.onWake);
    window.removeEventListener('pageshow', this.onWake);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined; this.started = false;
  }

  setIdToken(token: string | null): void {
    this.token = token;
    if (token) updateAuthenticatedServerToken(token);
    if (!token) {
      if (this.current.phase !== 'synced') this.update({ phase: this.current.pending ? 'needs-auth' : 'idle' });
      return;
    }
    this.retryAttempt = 0;
    void this.syncNow();
  }

  observeMirrorStatuses(): () => void {
    this.mirrorStatusObservers += 1;
    void this.refreshMirrorStatuses();
    return () => { this.mirrorStatusObservers = Math.max(0, this.mirrorStatusObservers - 1); };
  }

  /** Refresh the separately reported server-side Drive and Notion mirror states. */
  async refreshMirrorStatuses(): Promise<void> {
    if (!this.started || !this.token) return;
    await Promise.all([this.refreshMirrorStatus('drive'), this.refreshMirrorStatus('notion')]);
  }

  /** Push/pull local events, then ask each configured private mirror to sync now. */
  async syncAllNow(): Promise<void> {
    await this.syncNow();
    if (!this.started || !this.token) return;
    await this.refreshMirrorStatuses();

    const configured = [
      { path: '/drive/sync', status: this.current.driveMirror },
      { path: '/notion/sync', status: this.current.notionMirror },
    ].filter(item => item.status?.status !== 'not_configured');
    const results = await Promise.allSettled(configured.map(item => this.request(item.path, { method: 'POST' })));
    await this.refreshMirrorStatuses();
    const failed = results.flatMap((result, index) => {
      if (result.status !== 'rejected') return [];
      const mirror = configured[index];
      const name = mirror.path.startsWith('/drive/') ? 'Drive' : 'Notion';
      const currentStatus = name === 'Drive' ? this.current.driveMirror : this.current.notionMirror;
      return [`${name}: ${currentStatus?.lastError || (result.reason instanceof Error ? result.reason.message : 'ارسال ناموفق بود')}`];
    });
    for (const [kind, state] of [['Drive', this.current.driveMirror], ['Notion', this.current.notionMirror]] as const) {
      if (state && state.status !== 'not_configured' && (state.status !== 'synced' || state.pendingCount > 0)) {
        failed.push(`${kind}: ${state.lastError || `در انتظار تأیید ${state.pendingCount} رویداد`}`);
      }
    }
    if (failed.length) throw new Error([...new Set(failed)].join(' · '));
  }

  /** Server backup always reads the canonical log; browser IndexedDB is not used. */
  async readAllServerEvents(): Promise<Array<{ seq: number; event: LearnEvent }>> {
    if (!this.token) throw new Error('برای گرفتن پشتیبان سرور، ابتدا با Google وارد شو.');
    const events: Array<{ seq: number; event: LearnEvent }> = [];
    let cursor = 0;
    let through: number | undefined;
    for (let page = 0; page < 2000; page++) {
      const params = new URLSearchParams({ cursor: String(cursor), limit: String(PAGE_LIMIT) });
      if (through !== undefined) params.set('through', String(through));
      const response = await this.request(`/snapshot?${params}`, { method: 'GET' });
      const body: SyncPage = await response.json();
      if (!Array.isArray(body.events) || !Number.isSafeInteger(body.cursor) || !Number.isSafeInteger(body.snapshotCursor)) {
        throw new Error('نسخهٔ رویدادهای سرور معتبر نیست.');
      }
      through ??= body.snapshotCursor;
      events.push(...body.events);
      cursor = body.cursor;
      if (!body.hasMore) return events;
    }
    throw new Error('تعداد صفحات پشتیبان سرور از حد ایمن فراتر رفت.');
  }

  async syncNow(): Promise<void> {
    if (this.running) return this.running;
    if (!this.started) return;
    if (!this.token) {
      const pending = await this.refreshCount();
      this.update({ phase: pending ? 'needs-auth' : 'idle' });
      return;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.running = this.runSync().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async refreshCount(): Promise<number> {
    const pending = await readOutboxCount().catch(() => 0);
    this.update({ pending });
    return pending;
  }

  private async refreshCountAndTrigger() {
    const pending = await this.refreshCount();
    if (this.token) void this.syncNow();
    else this.update({ phase: pending ? 'needs-auth' : this.current.phase === 'synced' ? 'synced' : 'idle' });
  }

  private onWake = () => { if (this.started && navigator.onLine !== false) void this.syncNow(); };
  private onVisibilityChange = () => { if (document.visibilityState === 'visible') this.onWake(); };
  private onPageHide = () => { /* IndexedDB transactions are already submitted as each event is queued. */ };

  private async request(path: string, init: RequestInit): Promise<Response> {
    if (!this.token) throw new SyncRequestError('Google sign-in is required.', 401, false);
    let response: Response;
    try {
      response = await this.fetcher(`${this.apiOrigin}${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token}` },
      });
    } catch { throw new SyncRequestError('شبکه در دسترس نیست؛ داده‌ها در صف آفلاین می‌مانند.'); }
    if (response.status === 401) throw new SyncRequestError('ورود گوگل منقضی شده است؛ دوباره متصل شو.', 401, false);
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      throw new SyncRequestError('درخواست‌های همگام‌سازی زیاد شده؛ ارسال دوباره زمان‌بندی می‌شود.', 429, true, Number.isFinite(seconds) ? seconds * 1_000 : undefined);
    }
    if (!response.ok) throw new SyncRequestError(`سرور همگام‌سازی پاسخ ${response.status} داد.`, response.status, response.status >= 500);
    return response;
  }

  private async refreshMirrorStatus(kind: 'drive' | 'notion'): Promise<void> {
    const path = kind === 'drive' ? '/drive/status' : '/notion/status';
    try {
      const response = await this.request(path, { method: 'GET' });
      const value: unknown = await response.json();
      if (!isMirrorSyncStatus(value)) throw new SyncRequestError('پاسخ وضعیت همگام‌سازی معتبر نبود.');
      this.update(kind === 'drive' ? { driveMirror: value } : { notionMirror: value });
    } catch (error) {
      if (error instanceof SyncRequestError && error.status === 401) {
        this.token = null;
        this.update({ phase: 'needs-auth', lastError: 'ورود گوگل منقضی شده است؛ دوباره متصل شو.' });
      }
      const unavailable: MirrorSyncStatus = {
        status: 'error',
        pendingCount: 0,
        lastSyncedAt: null,
        lastError: error instanceof Error ? error.message : 'وضعیت همگام‌سازی دریافت نشد.',
      };
      this.update(kind === 'drive' ? { driveMirror: unavailable } : { notionMirror: unavailable });
    }
  }

  private async pushOutbox(): Promise<void> {
    while (true) {
      const batch = await readOutboxBatch(MAX_BATCH_EVENTS);
      if (!batch.length) return;
      const selected: typeof batch = [];
      let bytes = 2;
      for (const item of batch) {
        const nextSize = new TextEncoder().encode(JSON.stringify(item.event)).byteLength + (selected.length ? 1 : 0);
        if (selected.length && bytes + nextSize > MAX_BATCH_BYTES) break;
        if (!selected.length && nextSize > MAX_BATCH_BYTES) throw new SyncRequestError('یک رویداد از حد مجاز سرور بزرگ‌تر است و در صف نگه داشته شد.', 413, false);
        selected.push(item); bytes += nextSize;
      }
      const response = await this.request('/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: selected.map(item => item.event) }),
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
      await acknowledgeOutbox(confirmed.map(item => item.id));
      await this.refreshCount();
    }
  }

  private async pullEvents(): Promise<boolean> {
    const snapshotDone = await getSyncMeta<boolean>('snapshot-initialized');
    let hasMore = false;
    if (!snapshotDone) {
      let cursor = 0, through: number | undefined;
      for (let page = 0; page < MAX_PULL_PAGES_PER_RUN; page++) {
        const params = new URLSearchParams({ cursor: String(cursor), limit: String(PAGE_LIMIT) });
        if (through !== undefined) params.set('through', String(through));
        const response = await this.request(`/snapshot?${params}`, { method: 'GET' });
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
      const response = await this.request(`/sync?${params}`, { method: 'GET' });
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

  private async runSync(): Promise<void> {
    this.update({ phase: 'syncing', lastError: undefined });
    try {
      await this.pushOutbox();
      const hasMore = await this.pullEvents();
      const pending = await this.refreshCount();
      this.retryAttempt = 0;
      this.update({ phase: pending ? 'queued' : 'synced', lastSyncedAt: new Date(this.now()).toISOString(), lastError: undefined });
      if (this.mirrorStatusObservers > 0) await this.refreshMirrorStatuses();
      if (hasMore || pending) this.scheduleRetry(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'همگام‌سازی ناموفق بود.';
      const requestError = error instanceof SyncRequestError ? error : undefined;
      if (requestError?.status === 401) this.token = null;
      const pending = await this.refreshCount();
      this.update({ phase: requestError?.status === 401 ? 'needs-auth' : requestError?.retryable === false ? 'error' : 'retrying', pending, lastError: message });
      if (this.mirrorStatusObservers > 0) await this.refreshMirrorStatuses();
      if (requestError?.retryable !== false && requestError?.status !== 401 && navigator.onLine !== false) {
        this.retryAttempt += 1;
        this.scheduleRetry(requestError?.retryAfterMs ?? retryDelay(this.retryAttempt, this.random));
      }
    }
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.syncNow(); }, delayMs);
  }
}

function isMirrorSyncStatus(value: unknown): value is MirrorSyncStatus {
  if (!isRecord(value)) return false;
  const base = (value.status === 'not_configured' || value.status === 'pending' || value.status === 'syncing' || value.status === 'synced' || value.status === 'error')
    && typeof value.pendingCount === 'number' && Number.isFinite(value.pendingCount) && value.pendingCount >= 0
    && (value.quarantinedCount === undefined || value.quarantinedCount === null
      || (typeof value.quarantinedCount === 'number' && Number.isFinite(value.quarantinedCount) && value.quarantinedCount >= 0))
    && (value.lastSyncedAt === null || typeof value.lastSyncedAt === 'string')
    && (value.lastError === null || typeof value.lastError === 'string');
  if (!base || value.weeklyBackup === undefined) return base;
  const backup = value.weeklyBackup;
  return isRecord(backup)
    && (backup.status === 'not_configured' || backup.status === 'scheduled' || backup.status === 'created' || backup.status === 'error')
    && (backup.lastCreatedAt === null || typeof backup.lastCreatedAt === 'string')
    && (backup.lastError === null || typeof backup.lastError === 'string');
}

let defaultRuntime: BrowserSyncRuntime | undefined;
export function setDefaultSyncRuntime(runtime: BrowserSyncRuntime): void { defaultRuntime = runtime; }
export function getDefaultSyncRuntime(): BrowserSyncRuntime | undefined { return defaultRuntime; }
