import { RuntimeMirrors } from '../state-mirror/runtime-mirrors';
import type { ResetPreview } from '../runtime-types';
import { isRecord, retryDelay, SyncRequestError } from '../event-sender/request';
import {
  completeLocalLearningReset,
  isLearningStorageKey,
  isLocalLearningResetPending,
  readQuarantineCount,
  reconcileServerLearningResetEpoch,
} from '../browser-db';
import {
  LEARNING_RESET_EPOCH,
  getStoredServerLearningResetEpoch,
  hasLocalPendingResetMetadata,
  isValidLearningResetEpoch,
  markLocalLearningResetPending,
  markServerResetStatusUnknown,
  markServerResetStatusVerified,
  setLocalPendingResetEpoch,
} from '../learning-reset-epoch';

export abstract class RuntimeResetGate extends RuntimeMirrors {
  protected abstract readonly apiOrigin: string;
  protected abstract readonly fetcher: typeof fetch;
  protected abstract readonly random: () => number;
  protected abstract readonly scheduleTimeout: typeof globalThis.setTimeout;
  protected abstract readonly cancelTimeout: typeof globalThis.clearTimeout;
  protected abstract refreshCount(): Promise<number>;
  protected learningResetEpoch = LEARNING_RESET_EPOCH;
  protected resetStatusReady = false;
  private resetPollAttempt = 0;
  protected resetPollTimer?: ReturnType<typeof setTimeout>;
  private resetPollFlight?: Promise<void>;

  async previewAllReset(token?: string): Promise<ResetPreview> {
    const response = await this.request('/reset/preview?scope=all', { method: 'GET' }, token);
    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      value.readOnly !== true ||
      value.canExecute !== false ||
      value.scope !== 'all' ||
      value.requiresCloudReconciliation !== true ||
      typeof value.warning !== 'string' ||
      ![
        'matchingEvents',
        'totalEvents',
        'lastSeq',
        'appStateRevision',
        'protectedBankAndIdentityStateKeys',
        'sharedStateKeysRequiringSelectiveMerge',
      ].every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0) ||
      !(
        value.notionPageReferencesRequiringReconciliation === null ||
        (Number.isSafeInteger(value.notionPageReferencesRequiringReconciliation) &&
          Number(value.notionPageReferencesRequiringReconciliation) >= 0)
      )
    ) {
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
    return value.records.some((record) => isRecord(record) && typeof record.key === 'string' && isLearningStorageKey(record.key));
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
        const response = await this.fetcher(`${this.apiOrigin}/reset/status`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        const value: unknown = await response.json().catch(() => null);
        if (
          !response.ok ||
          !isRecord(value) ||
          !['idle', 'running', 'awaiting_release', 'released'].includes(String(value.status)) ||
          !isValidLearningResetEpoch(value.epoch) ||
          Object.keys(value).some((key) => !['status', 'epoch'].includes(key))
        ) {
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
          if (isLocalLearningResetPending() || hasLocalPendingResetMetadata() || storedEpoch !== epoch)
            await completeLocalLearningReset(epoch);
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
        if (this.started)
          this.resetPollTimer = this.scheduleTimeout(() => {
            this.resetPollTimer = undefined;
            void this.refreshResetStatus();
          }, nextDelay);
        this.resetPollFlight = undefined;
      }
    })();
    this.resetPollFlight = flight;
    return flight;
  }
}
