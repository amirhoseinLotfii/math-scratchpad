import type { LearnEvent } from '../events';
import type { SyncPage, SyncStatus, MirrorSyncStatus } from '../runtime-types';
import { flushLearningStorage, getAuthenticatedServerStorage } from '../browser-db';
import { isRecord, SyncRequestError } from '../event-sender/request';

const PAGE_LIMIT = 100;

function isMirrorSyncStatus(value: unknown): value is MirrorSyncStatus {
  if (!isRecord(value)) return false;
  const base =
    (value.status === 'not_configured' ||
      value.status === 'pending' ||
      value.status === 'syncing' ||
      value.status === 'synced' ||
      value.status === 'error') &&
    typeof value.pendingCount === 'number' &&
    Number.isFinite(value.pendingCount) &&
    value.pendingCount >= 0 &&
    (value.quarantinedCount === undefined ||
      value.quarantinedCount === null ||
      (typeof value.quarantinedCount === 'number' && Number.isFinite(value.quarantinedCount) && value.quarantinedCount >= 0)) &&
    (value.lastSyncedAt === null || typeof value.lastSyncedAt === 'string') &&
    (value.lastError === null || typeof value.lastError === 'string');
  if (!base || value.weeklyBackup === undefined) return base;
  const backup = value.weeklyBackup;
  return (
    isRecord(backup) &&
    (backup.status === 'not_configured' || backup.status === 'scheduled' || backup.status === 'created' || backup.status === 'error') &&
    (backup.lastCreatedAt === null || typeof backup.lastCreatedAt === 'string') &&
    (backup.lastError === null || typeof backup.lastError === 'string')
  );
}

export abstract class RuntimeMirrors {
  protected abstract started: boolean;
  protected abstract token: string | null;
  protected abstract current: SyncStatus;
  protected abstract request(path: string, init: RequestInit, token?: string, allowNotFound?: boolean): Promise<Response>;
  protected abstract update(next: Partial<SyncStatus>): void;
  abstract syncNow(): Promise<void>;
  protected mirrorStatusObservers = 0;
  observeMirrorStatuses(): () => void {
    this.mirrorStatusObservers += 1;
    void this.refreshMirrorStatuses();
    return () => {
      this.mirrorStatusObservers = Math.max(0, this.mirrorStatusObservers - 1);
    };
  }

  /** Refresh the separately reported server-side Drive and Notion mirror states. */
  async refreshMirrorStatuses(): Promise<void> {
    if (!this.started || !this.token || navigator.onLine === false) return;
    await Promise.all([this.refreshMirrorStatus('drive'), this.refreshMirrorStatus('notion')]);
  }

  /** Push/pull local events, then ask each configured private mirror to sync now. */
  async syncAllNow(): Promise<void> {
    await getAuthenticatedServerStorage()?.flush();
    await this.syncNow();
    if (!this.started || !this.token) return;
    await this.refreshMirrorStatuses();

    const configured = [
      { path: '/drive/sync', status: this.current.driveMirror },
      { path: '/notion/sync', status: this.current.notionMirror },
    ].filter((item) => item.status?.status !== 'not_configured');
    const results = await Promise.allSettled(configured.map((item) => this.request(item.path, { method: 'POST' })));
    await this.refreshMirrorStatuses();
    const failed = results.flatMap((result, index) => {
      if (result.status !== 'rejected') return [];
      const mirror = configured[index];
      const name = mirror.path.startsWith('/drive/') ? 'Drive' : 'Notion';
      const currentStatus = name === 'Drive' ? this.current.driveMirror : this.current.notionMirror;
      return [`${name}: ${currentStatus?.lastError || (result.reason instanceof Error ? result.reason.message : 'ارسال ناموفق بود')}`];
    });
    for (const [kind, state] of [
      ['Drive', this.current.driveMirror],
      ['Notion', this.current.notionMirror],
    ] as const) {
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
        if (pending === 0 && configured.every((mirror) => mirror.status === 'synced' && mirror.pendingCount === 0)) return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'تأیید مقصدهای همگام‌سازی ناموفق بود.';
        if (!this.token) throw new Error(lastError);
        if (lastError.includes('دست‌کم یکی از مقصد')) throw error;
        const permanentError = [this.current.driveMirror?.lastError, this.current.notionMirror?.lastError].find(
          (code) => code === 'token_invalid' || code === 'database_not_shared' || code === 'schema_mismatch',
        );
        if (permanentError) throw new Error(`پیکربندی همگام‌سازی نیاز به اصلاح دارد: ${permanentError}`);
        retryDelayMs = Math.min(5_000, retryDelayMs * 2);
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
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
}
