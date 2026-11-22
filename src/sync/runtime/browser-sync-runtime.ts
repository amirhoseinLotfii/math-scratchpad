import {
  queueLearnEvent,
  readOutboxCount,
  readQuarantineCount,
  updateAuthenticatedServerToken,
} from '../browser-db';
import { subscribeToLearnEvents, type LearnEvent } from '../events';
import {
  canWriteToServer as isServerWriteAllowed,
  isServerResetStatusVerified,
  LEARNING_RESET_EPOCH,
  markServerResetStatusUnknown,
  SERVER_WRITE_GUARD_CHANGED_EVENT,
} from '../learning-reset-epoch';
import { SYNC_API_ORIGIN } from '../sync-config';
import { MirrorSyncCoordinator } from './mirror-sync-coordinator';
import { OutboxTransport } from './outbox-transport';
import { ResetStatusPoller } from './reset-status-poller';
import { SyncFlushScheduler } from './sync-flush-scheduler';
import { SyncHttpClient } from './sync-http-client';
import {
  retryDelay,
  SyncRequestError,
  type ResetPreview,
  type RuntimeOptions,
  type SyncStatus,
} from './sync-runtime-types';

export class BrowserSyncRuntime {
  private readonly apiOrigin: string;
  private readonly fetcher: typeof fetch;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private readonly http: SyncHttpClient;
  private readonly resetPoller: ResetStatusPoller;
  private readonly outbox: OutboxTransport;
  private readonly mirrors: MirrorSyncCoordinator;
  private readonly scheduler: SyncFlushScheduler;
  private current: SyncStatus = { phase: 'idle', pending: 0, quarantined: 0, driveMirror: null, notionMirror: null };
  private token: string | null = null;
  private deferredToken: string | null = null;
  private learningResetEpoch = LEARNING_RESET_EPOCH;
  private unsubscribeEvents?: () => void;
  private running?: Promise<void>;
  private retryAttempt = 0;
  private started = false;
  private resetStatusReady = false;

  constructor(options: RuntimeOptions = {}) {
    this.apiOrigin = (options.apiOrigin ?? SYNC_API_ORIGIN).replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    const scheduleTimeout = options.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis);
    const cancelTimeout = options.cancelTimeout ?? globalThis.clearTimeout.bind(globalThis);

