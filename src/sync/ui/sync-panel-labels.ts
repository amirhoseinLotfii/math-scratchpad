import type { MirrorSyncStatus } from '../runtime';

export const EMPTY_SYNC_STATUS = {
  phase: 'idle' as const,
  pending: 0,
  quarantined: 0,
  driveMirror: null,
  notionMirror: null,
};

export function statusLabel(phase: string): string {
  if (phase === 'syncing') return 'در حال ارسال';
  if (phase === 'synced') return 'همگام‌شده با سرور';
  if (phase === 'retrying') return 'اتصال برقرار نیست؛ تلاش دوباره زمان‌بندی شد';
  if (phase === 'needs-auth') return 'برای ارسال امن، به حساب گوگل وصل شو';
  if (phase === 'error') return 'همگام‌سازی متوقف شد';
  if (phase === 'queued') return 'در صف ارسال';
  return 'آمادهٔ همگام‌سازی';
}

export function mirrorStatusLabel(status: MirrorSyncStatus | null): string {
  if (!status) return 'پس از ورود بررسی می‌شود';
  if (status.status === 'not_configured') return 'راه‌اندازی نشده';
  if (status.status === 'pending') return 'در صف ارسال';
  if (status.status === 'syncing') return 'در حال ارسال';
  if (status.status === 'synced') return 'همگام‌شده';
  return 'ارسال ناموفق';
}

export function quarantinedEventsLabel(status: MirrorSyncStatus | null): string | null {
  if (typeof status?.quarantinedCount !== 'number') return null;
  return status.quarantinedCount > 0
    ? `${status.quarantinedCount} رویداد بدون برچسب قرنطینه شد و ارسال نشد.`
    : 'رویداد بدون برچسبی برای قرنطینه وجود ندارد.';
}

export function mirrorErrorLabel(kind: 'drive' | 'notion', error: string | null): string {
  if (!error) return 'بدون خطا';
  const errors: Record<string, string> = kind === 'drive' ? {
    not_configured: 'اتصال Drive در Worker تنظیم نشده است.',
    reauthorization_required: 'اعتبار OAuth گوگل پذیرفته نشد. ابتدا Client Secret و Refresh Token سمت Worker را بررسی و در صورت لزوم بازصادر کن.',
    account_mismatch: 'حساب Drive با حساب مجاز پروژه هم‌خوان نیست.',
    permission_denied: 'دسترسی Drive اجازهٔ نوشتن نمی‌دهد.',
    quota_exceeded: 'سهمیهٔ Drive پر شده است.',
    etag_conflict: 'نسخهٔ فایل تغییر کرده؛ ارسال دوباره لازم است.',
    invalid_response: 'پاسخ Drive قابل‌خواندن نبود.',
    duplicate_file: 'فایل همگام‌سازی تکراری پیدا شد.',
    network_error: 'اتصال به Drive برقرار نشد.',
  } : {
    token_invalid: 'کلید Integration در Cloudflare معتبر نیست.',
    database_not_shared: 'دیتابیس‌های لازم با Integration به‌اشتراک گذاشته نشده‌اند.',
    schema_mismatch: 'ساختار یکی از دیتابیس‌های Notion با داده سازگار نیست.',
    rate_limited: 'Notion درخواست‌ها را موقتاً محدود کرده است.',
    remote_error: 'Notion موقتاً پاسخ نمی‌دهد.',
    network_error: 'اتصال به Notion برقرار نشد.',
  };
  return errors[error] ?? (error.startsWith('سرور همگام‌سازی') ? error : 'خطای همگام‌سازی رخ داد.');
}

export function formatSyncTime(value: string | null | undefined): string {
  if (!value) return 'هنوز همگام نشده';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'زمان در دسترس نیست';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

export function weeklyBackupLabel(status: MirrorSyncStatus | null): string {
  const backup = status?.weeklyBackup;
  if (!backup) return status ? 'با پشتیبانی Worker هفتگی' : 'پس از ورود بررسی می‌شود';
  if (backup.status === 'not_configured') return 'پس از تنظیم Drive فعال می‌شود';
  if (backup.status === 'scheduled') return 'پشتیبان‌گیری هفتگی زمان‌بندی شده';
  if (backup.status === 'created') return 'آخرین پشتیبان هفتگی ساخته شد';
  return 'پشتیبان هفتگی نیاز به بررسی دارد';
}
