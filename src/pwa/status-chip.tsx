import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../shared/ui/dialog';
import { getDefaultSyncRuntime } from '../sync/runtime';
import {
  derivePwaStatus,
  getConnectivitySnapshot,
  getServerRenderedConnectivitySnapshot,
  requestServiceWorkerUpdateCheck,
  subscribeConnectivity,
} from './connectivity-store';

const explanations = {
  offline: 'اینترنت در دسترس نیست؛ پاسخ‌ها روی همین دستگاه ذخیره می‌شوند.',
  queued: 'پاسخ‌ها و تغییرات محلی در صف هستند و پس از اتصال دوباره ارسال می‌شوند.',
  syncing: 'داده‌های محلی در حال همگام‌سازی هستند.',
  synced: 'صف ارسال خالی است و آخرین همگام‌سازی سرور کامل شد.',
  needs_login: 'برای همگام‌سازی امن، ورود به حساب Google لازم است.',
  error: 'همگام‌سازی به خطا خورده یا بخشی از داده برای ارسال بیش از حد بزرگ است.',
  update_ready: 'نسخهٔ جدید آماده است؛ می‌توانی زمان بارگذاری دوباره را انتخاب کنی.',
  checking: 'وضعیت اینترنت و همگام‌سازی در حال بررسی است.',
} as const;

function formatBytes(value: number): string {
  if (value < 1024) return `${new Intl.NumberFormat('fa-IR').format(value)} بایت`;
  return `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value / 1_048_576)} مگابایت`;
}

export function StatusChip({ onOpenSyncPanel }: { onOpenSyncPanel?: () => void }) {
  const snapshot = useSyncExternalStore(subscribeConnectivity, getConnectivitySnapshot, getServerRenderedConnectivitySnapshot);
  const status = derivePwaStatus(snapshot);
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<{
    banks: number;
    bankSizeChars: number;
    persisted: boolean | null;
    usage: number | null;
    quota: number | null;
  }>({ banks: 0, bankSizeChars: 0, persisted: null, usage: null, quota: null });

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.all([
      import('./offline-bank-cache').then(({ listOfflineBanks }) => listOfflineBanks()),
      navigator.storage?.persisted?.().catch(() => null) ?? Promise.resolve(null),
      navigator.storage?.estimate?.().catch(() => null) ?? Promise.resolve(null),
    ])
      .then(([banks, persisted, estimate]) => {
        if (!active) return;
        setDetails({
          banks: banks.banks.length,
          bankSizeChars: banks.banks.reduce((sum, bank) => sum + bank.sizeChars, 0),
          persisted,
          usage: estimate?.usage ?? null,
          quota: estimate?.quota ?? null,
        });
      })
      .catch(() => {
        if (active) setDetails({ banks: 0, bankSizeChars: 0, persisted: null, usage: null, quota: null });
      });
    return () => {
      active = false;
    };
  }, [open]);

  const syncNow = () => {
    void getDefaultSyncRuntime()
      ?.syncAllNow()
      .catch(() => undefined);
  };
  const downloadEverything = () => window.dispatchEvent(new CustomEvent('math-scratchpad:download-everything'));
  const checkUpdate = () => void requestServiceWorkerUpdateCheck().catch(() => undefined);
  const explanation =
    snapshot.gate.reason === 'local_only' ? 'حالت محلی فعال است؛ پاسخ‌ها روی همین دستگاه ذخیره می‌شوند.' : explanations[status.state];
  const openSyncPanel = () => {
    setOpen(false);
    onOpenSyncPanel?.();
  };

  return (
    <>
      <button
        type="button"
        className={`pwa-status-chip pwa-status-chip-${status.state}`}
        aria-label={`وضعیت اتصال و آفلاین: ${status.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-live="polite"
        aria-atomic="true"
        onClick={() => setOpen(true)}
      >
        <span className="pwa-status-chip-dot" aria-hidden="true" />
        <span>{status.label}</span>
        {snapshot.shellReady && <span className="pwa-ready-indicator">آمادهٔ آفلاین</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="pwa-status-dialog" lang="fa" dir="rtl">
          <DialogTitle>وضعیت آفلاین و همگام‌سازی</DialogTitle>
          <DialogDescription>{explanation}</DialogDescription>
          <dl className="pwa-status-details">
            <div>
              <dt>در صف همگام‌سازی</dt>
              <dd>{new Intl.NumberFormat('fa-IR').format(status.queued)}</dd>
            </div>
            <div>
              <dt>بانک‌های ذخیره‌شده</dt>
              <dd>
                {new Intl.NumberFormat('fa-IR').format(details.banks)} · {new Intl.NumberFormat('fa-IR').format(details.bankSizeChars)}{' '}
                نویسه
              </dd>
            </div>
            <div>
              <dt>تصاویر ذخیره‌شده</dt>
              <dd>
                {new Intl.NumberFormat('fa-IR').format(snapshot.imageCount)} · {formatBytes(snapshot.imageBytes)}
              </dd>
            </div>
            <div>
              <dt>ذخیره‌سازی پایدار</dt>
              <dd>{details.persisted === null ? 'بررسی نشده' : details.persisted ? 'فعال' : 'فعال نیست'}</dd>
            </div>
            <div>
              <dt>فضای مرورگر</dt>
              <dd>{details.usage === null ? 'نامشخص' : `${formatBytes(details.usage)} / ${formatBytes(details.quota ?? 0)}`}</dd>
            </div>
            <div>
              <dt>نسخهٔ برنامه</dt>
              <dd dir="ltr">
                <code>{snapshot.sha || '—'}</code>
              </dd>
            </div>
            {snapshot.sync.quarantined > 0 && (
              <div>
                <dt>رویدادهای قرنطینه‌شده</dt>
                <dd>{new Intl.NumberFormat('fa-IR').format(snapshot.sync.quarantined)}</dd>
              </div>
            )}
          </dl>
          {snapshot.sync.lastSyncedAt && (
            <p className="pwa-status-last-sync">آخرین همگام‌سازی: {new Date(snapshot.sync.lastSyncedAt).toLocaleString('fa-IR')}</p>
          )}
          {snapshot.oversizedCount > 0 && <p role="alert">این جلسه برای همگام‌سازی ابری خیلی بزرگ است؛ روی همین دستگاه ذخیره شده است.</p>}
          {snapshot.sync.lastError && status.state === 'error' && <p role="alert">{snapshot.sync.lastError}</p>}
          <div className="pwa-status-actions">
            {(status.state === 'needs_login' || status.state === 'error') && onOpenSyncPanel && (
              <Button onClick={openSyncPanel}>{status.state === 'needs_login' ? 'ورود به همگام‌سازی' : 'باز کردن تنظیم همگام‌سازی'}</Button>
            )}
            <Button onClick={syncNow}>همگام‌سازی الان</Button>
            <Button onClick={downloadEverything}>دانلود همه برای آفلاین</Button>
            <Button onClick={checkUpdate}>بررسی نسخهٔ جدید</Button>
            <Button onClick={() => setOpen(false)}>بستن</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
