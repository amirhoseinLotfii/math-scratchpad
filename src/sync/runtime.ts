import type { LearnEvent } from './events';
import { subscribeToLearnEvents } from './events';
import {
  acknowledgeOutbox,
  completeLocalLearningReset,
  flushLearningStorage,
  getAuthenticatedServerStorage,
  getSyncMeta,
  isLearningStorageKey,
  isLocalLearningResetPending,
  queueLearnEvent,
  reconcileServerLearningResetEpoch,
  readOutboxBatch,
  readOutboxCount,
  readQuarantineCount,
  setSyncMeta,
  storeServerEvents,
  updateAuthenticatedServerToken,
  type OutboxRecord,
} from './browser-db';

import { SYNC_API_ORIGIN } from './sync-config';
import { reportApiUnauthorized } from './api-unauthorized';
import {
  canWriteToServer as isServerWriteAllowed,
  fetchWithServerWriteGuard,
  getStoredServerLearningResetEpoch,
  hasLocalPendingResetMetadata,
  isServerResetStatusVerified,
  isValidLearningResetEpoch,
  LEARNING_RESET_EPOCH,
  LEARNING_RESET_EPOCH_HEADER,
  LOCAL_RESET_STATE_CHANGED_EVENT,
  markLocalLearningResetPending,
  markServerResetStatusUnknown,
  markServerResetStatusVerified,
  setLocalPendingResetEpoch,
  SERVER_WRITE_GUARD_CHANGED_EVENT,
  ServerWriteBlockedError,
} from './learning-reset-epoch';
export { SYNC_API_ORIGIN } from './sync-config';
const PAGE_LIMIT = 100;
const MAX_PULL_PAGES_PER_RUN = 100;
const MAX_BATCH_BYTES = 190_000;
const MAX_BATCH_EVENTS = 50;
const MAX_KEEPALIVE_BATCH_BYTES = 60_000;
const EVENT_DEBOUNCE_MS = 5_000;
const EVENT_MAX_WAIT_MS = 30_000;

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
  quarantined: number;
  lastSyncedAt?: string;
  lastError?: string;
  driveMirror: MirrorSyncStatus | null;
  notionMirror: MirrorSyncStatus | null;
};

export type ResetPreview = {
  readOnly: true; canExecute: false; scope: 'all';
  matchingEvents: number; totalEvents: number; lastSeq: number; appStateRevision: number;
  protectedBankAndIdentityStateKeys: number; sharedStateKeysRequiringSelectiveMerge: number;
  notionPageReferencesRequiringReconciliation: number | null;
  requiresCloudReconciliation: true; warning: string;
};

