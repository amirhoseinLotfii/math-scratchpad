import { reportApiUnauthorized } from '../api-unauthorized';
import {
  completeLocalLearningReset,
  isLearningStorageKey,
  reconcileServerLearningResetEpoch,
} from '../browser-db';
import type { LearnEvent } from '../events';
import {
  fetchWithServerWriteGuard,
  getStoredServerLearningResetEpoch,
  isValidLearningResetEpoch,
  LEARNING_RESET_EPOCH,
  LEARNING_RESET_EPOCH_HEADER,
  markLocalLearningResetPending,
  ServerWriteBlockedError,
  setLocalPendingResetEpoch,
} from '../learning-reset-epoch';
import {
  isRecord,
  PAGE_LIMIT,
  SyncRequestError,
  type ResetPreview,
  type SyncPage,
} from './sync-runtime-types';

export type SyncHttpContext = {
  apiOrigin: string;
  fetcher: typeof fetch;
  getToken: () => string | null;
  canWriteToServer: () => boolean;
  getEpoch: () => string;
  setEpoch: (epoch: string) => void;
  refreshCount: () => Promise<number>;
};

export class SyncHttpClient {
  constructor(private readonly ctx: SyncHttpContext) {}

  async request(path: string, init: RequestInit, tokenOverride?: string, allowNotFound = false): Promise<Response> {
    const token = tokenOverride ?? this.ctx.getToken();
    if (!token) throw new SyncRequestError('Google sign-in is required.', 401, false);
    const method = (init.method ?? 'GET').toUpperCase();
    const isServerWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isServerWrite && !this.ctx.canWriteToServer()) {
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
          ...(isLearningWrite ? { [LEARNING_RESET_EPOCH_HEADER]: this.ctx.getEpoch() } : {}),
        },
      };
      response = isServerWrite
        ? await fetchWithServerWriteGuard(this.ctx.fetcher, `${this.ctx.apiOrigin}${path}`, requestInit)
        : await this.ctx.fetcher(`${this.ctx.apiOrigin}${path}`, requestInit);
    } catch (error) {
      if (error instanceof ServerWriteBlockedError || (isServerWrite && !this.ctx.canWriteToServer())) {
        throw new SyncRequestError('ارسال تا تأیید پایان پاک‌سازی متوقف است؛ هیچ داده‌ای فرستاده نشد.', 409, false);
      }
      throw new SyncRequestError('شبکه در دسترس نیست؛ داده‌ها در صف آفلاین می‌مانند.');
    }
    if (response.status === 401) {
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
        this.ctx.setEpoch(epoch);
        await this.ctx.refreshCount();
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

    this.ctx.setEpoch(epoch);
    const reset = await reconcileServerLearningResetEpoch(epoch);
    if (reset) {
      this.ctx.setEpoch(epoch);
      await this.ctx.refreshCount();
    }
    return true;
  }

  /** Server backup always reads the canonical log; browser IndexedDB is not used. */
  async readAllServerEvents(): Promise<Array<{ seq: number; event: LearnEvent }>> {
    if (!this.ctx.getToken()) throw new Error('برای گرفتن پشتیبان سرور، ابتدا با Google وارد شو.');
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
}
