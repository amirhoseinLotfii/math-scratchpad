import { RuntimeEventSender } from './event-sender/runtime-event-sender';
import type { SyncStatus } from './runtime-types';
export type { SyncStatus, ResetPreview, MirrorSyncStatus, SyncPhase, MirrorPhase } from './runtime-types';
import { requestSync, SyncRequestError, retryDelay } from './event-sender/request';
import { pushOutbox, pullEvents } from './event-sender/event-transfer';
import { subscribeToLearnEvents } from './events';
import { queueLearnEvent, readOutboxCount, readQuarantineCount, updateAuthenticatedServerToken } from './browser-db';

import { SYNC_API_ORIGIN } from './sync-config';
import {
  canWriteToServer as isServerWriteAllowed,
  isServerResetStatusVerified,
  markServerResetStatusUnknown,
  SERVER_WRITE_GUARD_CHANGED_EVENT,
} from './learning-reset-epoch';
export { SYNC_API_ORIGIN } from './sync-config';

type RuntimeOptions = {
  apiOrigin?: string;
  fetcher?: typeof fetch;
  random?: () => number;
  now?: () => number;
  scheduleTimeout?: typeof globalThis.setTimeout;
  cancelTimeout?: typeof globalThis.clearTimeout;
};

export class BrowserSyncRuntime extends RuntimeEventSender {
  protected readonly apiOrigin: string;
  protected readonly fetcher: typeof fetch;
  protected readonly random: () => number;
  private readonly now: () => number;
  protected readonly scheduleTimeout: typeof globalThis.setTimeout;
  protected readonly cancelTimeout: typeof globalThis.clearTimeout;
  private readonly listeners = new Set<() => void>();
  protected current: SyncStatus = { phase: 'idle', pending: 0, quarantined: 0, driveMirror: null, notionMirror: null };
  protected token: string | null = null;
  private deferredToken: string | null = null;
  private unsubscribeEvents?: () => void;
  private running?: Promise<void>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempt = 0;
  protected started = false;

  constructor(options: RuntimeOptions = {}) {
    super();
    this.apiOrigin = (options.apiOrigin ?? SYNC_API_ORIGIN).replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.scheduleTimeout = options.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimeout = options.cancelTimeout ?? globalThis.clearTimeout.bind(globalThis);
  }

  getSnapshot = (): SyncStatus => this.current;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected update(next: Partial<SyncStatus>) {
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

  protected canWriteToServer(): boolean {
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
    void this.refreshKeepaliveOutbox()
      .then(() => this.refreshCountAndTrigger())
      .then(() => {
        if (this.token) void this.syncNow();
      });
  };

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.resetStatusReady = false;
    markServerResetStatusUnknown();
    window.addEventListener(SERVER_WRITE_GUARD_CHANGED_EVENT, this.onServerWriteGuardChanged);
    this.unsubscribeEvents = subscribeToLearnEvents((event) => {
      void queueLearnEvent(event)
        .then(() => {
          this.keepaliveOutbox.set(event.id, { id: event.id, event, queuedAt: event.ts, creationEpoch: this.learningResetEpoch });
          return this.refreshCountAndTrigger();
        })
        .catch(() => {
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
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = undefined;
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
    this.retryTimer = undefined;
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

  /** Owner-authenticated read-only preflight; it cannot execute deletion. */
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
    this.running = this.runSync().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  protected async refreshCount(): Promise<number> {
    const pending = await readOutboxCount().catch(() => 0);
    const quarantined = await readQuarantineCount().catch(() => this.current.quarantined ?? 0);
    this.update({ pending, quarantined });
    if (typeof window !== 'undefined')
      window.dispatchEvent(new CustomEvent('math-scratchpad:learning-quarantine-changed', { detail: quarantined }));
    return pending;
  }

  protected request(path: string, init: RequestInit, tokenOverride?: string, allowNotFound = false) {
    return requestSync(
      {
        token: this.token,
        apiOrigin: this.apiOrigin,
        fetcher: this.fetcher,
        learningResetEpoch: this.learningResetEpoch,
        canWrite: () => this.canWriteToServer(),
        handleResetEpoch: async (epoch) => {
          this.learningResetEpoch = epoch;
          await this.refreshCount();
        },
      },
      path,
      init,
      tokenOverride,
      allowNotFound,
    );
  }

  private eventTransferDependencies() {
    return {
      request: (path: string, init: RequestInit) => this.request(path, init),
      canWrite: () => this.canWriteToServer(),
      refreshKeepaliveOutbox: () => this.refreshKeepaliveOutbox(),
      refreshCount: () => this.refreshCount(),
      beaconQueuedEventIds: this.beaconQueuedEventIds,
      keepaliveOutbox: this.keepaliveOutbox,
    };
  }

  protected pushOutbox(options?: { keepalive?: boolean; maxBytes?: number }) {
    return pushOutbox(this.eventTransferDependencies(), options);
  }

  private pullEvents() {
    return pullEvents(this.eventTransferDependencies());
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
      this.update({
        phase: requestError?.status === 401 ? 'needs-auth' : requestError?.retryable === false ? 'error' : 'retrying',
        pending,
        lastError: message,
      });
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
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.syncNow();
    }, delayMs);
  }
}

let defaultRuntime: BrowserSyncRuntime | undefined;
export function setDefaultSyncRuntime(runtime: BrowserSyncRuntime): void {
  defaultRuntime = runtime;
}
export function getDefaultSyncRuntime(): BrowserSyncRuntime | undefined {
  return defaultRuntime;
}