type SyncPage = { events: Array<{ seq: number; event: LearnEvent }>; cursor: number; through: number; hasMore: boolean; snapshotCursor?: number };
type AckResponse = { events: Array<{ id: string; seq: number; duplicate: boolean }>; cursor: number };
type RuntimeOptions = {
  apiOrigin?: string;
  fetcher?: typeof fetch;
  random?: () => number;
  now?: () => number;
  scheduleTimeout?: typeof globalThis.setTimeout;
  cancelTimeout?: typeof globalThis.clearTimeout;
};

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
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;
  private readonly listeners = new Set<() => void>();
  private readonly keepaliveOutbox = new Map<string, OutboxRecord>();
  private current: SyncStatus = { phase: 'idle', pending: 0, quarantined: 0, driveMirror: null, notionMirror: null };
  private token: string | null = null;
  private deferredToken: string | null = null;
  private learningResetEpoch = LEARNING_RESET_EPOCH;
  private unsubscribeEvents?: () => void;
  private running?: Promise<void>;
  private mirrorStatusObservers = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private maxWaitTimer?: ReturnType<typeof setTimeout>;
  private keepaliveFlushInProgress = false;
  private readonly beaconQueuedEventIds = new Set<string>();
  private retryAttempt = 0;
  private resetPollAttempt = 0;
  private resetPollTimer?: ReturnType<typeof setTimeout>;
  private resetPollFlight?: Promise<void>;
  private started = false;
  private resetStatusReady = false;

  constructor(options: RuntimeOptions = {}) {
    this.apiOrigin = (options.apiOrigin ?? SYNC_API_ORIGIN).replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.scheduleTimeout = options.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimeout = options.cancelTimeout ?? globalThis.clearTimeout.bind(globalThis);
  }

  getSnapshot = (): SyncStatus => this.current;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  private update(next: Partial<SyncStatus>) {
    this.current = { ...this.current, ...next };
    for (const listener of this.listeners) listener();
  }

  private pauseServerWrites(preserveToken = true): void {
    if (preserveToken && this.token) this.deferredToken = this.token;
    this.token = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.clearEventFlushTimers();
    this.update({ phase: 'needs-auth', lastError: 'ارسال تا تأیید پایان پاک‌سازی متوقف است.' });
  }

  private canWriteToServer(): boolean {
    if (this.resetStatusReady && isServerResetStatusVerified() && isServerWriteAllowed()) return true;
    this.pauseServerWrites();
    return false;
  }

  private onServerWriteGuardChanged = (): void => {
    if (!this.resetStatusReady || !isServerResetStatusVerified() || !isServerWriteAllowed()) {
      this.pauseServerWrites();
      return;
    }
    this.token = this.deferredToken;
    this.beaconQueuedEventIds.clear();
    if (this.token) updateAuthenticatedServerToken(this.token);
    void this.refreshKeepaliveOutbox().then(() => this.refreshCountAndTrigger()).then(() => { if (this.token) void this.syncNow(); });
  };

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.resetStatusReady = false;
    markServerResetStatusUnknown();
    window.addEventListener(SERVER_WRITE_GUARD_CHANGED_EVENT, this.onServerWriteGuardChanged);
    this.unsubscribeEvents = subscribeToLearnEvents(event => {
      void queueLearnEvent(event).then(() => {
        this.keepaliveOutbox.set(event.id, { id: event.id, event, queuedAt: event.ts, creationEpoch: this.learningResetEpoch });
        return this.refreshCountAndTrigger();
      }).catch(() => {
        this.update({ phase: 'error', lastError: 'رویداد در صف آفلاین ذخیره نشد؛ اتصال یا فضای مرورگر را بررسی کن.' });
      });
    });
    window.addEventListener('online', this.onWake);
    window.addEventListener('focus', this.onWake);
    window.addEventListener('pageshow', this.onWake);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    const resetStatusCheck = this.refreshResetStatus();
    await this.refreshCount();
    await resetStatusCheck;
    await this.refreshKeepaliveOutbox().catch(() => {});
    if (!this.canWriteToServer()) return;
    void this.syncNow();
  }

  stop(): void {
    this.unsubscribeEvents?.(); this.unsubscribeEvents = undefined;
    window.removeEventListener('online', this.onWake);
    window.removeEventListener('focus', this.onWake);
    window.removeEventListener('pageshow', this.onWake);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener(SERVER_WRITE_GUARD_CHANGED_EVENT, this.onServerWriteGuardChanged);
    if (this.resetPollTimer) this.cancelTimeout(this.resetPollTimer);
    this.resetPollTimer = undefined;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.clearEventFlushTimers();
    this.keepaliveFlushInProgress = false;
    this.beaconQueuedEventIds.clear();
    this.retryTimer = undefined; this.started = false;
  }

  setIdToken(token: string | null): void {
    this.deferredToken = token;
    if (!this.resetStatusReady || !isServerResetStatusVerified() || !isServerWriteAllowed()) {
      this.pauseServerWrites(false);
      return;
    }
    this.token = token;
    if (token) updateAuthenticatedServerToken(token);
    if (!token) {
      if (this.current.phase !== 'synced') this.update({ phase: this.current.pending ? 'needs-auth' : 'idle' });
      return;
    }
    this.retryAttempt = 0;
    void this.syncNow();
  }

  /** Owner-authenticated read-only preflight; it cannot execute deletion. */
  async previewAllReset(token?: string): Promise<ResetPreview> {
    const response = await this.request('/reset/preview?scope=all', { method: 'GET' }, token);
    const value: unknown = await response.json();
    if (!isRecord(value) || value.readOnly !== true || value.canExecute !== false
      || value.scope !== 'all' || value.requiresCloudReconciliation !== true
      || typeof value.warning !== 'string'
      || !['matchingEvents', 'totalEvents', 'lastSeq', 'appStateRevision',
        'protectedBankAndIdentityStateKeys', 'sharedStateKeysRequiringSelectiveMerge']
        .every(key => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)
      || !(value.notionPageReferencesRequiringReconciliation === null
        || (Number.isSafeInteger(value.notionPageReferencesRequiringReconciliation)
          && Number(value.notionPageReferencesRequiringReconciliation) >= 0))) {
      throw new Error('پاسخ پیش‌نمایش ریست معتبر نبود؛ هیچ داده‌ای حذف نشده است.');
    }
    return value as ResetPreview;
  }

  /** Check that no cloud learning state remains before allowing a freshly reset browser to sync. */
  async hasCloudLearningData(token?: string): Promise<boolean> {
    const preview = await this.previewAllReset(token);
    if (preview.matchingEvents > 0 || preview.totalEvents > 0 || preview.sharedStateKeysRequiringSelectiveMerge > 0) return true;
    const response = await this.request('/state', { method: 'GET' }, token);
    const value: unknown = await response.json();
    if (!isRecord(value) || !Array.isArray(value.records)) throw new Error('پاسخ وضعیت ذخیره‌سازی سرور معتبر نبود؛ همگام‌سازی متوقف ماند.');
    return value.records.some(record => isRecord(record) && typeof record.key === 'string' && isLearningStorageKey(record.key));
  }

  /** Read the owner-scoped generation before enabling sync or hydrating server-backed storage. */
  async refreshServerResetEpoch(token?: string): Promise<boolean> {
    const response = await this.request('/reset/epoch', { method: 'GET' }, token, true);
    let epoch = LEARNING_RESET_EPOCH;
    if (response.status !== 404) {
      const value: unknown = await response.json();
      if (!isRecord(value) || !isValidLearningResetEpoch(value.epoch)) {
        throw new SyncRequestError('پاسخ نسل پاک‌سازی سرور معتبر نبود؛ همگام‌سازی متوقف ماند.', undefined, false);
      }
      epoch = value.epoch;
    } else {
      const storedEpoch = getStoredServerLearningResetEpoch();
      if (storedEpoch && storedEpoch !== LEARNING_RESET_EPOCH) {
        throw new SyncRequestError('سرور نسل تازه را تأیید نکرد؛ همگام‌سازی تا بررسی دوباره متوقف است.', 404, false);
      }
    }

    this.learningResetEpoch = epoch;
    const reset = await reconcileServerLearningResetEpoch(epoch);
    if (reset) {
      this.learningResetEpoch = epoch;
      await this.refreshCount();
    }
    return true;
  }

  /** Unauthenticated recovery poll; a client lock clears only after a released server epoch. */
  async refreshResetStatus(): Promise<void> {
    if (!this.started) return;
    if (this.resetPollFlight) return this.resetPollFlight;
    const flight = (async () => {
      let nextDelay = 60_000;
      const controller = new AbortController();
      const timeout = this.scheduleTimeout(() => controller.abort(), 7_000);
      try {
        const response = await this.fetcher(`${this.apiOrigin}/reset/status`, { method: 'GET', cache: 'no-store', signal: controller.signal });
        const value: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRecord(value) || !['idle', 'running', 'awaiting_release', 'released'].includes(String(value.status))
          || !isValidLearningResetEpoch(value.epoch) || Object.keys(value).some(key => !['status', 'epoch'].includes(key))) {
          throw new Error('Reset status response is unavailable or invalid.');
        }
        this.resetPollAttempt = 0;
        const epoch = value.epoch;
        this.learningResetEpoch = epoch;
        if (value.status === 'running' || value.status === 'awaiting_release') {
          if (!isLocalLearningResetPending()) markLocalLearningResetPending();
          setLocalPendingResetEpoch(epoch);
          nextDelay = 10_000;
        } else if (value.status === 'released') {
          const storedEpoch = getStoredServerLearningResetEpoch();
          if (isLocalLearningResetPending() || hasLocalPendingResetMetadata() || storedEpoch !== epoch) await completeLocalLearningReset(epoch);
          else await reconcileServerLearningResetEpoch(epoch);
          await this.refreshCount();
          this.update({ quarantined: await readQuarantineCount().catch(() => this.current.quarantined) });
          nextDelay = 60_000;
        } else if (isLocalLearningResetPending()) {
          // The local lock may outlive a server-status transition. Never clear it from idle.
          nextDelay = 10_000;
        } else if (hasLocalPendingResetMetadata()) {
          // Promote events created while status was unverified only after the server confirms its epoch.
          await completeLocalLearningReset(epoch);
          await this.refreshCount();
          this.update({ quarantined: await readQuarantineCount().catch(() => this.current.quarantined) });
        } else {
          await reconcileServerLearningResetEpoch(epoch);
        }
        this.resetStatusReady = true;
        markServerResetStatusVerified();
      } catch {
        this.resetStatusReady = false;
        markServerResetStatusUnknown();
        this.resetPollAttempt += 1;
        nextDelay = retryDelay(this.resetPollAttempt, this.random);
      } finally {
        this.cancelTimeout(timeout);
        if (this.started && this.resetPollTimer) this.cancelTimeout(this.resetPollTimer);
        this.resetPollTimer = undefined;
        if (this.started) this.resetPollTimer = this.scheduleTimeout(() => {
          this.resetPollTimer = undefined;
          void this.refreshResetStatus();
        }, nextDelay);
        this.resetPollFlight = undefined;
      }
    })();
    this.resetPollFlight = flight;
    return flight;
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

  /** Wait until both configured mirrors acknowledge all queued state and events. */
  async syncAllUntilComplete(timeoutMs = 120_000): Promise<void> {
    if (!this.started) throw new Error('همگام‌سازی هنوز راه‌اندازی نشده است.');
    if (!this.token) throw new Error('برای حفظ امن اطلاعات فصل، اتصال Google لازم است.');
    const deadline = Date.now() + Math.max(1_000, timeoutMs);
    let lastError = '';
    let retryDelayMs = 500;
    await flushLearningStorage();
    await getAuthenticatedServerStorage()?.flush();

    while (Date.now() < deadline) {
      try {
        await this.syncAllNow();
        await this.refreshMirrorStatuses();
        const { driveMirror, notionMirror, pending } = this.current;
        const configured = [driveMirror, notionMirror].filter(
          (mirror): mirror is NonNullable<typeof mirror> => !!mirror && mirror.status !== 'not_configured',
        );
        if (configured.length === 0) {
          throw new Error('برای تغییر فصل، دست‌کم یکی از مقصدهای Google Drive یا Notion باید پیکربندی شده باشد.');
        }
        if (pending === 0 && configured.every(mirror => mirror.status === 'synced' && mirror.pendingCount === 0)) return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'تأیید مقصدهای همگام‌سازی ناموفق بود.';
        if (!this.token) throw new Error(lastError);
        if (lastError.includes('دست‌کم یکی از مقصد')) throw error;
        const permanentError = [this.current.driveMirror?.lastError, this.current.notionMirror?.lastError]
          .find(code => code === 'token_invalid' || code === 'database_not_shared' || code === 'schema_mismatch');
        if (permanentError) throw new Error(`پیکربندی همگام‌سازی نیاز به اصلاح دارد: ${permanentError}`);
        retryDelayMs = Math.min(5_000, retryDelayMs * 2);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    throw new Error(`ذخیرهٔ فصل در مقصدهای همگام‌سازی تا پایان زمان انتظار تأیید نشد${lastError ? `: ${lastError}` : '.'}`);
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
    if (!this.canWriteToServer()) return;
    if (this.running) return this.running;
    if (!this.started) return;
    this.clearEventFlushTimers();
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
    const quarantined = await readQuarantineCount().catch(() => this.current.quarantined ?? 0);
    this.update({ pending, quarantined });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('math-scratchpad:learning-quarantine-changed', { detail: quarantined }));
    return pending;
  }

  private async refreshKeepaliveOutbox(): Promise<void> {
    const batch = await readOutboxBatch(MAX_BATCH_EVENTS);
    this.keepaliveOutbox.clear();
    for (const record of batch) this.keepaliveOutbox.set(record.id, record);
  }

  private async refreshCountAndTrigger() {
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
    }, EVENT_DEBOUNCE_MS);
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = this.scheduleTimeout(() => {
        this.maxWaitTimer = undefined;
        if (this.debounceTimer) this.cancelTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
        void this.syncNow();
      }, EVENT_MAX_WAIT_MS);
    }
  }

  private clearEventFlushTimers(): void {
    if (this.debounceTimer) this.cancelTimeout(this.debounceTimer);
    if (this.maxWaitTimer) this.cancelTimeout(this.maxWaitTimer);
    this.debounceTimer = undefined;
    this.maxWaitTimer = undefined;
  }

  private onWake = () => {
    if (!this.started || navigator.onLine === false) return;
    this.beaconQueuedEventIds.clear();
    void this.refreshResetStatus().then(() => { if (this.canWriteToServer()) void this.syncNow(); });
  };
  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.onWake();
    else this.flushKeepaliveBatch();
  };
  private onPageHide = () => {
    this.flushKeepaliveBatch();
  };

  private flushKeepaliveBatch(): void {
    if (!this.started || !this.token || this.keepaliveFlushInProgress || !this.canWriteToServer() || navigator.onLine === false) return;
    this.clearEventFlushTimers();
    // The page may be discarded before an async fetch starts. Queue a simple beacon synchronously;
    // the Worker authenticates its session token and deduplicates IDs when the durable outbox retries.
    const available = [...this.keepaliveOutbox.values()]
      .filter(record => !this.beaconQueuedEventIds.has(record.id))
      .slice(0, MAX_BATCH_EVENTS);
    if (!available.length) return;

    const selected: OutboxRecord[] = [];
    let payload = '';
    for (const record of available) {
      const next = [...selected, record];
      const candidate = JSON.stringify({
        sessionToken: this.token,
        epoch: this.learningResetEpoch,
        events: next.map(item => item.event),
      });
      if (new TextEncoder().encode(candidate).byteLength > MAX_KEEPALIVE_BATCH_BYTES) break;
      selected.push(record);
      payload = candidate;
    }
    if (!selected.length) return;

    try {
      const queued = typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon(`${this.apiOrigin}/events/beacon`, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
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

  private async request(path: string, init: RequestInit, tokenOverride?: string, allowNotFound = false): Promise<Response> {
    const token = tokenOverride ?? this.token;
    if (!token) throw new SyncRequestError('Google sign-in is required.', 401, false);
    const method = (init.method ?? 'GET').toUpperCase();
    const isServerWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isServerWrite && !this.canWriteToServer()) {
      throw new SyncRequestError('ارسال تا تأیید پایان پاک‌سازی متوقف است؛ هیچ داده‌ای فرستاده نشد.', 409, false);
    }
    const isLearningWrite = init.method?.toUpperCase() === 'POST' && (path === '/events' || path === '/state');
    let response: Response;
    try {
      const requestInit: RequestInit = {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
          ...(isLearningWrite ? { [LEARNING_RESET_EPOCH_HEADER]: this.learningResetEpoch } : {}),
        },
      };
      response = isServerWrite
        ? await fetchWithServerWriteGuard(this.fetcher, `${this.apiOrigin}${path}`, requestInit)
        : await this.fetcher(`${this.apiOrigin}${path}`, requestInit);
    } catch (error) {
      if (error instanceof ServerWriteBlockedError || (isServerWrite && !this.canWriteToServer())) {
        throw new SyncRequestError('ارسال تا تأیید پایان پاک‌سازی متوقف است؛ هیچ داده‌ای فرستاده نشد.', 409, false);
      }
      throw new SyncRequestError('شبکه در دسترس نیست؛ داده‌ها در صف آفلاین می‌مانند.');
    }
    if (response.status === 401) {
      // An expired or revoked Worker session is forgotten so a fresh GIS login can mint a new one.
      reportApiUnauthorized(token);
      throw new SyncRequestError('ورود گوگل منقضی شده است؛ دوباره متصل شو.', 401, false);
    }
    if (response.status === 404 && allowNotFound) return response;
    if (response.status === 426 && isLearningWrite) {
      const body: unknown = await response.clone().json().catch(() => null);
      const epoch = isRecord(body) && isValidLearningResetEpoch(body.requiredEpoch) ? body.requiredEpoch : null;
      if (epoch) {
        markLocalLearningResetPending();
        setLocalPendingResetEpoch(epoch);
        await completeLocalLearningReset(epoch);
        this.learningResetEpoch = epoch;
        await this.refreshCount();
      }
      throw new SyncRequestError('نسل پاک‌سازی تغییر کرده؛ این داده ارسال نشد.', 426, false);
    }
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

  private async pushOutbox(options: { keepalive?: boolean; maxBytes?: number } = {}): Promise<void> {
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
      const response = await this.request('/events', {
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
      if (!this.canWriteToServer()) {
        throw new SyncRequestError('پاک‌سازی هنگام ارسال آغاز شد؛ رویدادها تا تأیید دوباره در صف ماندند.', 409, false);
      }
      const confirmedIds = confirmed.map(item => item.id);
      await acknowledgeOutbox(confirmedIds);
      for (const id of confirmedIds) {
        this.keepaliveOutbox.delete(id);
        this.beaconQueuedEventIds.delete(id);
      }
      if (options.keepalive) await this.refreshKeepaliveOutbox();
      await this.refreshCount();
      if (options.keepalive) return;
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
      if (!(await this.refreshServerResetEpoch())) return;
      await this.pushOutbox();
      const hasMore = await this.pullEvents();
      const pending = await this.refreshCount();
      this.retryAttempt = 0;
      this.update({ phase: pending ? 'queued' : 'synced', lastSyncedAt: new Date(this.now()).toISOString(), lastError: undefined });
      if (this.mirrorStatusObservers > 0) await this.refreshMirrorStatuses();
      if (hasMore || pending) this.scheduleRetry(100);
    } catch (error) {
      if (!this.canWriteToServer()) {
        await this.refreshCount();
        this.update({ phase: 'needs-auth', lastError: 'ارسال تا تأیید پایان پاک‌سازی متوقف است.' });
        return;
      }
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
    if (!this.canWriteToServer()) return;
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
