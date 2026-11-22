import {
  completeLocalLearningReset,
  isLocalLearningResetPending,
  readQuarantineCount,
  reconcileServerLearningResetEpoch,
} from '../browser-db';
import {
  getStoredServerLearningResetEpoch,
  hasLocalPendingResetMetadata,
  isValidLearningResetEpoch,
  markLocalLearningResetPending,
  markServerResetStatusUnknown,
  markServerResetStatusVerified,
  setLocalPendingResetEpoch,
} from '../learning-reset-epoch';
import { isRecord, retryDelay } from './sync-runtime-types';

export type ResetPollerContext = {
  apiOrigin: string;
  fetcher: typeof fetch;
  random: () => number;
  scheduleTimeout: typeof globalThis.setTimeout;
  cancelTimeout: typeof globalThis.clearTimeout;
  isStarted: () => boolean;
  setEpoch: (epoch: string) => void;
  setResetStatusReady: (ready: boolean) => void;
  refreshCount: () => Promise<number>;
  getQuarantined: () => number;
  setQuarantined: (count: number) => void;
};

export class ResetStatusPoller {
  private resetPollAttempt = 0;
  private resetPollTimer?: ReturnType<typeof setTimeout>;
  private resetPollFlight?: Promise<void>;

  constructor(private readonly ctx: ResetPollerContext) {}

  cancel(): void {
    if (this.resetPollTimer) this.ctx.cancelTimeout(this.resetPollTimer);
    this.resetPollTimer = undefined;
  }

  /** Unauthenticated recovery poll; a client lock clears only after a released server epoch. */
  async refresh(): Promise<void> {
    if (!this.ctx.isStarted()) return;
    if (this.resetPollFlight) return this.resetPollFlight;
    const flight = (async () => {
      let nextDelay = 60_000;
      const controller = new AbortController();
      const timeout = this.ctx.scheduleTimeout(() => controller.abort(), 7_000);
      try {
        const response = await this.ctx.fetcher(`${this.ctx.apiOrigin}/reset/status`, { method: 'GET', cache: 'no-store', signal: controller.signal });
        const value: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRecord(value) || !['idle', 'running', 'awaiting_release', 'released'].includes(String(value.status))
          || !isValidLearningResetEpoch(value.epoch) || Object.keys(value).some(key => !['status', 'epoch'].includes(key))) {
          throw new Error('Reset status response is unavailable or invalid.');
        }
        this.resetPollAttempt = 0;
        const epoch = value.epoch;
        this.ctx.setEpoch(epoch);
        if (value.status === 'running' || value.status === 'awaiting_release') {
          if (!isLocalLearningResetPending()) markLocalLearningResetPending();
          setLocalPendingResetEpoch(epoch);
          nextDelay = 10_000;
        } else if (value.status === 'released') {
          const storedEpoch = getStoredServerLearningResetEpoch();
          if (isLocalLearningResetPending() || hasLocalPendingResetMetadata() || storedEpoch !== epoch) await completeLocalLearningReset(epoch);
          else await reconcileServerLearningResetEpoch(epoch);
          await this.ctx.refreshCount();
          this.ctx.setQuarantined(await readQuarantineCount().catch(() => this.ctx.getQuarantined()));
          nextDelay = 60_000;
        } else if (isLocalLearningResetPending()) {
          // The local lock may outlive a server-status transition. Never clear it from idle.
          nextDelay = 10_000;
        } else if (hasLocalPendingResetMetadata()) {
          // Promote events created while status was unverified only after the server confirms its epoch.
          await completeLocalLearningReset(epoch);
          await this.ctx.refreshCount();
          this.ctx.setQuarantined(await readQuarantineCount().catch(() => this.ctx.getQuarantined()));
        } else {
          await reconcileServerLearningResetEpoch(epoch);
        }
        this.ctx.setResetStatusReady(true);
        markServerResetStatusVerified();
      } catch {
        this.ctx.setResetStatusReady(false);
        markServerResetStatusUnknown();
        this.resetPollAttempt += 1;
        nextDelay = retryDelay(this.resetPollAttempt, this.ctx.random);
      } finally {
        this.ctx.cancelTimeout(timeout);
        if (this.ctx.isStarted() && this.resetPollTimer) this.ctx.cancelTimeout(this.resetPollTimer);
        this.resetPollTimer = undefined;
        if (this.ctx.isStarted()) this.resetPollTimer = this.ctx.scheduleTimeout(() => {
          this.resetPollTimer = undefined;
          void this.refresh();
        }, nextDelay);
        this.resetPollFlight = undefined;
      }
    })();
    this.resetPollFlight = flight;
    return flight;
  }
}