    this.scheduler = new SyncFlushScheduler({
      scheduleTimeout,
      cancelTimeout,
      canScheduleFlush: () => this.started && !!this.token && this.canWriteToServer(),
      canWriteToServer: () => this.canWriteToServer(),
      triggerSync: () => { void this.syncNow(); },
    });
    this.http = new SyncHttpClient({
      apiOrigin: this.apiOrigin,
      fetcher: this.fetcher,
      getToken: () => this.token,
      canWriteToServer: () => this.canWriteToServer(),
      getEpoch: () => this.learningResetEpoch,
      setEpoch: epoch => { this.learningResetEpoch = epoch; },
      refreshCount: () => this.refreshCount(),
    });
    this.resetPoller = new ResetStatusPoller({
      apiOrigin: this.apiOrigin,
      fetcher: this.fetcher,
      random: this.random,
      scheduleTimeout,
      cancelTimeout,
      isStarted: () => this.started,
      setEpoch: epoch => { this.learningResetEpoch = epoch; },
      setResetStatusReady: ready => { this.resetStatusReady = ready; },
      refreshCount: () => this.refreshCount(),
      getQuarantined: () => this.current.quarantined,
      setQuarantined: quarantined => this.update({ quarantined }),
    });
    this.outbox = new OutboxTransport({
      apiOrigin: this.apiOrigin,
      isStarted: () => this.started,
      getToken: () => this.token,
      getEpoch: () => this.learningResetEpoch,
      canWriteToServer: () => this.canWriteToServer(),
      clearEventFlushTimers: () => this.scheduler.clearEventFlushTimers(),
      refreshCount: () => this.refreshCount(),
      http: this.http,
    });
    this.mirrors = new MirrorSyncCoordinator({
      isStarted: () => this.started,
      getToken: () => this.token,
      clearToken: () => { this.token = null; },
      getStatus: () => this.current,
      updateStatus: next => this.update(next),
      http: this.http,
    });
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
    this.scheduler.clearAll();
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
    this.outbox.clearBeaconIds();
    if (this.token) updateAuthenticatedServerToken(this.token);
    void this.outbox.refreshKeepaliveOutbox().then(() => this.refreshCountAndTrigger()).then(() => { if (this.token) void this.syncNow(); });
  };

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.resetStatusReady = false;
    markServerResetStatusUnknown();
    window.addEventListener(SERVER_WRITE_GUARD_CHANGED_EVENT, this.onServerWriteGuardChanged);
    this.unsubscribeEvents = subscribeToLearnEvents(event => {
      void queueLearnEvent(event).then(() => {
        this.outbox.trackQueuedEvent(event);
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
    await this.outbox.refreshKeepaliveOutbox().catch(() => {});
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
    this.resetPoller.cancel();
    this.scheduler.clearAll();
    this.outbox.resetOnStop();
    this.started = false;
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

  previewAllReset(token?: string): Promise<ResetPreview> { return this.http.previewAllReset(token); }
  hasCloudLearningData(token?: string): Promise<boolean> { return this.http.hasCloudLearningData(token); }
  refreshServerResetEpoch(token?: string): Promise<boolean> { return this.http.refreshServerResetEpoch(token); }
  refreshResetStatus(): Promise<void> { return this.resetPoller.refresh(); }
  observeMirrorStatuses(): () => void { return this.mirrors.observe(); }
  refreshMirrorStatuses(): Promise<void> { return this.mirrors.refreshAll(); }
  syncAllNow(): Promise<void> { return this.mirrors.syncAllNow(() => this.syncNow()); }
  syncAllUntilComplete(timeoutMs = 120_000): Promise<void> { return this.mirrors.syncAllUntilComplete(() => this.syncNow(), timeoutMs); }
  readAllServerEvents(): Promise<Array<{ seq: number; event: LearnEvent }>> { return this.http.readAllServerEvents(); }
  private request(path: string, init: RequestInit, tokenOverride?: string, allowNotFound = false): Promise<Response> {
    return this.http.request(path, init, tokenOverride, allowNotFound);
  }

  async syncNow(): Promise<void> {
    if (!this.canWriteToServer()) return;
    if (this.running) return this.running;
    if (!this.started) return;
    this.scheduler.clearEventFlushTimers();
    if (!this.token) {
      const pending = await this.refreshCount();
      this.update({ phase: pending ? 'needs-auth' : 'idle' });
      return;
    }
    this.scheduler.clearRetryTimer();
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

  private async refreshCountAndTrigger() {
    const pending = await this.refreshCount();
    if (!this.canWriteToServer()) return;
    if (this.token) this.scheduler.scheduleEventFlush();
    else this.update({ phase: pending ? 'needs-auth' : this.current.phase === 'synced' ? 'synced' : 'idle' });
  }

  private onWake = () => {
    if (!this.started || navigator.onLine === false) return;
    this.outbox.clearBeaconIds();
    void this.refreshResetStatus().then(() => { if (this.canWriteToServer()) void this.syncNow(); });
  };
  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.onWake();
    else this.outbox.flushKeepaliveBatch();
  };
  private onPageHide = () => { this.outbox.flushKeepaliveBatch(); };

  private async runSync(): Promise<void> {
    this.update({ phase: 'syncing', lastError: undefined });
    try {
      if (!(await this.refreshServerResetEpoch())) return;
      await this.outbox.pushOutbox();
      const hasMore = await this.outbox.pullEvents();
      const pending = await this.refreshCount();
      this.retryAttempt = 0;
      this.update({ phase: pending ? 'queued' : 'synced', lastSyncedAt: new Date(this.now()).toISOString(), lastError: undefined });
      if (this.mirrors.hasObservers()) await this.mirrors.refreshAll();
      if (hasMore || pending) this.scheduler.scheduleRetry(100);
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
      if (this.mirrors.hasObservers()) await this.mirrors.refreshAll();
      if (requestError?.retryable !== false && requestError?.status !== 401 && navigator.onLine !== false) {
        this.retryAttempt += 1;
        this.scheduler.scheduleRetry(requestError?.retryAfterMs ?? retryDelay(this.retryAttempt, this.random));
      }
    }
  }
}

let defaultRuntime: BrowserSyncRuntime | undefined;
export function setDefaultSyncRuntime(runtime: BrowserSyncRuntime): void { defaultRuntime = runtime; }
export function getDefaultSyncRuntime(): BrowserSyncRuntime | undefined { return defaultRuntime; }
