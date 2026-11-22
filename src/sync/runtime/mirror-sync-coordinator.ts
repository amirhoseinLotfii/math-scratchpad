import { flushLearningStorage, getAuthenticatedServerStorage } from '../browser-db';
import type { SyncHttpClient } from './sync-http-client';
import {
  isMirrorSyncStatus,
  SyncRequestError,
  type MirrorSyncStatus,
  type SyncStatus,
} from './sync-runtime-types';

export type MirrorCoordinatorContext = {
  isStarted: () => boolean;
  getToken: () => string | null;
  clearToken: () => void;
  getStatus: () => SyncStatus;
  updateStatus: (next: Partial<SyncStatus>) => void;
  http: SyncHttpClient;
};

export class MirrorSyncCoordinator {
  private mirrorStatusObservers = 0;

  constructor(private readonly ctx: MirrorCoordinatorContext) {}

  hasObservers(): boolean {
    return this.mirrorStatusObservers > 0;
  }

  observe(): () => void {
    this.mirrorStatusObservers += 1;
    void this.refreshAll();
    return () => { this.mirrorStatusObservers = Math.max(0, this.mirrorStatusObservers - 1); };
  }

  /** Refresh the separately reported server-side Drive and Notion mirror states. */
  async refreshAll(): Promise<void> {
    if (!this.ctx.isStarted() || !this.ctx.getToken()) return;
    await Promise.all([this.refreshOne('drive'), this.refreshOne('notion')]);
  }

  private async refreshOne(kind: 'drive' | 'notion'): Promise<void> {
    const path = kind === 'drive' ? '/drive/status' : '/notion/status';
    try {
      const response = await this.ctx.http.request(path, { method: 'GET' });
      const value: unknown = await response.json();
      if (!isMirrorSyncStatus(value)) throw new SyncRequestError('پاسخ وضعیت همگام‌سازی معتبر نبود.');
      this.ctx.updateStatus(kind === 'drive' ? { driveMirror: value } : { notionMirror: value });
    } catch (error) {
      if (error instanceof SyncRequestError && error.status === 401) {
        this.ctx.clearToken();
        this.ctx.updateStatus({ phase: 'needs-auth', lastError: 'ورود گوگل منقضی شده است؛ دوباره متصل شو.' });
      }
      const unavailable: MirrorSyncStatus = {
        status: 'error',
        pendingCount: 0,
        lastSyncedAt: null,
        lastError: error instanceof Error ? error.message : 'وضعیت همگام‌سازی دریافت نشد.',
      };
      this.ctx.updateStatus(kind === 'drive' ? { driveMirror: unavailable } : { notionMirror: unavailable });
    }
  }

  /** Push/pull local events, then ask each configured private mirror to sync now. */
  async syncAllNow(syncNow: () => Promise<void>): Promise<void> {
    await syncNow();
    if (!this.ctx.isStarted() || !this.ctx.getToken()) return;
    await this.refreshAll();

    const current = this.ctx.getStatus();
    const configured = [
      { path: '/drive/sync', status: current.driveMirror },
      { path: '/notion/sync', status: current.notionMirror },
    ].filter(item => item.status?.status !== 'not_configured');
    const results = await Promise.allSettled(configured.map(item => this.ctx.http.request(item.path, { method: 'POST' })));
    await this.refreshAll();
    const latest = this.ctx.getStatus();
    const failed = results.flatMap((result, index) => {
      if (result.status !== 'rejected') return [];
      const mirror = configured[index];
      const name = mirror.path.startsWith('/drive/') ? 'Drive' : 'Notion';
      const currentStatus = name === 'Drive' ? latest.driveMirror : latest.notionMirror;
      return [`${name}: ${currentStatus?.lastError || (result.reason instanceof Error ? result.reason.message : 'ارسال ناموفق بود')}`];
    });
    for (const [kind, state] of [['Drive', latest.driveMirror], ['Notion', latest.notionMirror]] as const) {
      if (state && state.status !== 'not_configured' && (state.status !== 'synced' || state.pendingCount > 0)) {
        failed.push(`${kind}: ${state.lastError || `در انتظار تأیید ${state.pendingCount} رویداد`}`);
      }
    }
    if (failed.length) throw new Error([...new Set(failed)].join(' · '));
  }

  /** Wait until both configured mirrors acknowledge all queued state and events. */
  async syncAllUntilComplete(syncNow: () => Promise<void>, timeoutMs = 120_000): Promise<void> {
    if (!this.ctx.isStarted()) throw new Error('همگام‌سازی هنوز راه‌اندازی نشده است.');
    if (!this.ctx.getToken()) throw new Error('برای حفظ امن اطلاعات فصل، اتصال Google لازم است.');
    const deadline = Date.now() + Math.max(1_000, timeoutMs);
    let lastError = '';
    let retryDelayMs = 500;
    await flushLearningStorage();
    await getAuthenticatedServerStorage()?.flush();

    while (Date.now() < deadline) {
      try {
        await this.syncAllNow(syncNow);
        await this.refreshAll();
        const { driveMirror, notionMirror, pending } = this.ctx.getStatus();
        const configured = [driveMirror, notionMirror].filter(
          (mirror): mirror is NonNullable<typeof mirror> => !!mirror && mirror.status !== 'not_configured',
        );
        if (configured.length === 0) {
          throw new Error('برای تغییر فصل، دست‌کم یکی از مقصدهای Google Drive یا Notion باید پیکربندی شده باشد.');
        }
        if (pending === 0 && configured.every(mirror => mirror.status === 'synced' && mirror.pendingCount === 0)) return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'تأیید مقصدهای همگام‌سازی ناموفق بود.';
        if (!this.ctx.getToken()) throw new Error(lastError);
        if (lastError.includes('دست‌کم یکی از مقصد')) throw error;
        const latest = this.ctx.getStatus();
        const permanentError = [latest.driveMirror?.lastError, latest.notionMirror?.lastError]
          .find(code => code === 'token_invalid' || code === 'database_not_shared' || code === 'schema_mismatch');
        if (permanentError) throw new Error(`پیکربندی همگام‌سازی نیاز به اصلاح دارد: ${permanentError}`);
        retryDelayMs = Math.min(5_000, retryDelayMs * 2);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    throw new Error(`ذخیرهٔ فصل در مقصدهای همگام‌سازی تا پایان زمان انتظار تأیید نشد${lastError ? `: ${lastError}` : '.'}`);
  }
}
