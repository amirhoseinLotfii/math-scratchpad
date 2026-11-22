import type { RefObject } from 'react';
import type { LegacyMigration } from '../browser-db';
import type { LearningBackupPreview } from '../learning-backup';
import type { SyncStatus } from '../runtime';

type SyncBackupSectionsProps = {
  busy: boolean;
  status: SyncStatus;
  migration: LegacyMigration | null;
  backupFileRef: RefObject<HTMLInputElement | null>;
  importPreview: LearningBackupPreview | null;
  reloadAfterImport: boolean;
  onSyncLegacy: () => void;
  onBackUpAndClear: () => void;
  onClearAfterVerifiedBackup: () => void;
  onDownloadFullBackup: () => void;
  onSelectBackupFile: (file: File | undefined) => void;
  onRestoreFullBackup: () => void;
};

export function SyncBackupSections({
  busy,
  status,
  migration,
  backupFileRef,
  importPreview,
  reloadAfterImport,
  onSyncLegacy,
  onBackUpAndClear,
  onClearAfterVerifiedBackup,
  onDownloadFullBackup,
  onSelectBackupFile,
  onRestoreFullBackup,
}: SyncBackupSectionsProps) {
  return <>
    {migration && migration.status !== 'complete' && <div className="mt-4 rounded-lg border border-white/15 p-3">
      <h3 className="font-medium">انتقال امن اطلاعات قدیمی</h3>
      <p className="mt-1 text-sm opacity-80">
        {migration.entries.length} کلید دادهٔ قدیمی در IndexedDB نسخهٔ پشتیبان دارد؛ تا تأیید سرور و Drive پاک نمی‌شود.
        {migration.status === 'server-verified' ? ' نسخهٔ سرور تأیید شده است.' : ''}
        {migration.status === 'drive-backed-up' ? ' پشتیبان Drive تأیید شده است.' : ''}
      </p>
      {migration.status === 'pending' && <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy || status.phase === 'needs-auth' || status.phase === 'syncing'} onClick={onSyncLegacy}>
        ارسال و راستی‌آزمایی داده‌های قدیمی
      </button>}
      {migration.status === 'server-verified' && <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onBackUpAndClear}>
        پشتیبان‌گیری در Drive و پایان مهاجرت
      </button>}
      {migration.status === 'drive-backed-up' && <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onClearAfterVerifiedBackup}>
        پاک‌کردن ایمن کلیدهای قدیمی
      </button>}
    </div>}
    <div className="mt-4 rounded-lg border border-white/15 p-3" role="group" aria-label="پشتیبان کامل داده‌های یادگیری">
      <h3 className="font-medium">پشتیبان کامل و بازیابی</h3>
      <p className="mt-1 text-sm opacity-80">خروجی شامل پیشرفت مرورگر، صف آفلاین، رویدادهای سرور و فراداده است. بازیابی ابتدا اعتبار و پیش‌نمایش را نشان می‌دهد؛ دادهٔ محلیِ متعارض حفظ می‌شود.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onDownloadFullBackup}>دانلود پشتیبان کامل JSON</button>
        <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => backupFileRef.current?.click()}>انتخاب فایل پشتیبان</button>
        <input ref={backupFileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="انتخاب فایل پشتیبان JSON" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; onSelectBackupFile(file); }} />
      </div>
      {importPreview && <div className="mt-3 rounded-md bg-black/10 p-3 text-sm" aria-live="polite">
        <p>در فایل: {importPreview.incoming.cache} دادهٔ مرورگر، {importPreview.incoming.outbox} رویداد صف، {importPreview.incoming.serverEvents} رویداد سرور و {importPreview.incoming.meta} فراداده.</p>
        <p className="mt-1">برای افزودن: {importPreview.additions.cache + importPreview.additions.outbox + importPreview.additions.serverEvents + importPreview.additions.meta}؛ از قبل موجود: {importPreview.alreadyPresent.cache + importPreview.alreadyPresent.outbox + importPreview.alreadyPresent.serverEvents + importPreview.alreadyPresent.meta}؛ تعارض محلیِ حفظ‌شده: {importPreview.preservedConflicts.cache + importPreview.preservedConflicts.meta}.</p>
        {importPreview.blockingConflicts.length > 0 && <ul className="mt-2 list-disc ps-5">{importPreview.blockingConflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul>}
        <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy || !importPreview.canImport || reloadAfterImport} onClick={onRestoreFullBackup}>ادغام امن پشتیبان</button>
      </div>}
      {reloadAfterImport && <button type="button" className="mt-3 rounded-lg border border-emerald-300/50 px-3 py-2 text-sm" onClick={() => window.location.reload()}>بارگذاری دوبارهٔ برنامه</button>}
    </div>
  </>;
}
