import type { MirrorSyncStatus, SyncStatus } from './runtime';

function statusLabel(phase: string): string {
  if (phase === 'syncing') return 'در حال ارسال';
  if (phase === 'synced') return 'همگام‌شده با سرور';
  if (phase === 'retrying') return 'اتصال برقرار نیست؛ تلاش دوباره زمان‌بندی شد';
  if (phase === 'needs-auth') return 'برای ارسال امن، به حساب گوگل وصل شو';
  if (phase === 'error') return 'همگام‌سازی متوقف شد';
  if (phase === 'queued') return 'در صف ارسال';
  return 'آمادهٔ همگام‌سازی';
}

function mirrorStatusLabel(status: MirrorSyncStatus | null): string {
  if (!status) return 'پس از ورود بررسی می‌شود';
  if (status.status === 'not_configured') return 'راه‌اندازی نشده';
  if (status.status === 'pending') return 'در صف ارسال';
  if (status.status === 'syncing') return 'در حال ارسال';
  if (status.status === 'synced') return 'همگام‌شده';
  return 'ارسال ناموفق';
}

function quarantinedEventsLabel(status: MirrorSyncStatus | null): string | null {
  if (typeof status?.quarantinedCount !== 'number') return null;
  return status.quarantinedCount > 0
    ? `${status.quarantinedCount} رویداد بدون برچسب قرنطینه شد و ارسال نشد.`
    : 'رویداد بدون برچسبی برای قرنطینه وجود ندارد.';
}

function mirrorErrorLabel(kind: 'drive' | 'notion', error: string | null): string {
  if (!error) return 'بدون خطا';
  const errors: Record<string, string> =
    kind === 'drive'
      ? {
          not_configured: 'اتصال Drive در Worker تنظیم نشده است.',
          reauthorization_required:
            'اعتبار OAuth گوگل پذیرفته نشد. ابتدا Client Secret و Refresh Token سمت Worker را بررسی و در صورت لزوم بازصادر کن.',
          account_mismatch: 'حساب Drive با حساب مجاز پروژه هم‌خوان نیست.',
          permission_denied: 'دسترسی Drive اجازهٔ نوشتن نمی‌دهد.',
          quota_exceeded: 'سهمیهٔ Drive پر شده است.',
          etag_conflict: 'نسخهٔ فایل تغییر کرده؛ ارسال دوباره لازم است.',
          invalid_response: 'پاسخ Drive قابل‌خواندن نبود.',
          duplicate_file: 'فایل همگام‌سازی تکراری پیدا شد.',
          network_error: 'اتصال به Drive برقرار نشد.',
        }
      : {
          token_invalid: 'کلید Integration در Cloudflare معتبر نیست.',
          database_not_shared: 'دیتابیس‌های لازم با Integration به‌اشتراک گذاشته نشده‌اند.',
          schema_mismatch: 'ساختار یکی از دیتابیس‌های Notion با داده سازگار نیست.',
          rate_limited: 'Notion درخواست‌ها را موقتاً محدود کرده است.',
          remote_error: 'Notion موقتاً پاسخ نمی‌دهد.',
          network_error: 'اتصال به Notion برقرار نشد.',
        };
  return errors[error] ?? (error.startsWith('سرور همگام‌سازی') ? error : 'خطای همگام‌سازی رخ داد.');
}

