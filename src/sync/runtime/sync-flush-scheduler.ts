import { EVENT_DEBOUNCE_MS, EVENT_MAX_WAIT_MS } from './sync-runtime-types';

export type FlushSchedulerContext = {
  scheduleTimeout: typeof globalThis.setTimeout;
  cancelTimeout: typeof globalThis.clearTimeout;
  canScheduleFlush: () => boolean;
  canWriteToServer: () => boolean;
  triggerSync: () => void;
};

export class SyncFlushScheduler {
  private retryTimer?: ReturnType<typeof setTimeout>;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private maxWaitTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly ctx: FlushSchedulerContext) {}

  scheduleEventFlush(): void {
    if (!this.ctx.canScheduleFlush()) return;
    if (this.debounceTimer) this.ctx.cancelTimeout(this.debounceTimer);
    this.debounceTimer = this.ctx.scheduleTimeout(() => {
      this.debounceTimer = undefined;
      this.ctx.triggerSync();
    }, EVENT_DEBOUNCE_MS);
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = this.ctx.scheduleTimeout(() => {
        this.maxWaitTimer = undefined;
        if (this.debounceTimer) this.ctx.cancelTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
        this.ctx.triggerSync();
      }, EVENT_MAX_WAIT_MS);
    }
  }

  clearEventFlushTimers(): void {
    if (this.debounceTimer) this.ctx.cancelTimeout(this.debounceTimer);
    if (this.maxWaitTimer) this.ctx.cancelTimeout(this.maxWaitTimer);
    this.debounceTimer = undefined;
    this.maxWaitTimer = undefined;
  }

  scheduleRetry(delayMs: number): void {
    if (!this.ctx.canWriteToServer()) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.ctx.triggerSync();
    }, delayMs);
  }

  clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  clearAll(): void {
    this.clearRetryTimer();
    this.clearEventFlushTimers();
  }
}
