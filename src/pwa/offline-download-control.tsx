import { useState } from 'react';
import { Button } from '../shared/ui/button';
import { downloadEverythingForOffline, type OfflineDownloadProgress, type OfflineDownloadSummary } from './offline-download';

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    not_found: 'پیدا نشد (۴۰۴)',
    http_status: 'پاسخ ناموفق سرور',
    not_cors_readable: 'تصویر از مبدأ دیگر قابل خواندن نیست',
    not_an_image: 'پاسخ فایل تصویر نیست',
    too_large: 'تصویر از سقف مجاز بزرگ‌تر است',
    quota: 'فضای ذخیره‌سازی کافی نیست',
    cache_write_failed: 'ذخیره در مرورگر انجام نشد',
    network_error: 'خطای شبکه',
    service_worker_unavailable: 'سرویس‌ورکر در دسترس نیست',
    service_worker_error: 'سرویس‌ورکر نتوانست تصویر را ذخیره کند',
  };
  return labels[reason] ?? reason;
}

function summaryText(summary: OfflineDownloadSummary): string {
  const number = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
  const persistence =
    summary.persistenceGranted === null
      ? 'ذخیره‌سازی پایدار پشتیبانی نمی‌شود'
      : summary.persistenceGranted
        ? 'ذخیره‌سازی پایدار فعال شد'
        : 'ذخیره‌سازی پایدار فعال نشد';
  const shell = summary.shellReady ? 'پوستهٔ برنامه آماده است' : 'پوستهٔ برنامه کامل نشد';
  const quota = summary.quotaLimited ? ' به‌دلیل کمبود فضا، ذخیرهٔ تصویر متوقف شد.' : '';
  const refresh = summary.bankWarning ? ` ${summary.bankWarning}` : '';
  const counts = [
    `${number(summary.banksCached)} بانک`,
    `${number(summary.imagesOk)} تصویر ذخیره شد`,
    `${number(summary.failed.length)} مورد ناموفق.`,
  ].join('؛ ');
  return `${shell}؛ ${counts} ${persistence}.${quota}${refresh}`;
}

function progressText(progress: OfflineDownloadProgress): string {
  const stages = {
    shell: 'ذخیرهٔ فایل‌های برنامه',
    bank: 'بررسی بانک‌ها',
    images: 'ذخیرهٔ تصاویر',
  };
  const stage = stages[progress.phase];
  const number = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
  return `${stage}: ${number(progress.done)} از ${number(progress.total)}`;
}

export function OfflineDownloadControl({ label = 'دانلود همه برای آفلاین' }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null);
  const [summary, setSummary] = useState<OfflineDownloadSummary | null>(null);
  const [error, setError] = useState('');

  async function download() {
    if (busy) return;
    setBusy(true);
    setProgress(null);
    setSummary(null);
    setError('');
    try {
      setSummary(await downloadEverythingForOffline(setProgress));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ذخیره‌سازی آفلاین کامل نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="offline-download-control">
      <Button disabled={busy} onClick={() => void download()}>
        {busy ? 'در حال آماده‌سازی آفلاین…' : label}
      </Button>
      {busy && progress && (
        <div className="mt-2" role="status" aria-live="polite">
          <p>{progressText(progress)}</p>
          {progress.total > 0 && (
            <progress className="mt-1 block w-full" aria-label={progressText(progress)} max={progress.total} value={progress.done} />
          )}
        </div>
      )}
      {summary && (
        <div className="mt-2" role="status" aria-live="polite">
          <p>{summaryText(summary)}</p>
          {summary.failed.length > 0 && (
            <details className="mt-2">
              <summary>نمایش موارد ناموفق ({new Intl.NumberFormat('fa-IR').format(summary.failed.length)})</summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto ps-5">
                {summary.failed.map((item, index) => (
                  <li key={`${item.url}:${index}`}>
                    <bdi dir="ltr">{item.url}</bdi> — {reasonLabel(item.reason)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
