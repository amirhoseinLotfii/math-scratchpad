import type { SyncStatus } from '../runtime';
import {
  formatSyncTime,
  mirrorErrorLabel,
  mirrorStatusLabel,
  quarantinedEventsLabel,
  statusLabel,
  weeklyBackupLabel,
} from './sync-panel-labels';

export function SyncStatusCards({ status }: { status: SyncStatus }) {
  return <>
    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
      <div role="group" aria-label="وضعیت سرور" className="rounded-lg border border-white/15 p-3">
        <p className="text-sm font-semibold">سرور</p>
        <p className="mt-1 text-sm opacity-85" role="status" aria-live="polite">{statusLabel(status.phase)}</p>
        <p className="mt-1 text-xs opacity-75">{status.pending} رویداد در صف محلی</p>
      </div>
      <div role="group" aria-label="وضعیت Google Drive" className="rounded-lg border border-white/15 p-3">
        <p className="text-sm font-semibold">Google Drive</p>
        <p className="mt-1 text-sm opacity-85" role="status">{mirrorStatusLabel(status.driveMirror)}</p>
        <p className="mt-1 text-xs opacity-75">{status.driveMirror?.pendingCount ?? '—'} رویداد در صف</p>
        {quarantinedEventsLabel(status.driveMirror) && <p className="mt-1 text-xs opacity-75">{quarantinedEventsLabel(status.driveMirror)}</p>}
      </div>
      <div role="group" aria-label="وضعیت Notion" className="rounded-lg border border-white/15 p-3">
        <p className="text-sm font-semibold">Notion</p>
        <p className="mt-1 text-sm opacity-85" role="status">{mirrorStatusLabel(status.notionMirror)}</p>
        <p className="mt-1 text-xs opacity-75">{status.notionMirror?.pendingCount ?? '—'} رویداد در صف</p>
        {quarantinedEventsLabel(status.notionMirror) && <p className="mt-1 text-xs opacity-75">{quarantinedEventsLabel(status.notionMirror)}</p>}
      </div>
    </div>
    <p className="mt-2 text-xs opacity-75">تعدادهای Drive و Notion، رویدادهای در انتظار تأیید در مقصد هستند، نه تعداد سؤال‌ها. ریست جلسه به‌تنهایی صف‌های سرور را حذف نمی‌کند.</p>
    <details className="mt-3 rounded-lg border border-white/15 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">جزئیات آخرین همگام‌سازی و خطاها</summary>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt className="font-medium">سرور · آخرین ارسال</dt><dd className="mt-1 opacity-80">{formatSyncTime(status.lastSyncedAt)}</dd><dd className="mt-1 opacity-80">{status.lastError ?? 'بدون خطا'}</dd></div>
        <div><dt className="font-medium">Drive · آخرین ارسال</dt><dd className="mt-1 opacity-80">{formatSyncTime(status.driveMirror?.lastSyncedAt)}</dd><dd className="mt-1 opacity-80">{mirrorErrorLabel('drive', status.driveMirror?.lastError ?? null)}</dd><dt className="mt-3 font-medium">پشتیبان هفتگی Drive</dt><dd className="mt-1 opacity-80">{weeklyBackupLabel(status.driveMirror)}</dd><dd className="mt-1 opacity-80">{formatSyncTime(status.driveMirror?.weeklyBackup?.lastCreatedAt)}</dd><dd className="mt-1 opacity-80">{mirrorErrorLabel('drive', status.driveMirror?.weeklyBackup?.lastError ?? null)}</dd></div>
        <div><dt className="font-medium">Notion · آخرین ارسال</dt><dd className="mt-1 opacity-80">{formatSyncTime(status.notionMirror?.lastSyncedAt)}</dd><dd className="mt-1 opacity-80">{mirrorErrorLabel('notion', status.notionMirror?.lastError ?? null)}</dd></div>
      </dl>
    </details>
  </>;
}
