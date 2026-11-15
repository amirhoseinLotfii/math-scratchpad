import type { SyncPanelFeedback } from './use-sync-panel-runtime';
import { downloadFullLearningBackup } from './learning-backup-download';
import { useCallback, useRef, useState } from 'react';
import {
  importFullLearningBackup,
  parseFullLearningBackup,
  previewFullLearningBackup,
  type FullLearningBackup,
  type LearningBackupPreview,
} from './learning-backup';

export function useLearningBackupActions({ setBusy, setError, setMessage }: SyncPanelFeedback) {
  const backupFile = useRef<HTMLInputElement>(null);
  const [importBackup, setImportBackup] = useState<FullLearningBackup | null>(null);
  const [importPreview, setImportPreview] = useState<LearningBackupPreview | null>(null);
  const [reloadAfterImport, setReloadAfterImport] = useState(false);
  const downloadFullBackup = useCallback(async (source: 'auto' | 'local' = 'auto') => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await downloadFullLearningBackup(source);
      setMessage('پشتیبان کامل JSON دانلود شد. فایل را در جای امن نگه دار.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ساخت پشتیبان کامل انجام نشد.');
    } finally {
      setBusy(false);
    }
  }, []);

  const selectBackupFile = useCallback(async (file: File | undefined) => {
    setError('');
    setMessage('');
    setImportBackup(null);
    setImportPreview(null);
    setReloadAfterImport(false);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseFullLearningBackup(await file.text());
      const preview = await previewFullLearningBackup(parsed);
      setImportBackup(parsed);
      setImportPreview(preview);
      const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(parsed.createdAt));
      setMessage(`پشتیبان ${date} بررسی شد؛ پیش‌نمایش را بازبینی کن.`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'پشتیبان معتبر نیست و وارد نشد.');
    } finally {
      setBusy(false);
    }
  }, []);

  const restoreFullBackup = useCallback(async () => {
    if (!importBackup || !importPreview?.canImport) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await importFullLearningBackup(importBackup);
      setImportPreview(result);
      setReloadAfterImport(true);
      const count = Object.values(result.additions).reduce((total, added) => total + added, 0);
      setMessage(
        `${count} رکورد افزوده شد؛ داده‌های دارای تعارض محلی حفظ شدند. ` + 'برای بارگیری پیشرفت واردشده، برنامه را دوباره باز کن.',
      );
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ادغام پشتیبان انجام نشد؛ داده‌های فعلی دست‌نخورده ماندند.');
    } finally {
      setBusy(false);
    }
  }, [importBackup, importPreview]);

  return { backupFile, importPreview, reloadAfterImport, downloadFullBackup, selectBackupFile, restoreFullBackup };
}

export function LearningBackupPanel({
  busy,
  backupFile,
  importPreview,
  reloadAfterImport,
  downloadFullBackup,
  selectBackupFile,
  restoreFullBackup,
}: ReturnType<typeof useLearningBackupActions> & { busy: boolean }) {
  return (
    <div className="mt-4 rounded-lg border border-white/15 p-3" role="group" aria-label="پشتیبان کامل داده‌های یادگیری">
      <h3 className="font-medium">پشتیبان کامل و بازیابی</h3>
      <p className="mt-1 text-sm opacity-80">
        خروجی شامل پیشرفت مرورگر، صف آفلاین، رویدادهای سرور و فراداده است. بازیابی ابتدا اعتبار و پیش‌نمایش را نشان می‌دهد؛ دادهٔ محلیِ
        متعارض حفظ می‌شود.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => void downloadFullBackup()}
        >
          دانلود پشتیبان کامل JSON
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => backupFile.current?.click()}
        >
          انتخاب فایل پشتیبان
        </button>
        <input
          ref={backupFile}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="انتخاب فایل پشتیبان JSON"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void selectBackupFile(file);
          }}
        />
      </div>
      {importPreview && (
        <div className="mt-3 rounded-md bg-black/10 p-3 text-sm" aria-live="polite">
          <p>
            در فایل: {importPreview.incoming.cache} دادهٔ مرورگر، {importPreview.incoming.outbox} رویداد صف،{' '}
            {importPreview.incoming.serverEvents} رویداد سرور و {importPreview.incoming.meta} فراداده.
          </p>
          <p className="mt-1">
            برای افزودن:{' '}
            {importPreview.additions.cache +
              importPreview.additions.outbox +
              importPreview.additions.serverEvents +
              importPreview.additions.meta}
            ؛ از قبل موجود:{' '}
            {importPreview.alreadyPresent.cache +
              importPreview.alreadyPresent.outbox +
              importPreview.alreadyPresent.serverEvents +
              importPreview.alreadyPresent.meta}
            ؛ تعارض محلیِ حفظ‌شده: {importPreview.preservedConflicts.cache + importPreview.preservedConflicts.meta}.
          </p>
          {importPreview.blockingConflicts.length > 0 && (
            <ul className="mt-2 list-disc ps-5">
              {importPreview.blockingConflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy || !importPreview.canImport || reloadAfterImport}
            onClick={() => void restoreFullBackup()}
          >
            ادغام امن پشتیبان
          </button>
        </div>
      )}
      {reloadAfterImport && (
        <button
          type="button"
          className="mt-3 rounded-lg border border-emerald-300/50 px-3 py-2 text-sm"
          onClick={() => window.location.reload()}
        >
          بارگذاری دوبارهٔ برنامه
        </button>
      )}
    </div>
  );
}