function formatSyncTime(value: string | null | undefined): string {
  if (!value) return 'هنوز همگام نشده';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'زمان در دسترس نیست';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function weeklyBackupLabel(status: MirrorSyncStatus | null): string {
  const backup = status?.weeklyBackup;
  if (!backup) return status ? 'با پشتیبانی Worker هفتگی' : 'پس از ورود بررسی می‌شود';
  if (backup.status === 'not_configured') return 'پس از تنظیم Drive فعال می‌شود';
  if (backup.status === 'scheduled') return 'پشتیبان‌گیری هفتگی زمان‌بندی شده';
  if (backup.status === 'created') return 'آخرین پشتیبان هفتگی ساخته شد';
  return 'پشتیبان هفتگی نیاز به بررسی دارد';
}

export function SyncStatusDetails({ status }: { status: SyncStatus }) {
  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div role="group" aria-label="وضعیت سرور" className="rounded-lg border border-white/15 p-3">
          <p className="text-sm font-semibold">سرور</p>
          <p className="mt-1 text-sm opacity-85" role="status" aria-live="polite">
            {statusLabel(status.phase)}
          </p>
          <p className="mt-1 text-xs opacity-75">{status.pending} رویداد در صف محلی</p>
        </div>
        <div role="group" aria-label="وضعیت Google Drive" className="rounded-lg border border-white/15 p-3">
          <p className="text-sm font-semibold">Google Drive</p>
          <p className="mt-1 text-sm opacity-85" role="status">
            {mirrorStatusLabel(status.driveMirror)}
          </p>
          <p className="mt-1 text-xs opacity-75">{status.driveMirror?.pendingCount ?? '—'} رویداد در صف</p>
          {quarantinedEventsLabel(status.driveMirror) && (
            <p className="mt-1 text-xs opacity-75">{quarantinedEventsLabel(status.driveMirror)}</p>
          )}
        </div>
        <div role="group" aria-label="وضعیت Notion" className="rounded-lg border border-white/15 p-3">
          <p className="text-sm font-semibold">Notion</p>
          <p className="mt-1 text-sm opacity-85" role="status">
            {mirrorStatusLabel(status.notionMirror)}
          </p>
          <p className="mt-1 text-xs opacity-75">{status.notionMirror?.pendingCount ?? '—'} رویداد در صف</p>
          {quarantinedEventsLabel(status.notionMirror) && (
            <p className="mt-1 text-xs opacity-75">{quarantinedEventsLabel(status.notionMirror)}</p>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs opacity-75">
        تعدادهای Drive و Notion، رویدادهای در انتظار تأیید در مقصد هستند، نه تعداد سؤال‌ها. ریست جلسه به‌تنهایی صف‌های سرور را حذف نمی‌کند.
      </p>
      <details className="mt-3 rounded-lg border border-white/15 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">جزئیات آخرین همگام‌سازی و خطاها</summary>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium">سرور · آخرین ارسال</dt>
            <dd className="mt-1 opacity-80">{formatSyncTime(status.lastSyncedAt)}</dd>
            <dd className="mt-1 opacity-80">{status.lastError ?? 'بدون خطا'}</dd>
          </div>
          <div>
            <dt className="font-medium">Drive · آخرین ارسال</dt>
            <dd className="mt-1 opacity-80">{formatSyncTime(status.driveMirror?.lastSyncedAt)}</dd>
            <dd className="mt-1 opacity-80">{mirrorErrorLabel('drive', status.driveMirror?.lastError ?? null)}</dd>
            <dt className="mt-3 font-medium">پشتیبان هفتگی Drive</dt>
            <dd className="mt-1 opacity-80">{weeklyBackupLabel(status.driveMirror)}</dd>
            <dd className="mt-1 opacity-80">{formatSyncTime(status.driveMirror?.weeklyBackup?.lastCreatedAt)}</dd>
            <dd className="mt-1 opacity-80">{mirrorErrorLabel('drive', status.driveMirror?.weeklyBackup?.lastError ?? null)}</dd>
          </div>
          <div>
            <dt className="font-medium">Notion · آخرین ارسال</dt>
            <dd className="mt-1 opacity-80">{formatSyncTime(status.notionMirror?.lastSyncedAt)}</dd>
            <dd className="mt-1 opacity-80">{mirrorErrorLabel('notion', status.notionMirror?.lastError ?? null)}</dd>
          </div>
        </dl>
      </details>
    </>
  );
}
