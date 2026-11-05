import { useEffect, useState } from 'react';
import type { BrowserSyncRuntime, ResetPreview } from '../../../sync/runtime';
import { Button } from '../../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';

/** An impact inspection only. Real cloud deletion is deliberately unavailable. */
export function CloudResetPreviewDialog({ open, onOpenChange, runtime }: {
  open: boolean; onOpenChange: (open: boolean) => void; runtime?: BrowserSyncRuntime;
}) {
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setError('');
    setLoading(true);
    if (!runtime) {
      setError('اتصال همگام‌سازی آماده نیست؛ هیچ داده‌ای حذف نشده است.');
      setLoading(false);
      return;
    }
    void runtime.previewAllReset().then(value => {
      if (!cancelled) setPreview(value);
    }).catch(problem => {
      if (!cancelled) setError(problem instanceof Error ? problem.message : 'دریافت پیش‌نمایش ممکن نشد.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, runtime]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent aria-describedby="cloud-reset-preview-description" lang="fa" dir="rtl">
      <DialogTitle>پیش‌نمایش بازنشانی داده‌های یادگیری</DialogTitle>
      <DialogDescription id="cloud-reset-preview-description">
        این بررسی صرفاً داده‌های احتمالیِ قابل‌حذف را می‌شمارد. هنوز دستور حذف ابری فعال نیست.
        بانک اصلی سؤالات و منابع آموزشی باید محفوظ بمانند.
      </DialogDescription>
      {loading && <p role="status">در حال دریافت وضعیت سرور…</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <section aria-label="Cloud reset impact" role="status">
        <p>رویدادهای یادگیری: <strong>{preview.matchingEvents.toLocaleString('fa-IR')}</strong> از {preview.totalEvents.toLocaleString('fa-IR')}</p>
        <p>آخرین شماره رویداد: <strong>{preview.lastSeq.toLocaleString('fa-IR')}</strong></p>
        <p>رکوردهای مشترک نیازمند پاک‌سازی گزینشی: <strong>{preview.sharedStateKeysRequiringSelectiveMerge.toLocaleString('fa-IR')}</strong></p>
        <p>کلیدهای محافظت‌شدهٔ بانک سؤال و هویت: <strong>{preview.protectedBankAndIdentityStateKeys.toLocaleString('fa-IR')}</strong></p>
        {preview.notionPageReferencesRequiringReconciliation !== null &&
          <p>ارجاع‌های Notion نیازمند هماهنگ‌سازی: <strong>{preview.notionPageReferencesRequiringReconciliation.toLocaleString('fa-IR')}</strong></p>}
        <p>حذف نهایی نیازمند هماهنگی Local، Server، Drive و Notion است؛ در این صفحه هیچ دکمهٔ حذف وجود ندارد.</p>
      </section>}
      <div className="dialog-actions"><Button onClick={() => onOpenChange(false)}>بستن</Button></div>
    </DialogContent>
  </Dialog>;
}
