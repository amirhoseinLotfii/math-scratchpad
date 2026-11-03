import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { getConfig, loadPicker, pickBackupFolder, requestToken } from '../features/drive-bank/google';
import { createVerifiedDriveBackup } from './drive-backup';
import { mountGoogleIdButton } from './google-id-token';
import { permittedAccount } from '../features/drive-bank/identity';
import { finishLegacyMigration, legacyMigrationBackupContents, markLegacyMigrationDriveVerified, queueLegacyMigration, verifyLegacyMigrationOnServer } from './legacy-migration';
import { getDefaultSyncRuntime, type MirrorSyncStatus } from './runtime';
import { readLegacyMigration, type LegacyMigration } from './browser-db';
import { createFullLearningBackup, importFullLearningBackup, parseFullLearningBackup, previewFullLearningBackup, type FullLearningBackup, type LearningBackupPreview } from './learning-backup';

const EMPTY_SYNC_STATUS = { phase: 'idle' as const, pending: 0, driveMirror: null, notionMirror: null };

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
  const errors: Record<string, string> = kind === 'drive' ? {
    not_configured: 'اتصال Drive در Worker تنظیم نشده است.',
    reauthorization_required: 'اتصال Google Drive نیاز به ورود دوباره دارد.',
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

function formatSyncTime(value: string | null | undefined): string {
  if (!value) return 'هنوز همگام نشده';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'زمان در دسترس نیست';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran', dateStyle: 'medium', timeStyle: 'short',
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

async function awaitDriveToken(): Promise<string> {
  const token = await new Promise<string>((resolve, reject) => requestToken(getConfig().clientId, { prompt: 'consent' }, result => {
    if (result.token) resolve(result.token.accessToken);
    else reject(new Error(result.error ?? 'Google Drive authorization failed.'));
  }));
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  const profile: unknown = response.ok ? await response.json() : null;
  if (!await permittedAccount(profile)) throw new Error('حساب Google Drive با حساب مجاز پروژه تطبیق ندارد؛ هیچ پشتیبانی بارگذاری نشد.');
  return token;
}

function awaitFolderSelection(config: ReturnType<typeof getConfig>, token: string): Promise<{ id: string; name: string }> {
  return new Promise((resolve, reject) => {
    pickBackupFolder(config, token, result => {
      if (result.id && result.name) resolve({ id: result.id, name: result.name });
      else reject(new Error(result.error ?? 'A backup folder was not selected.'));
    });
  });
}

export function SyncPanel({ onClose }: { onClose?: () => void }) {
  const runtime = getDefaultSyncRuntime();
  const status = useSyncExternalStore(runtime?.subscribe ?? (() => () => undefined), runtime?.getSnapshot ?? (() => EMPTY_SYNC_STATUS), () => EMPTY_SYNC_STATUS);
  const googleButton = useRef<HTMLDivElement>(null);
  const backupFile = useRef<HTMLInputElement>(null);
  const [migration, setMigration] = useState<LegacyMigration | null>(null);
  const [importBackup, setImportBackup] = useState<FullLearningBackup | null>(null);
  const [importPreview, setImportPreview] = useState<LearningBackupPreview | null>(null);
  const [reloadAfterImport, setReloadAfterImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!runtime) return;
    const stopObserving = runtime.observeMirrorStatuses();
    const timer = window.setInterval(() => { void runtime.refreshMirrorStatuses(); }, 30_000);
    return () => { window.clearInterval(timer); stopObserving(); };
  }, [runtime]);

  useEffect(() => {
    let active = true;
    void readLegacyMigration().then(value => { if (active) setMigration(value); }).catch(() => { if (active) setError('وضعیت مهاجرت اطلاعات قدیمی خوانده نشد.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const element = googleButton.current;
    if (!element) return;
    let active = true;
    void mountGoogleIdButton(element, token => runtime?.setIdToken(token)).catch(problem => {
      if (active) setError(problem instanceof Error ? problem.message : 'ورود گوگل بارگیری نشد.');
    });
    return () => { active = false; element.replaceChildren(); };
  }, [runtime]);

  const syncNow = useCallback(async () => {
    if (!runtime) { setError('سرویس صف آفلاین هنوز آماده نشده است.'); return; }
    setError(''); setMessage(''); setBusy(true);
    try { await runtime.syncAllNow(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'همگام‌سازی انجام نشد.'); }
    finally { setBusy(false); }
  }, [runtime]);

  const syncLegacy = useCallback(async () => {
    if (!runtime) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const pendingMigration = await queueLegacyMigration();
      if (!pendingMigration) { setMessage('دادهٔ قدیمی برای انتقال پیدا نشد.'); return; }
      if (pendingMigration.status === 'server-verified' || pendingMigration.status === 'drive-backed-up' || pendingMigration.status === 'complete') {
        setMigration(pendingMigration); setMessage('نسخهٔ سرور قبلاً راستی‌آزمایی شده است.'); return;
      }
      await runtime.syncNow();
      const verified = await verifyLegacyMigrationOnServer();
      setMigration(verified);
      setMessage('تعداد بخش‌ها و هش هر داده با نسخهٔ سرور تطبیق داده شد. حالا پشتیبان Drive را بساز.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'انتقال امن دادهٔ قدیمی کامل نشد.'); }
    finally { setBusy(false); }
  }, [runtime]);

  const backUpAndClear = useCallback(async () => {
    if (!migration || migration.status !== 'server-verified') return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const config = getConfig();
      const token = await awaitDriveToken();
      await loadPicker();
      const folder = await awaitFolderSelection(config, token);
      const contents = legacyMigrationBackupContents(migration);
      const file = await createVerifiedDriveBackup(token, folder, migration, contents);
      const backedUp = await markLegacyMigrationDriveVerified(migration, file);
      setMigration(backedUp);
      const result = await finishLegacyMigration();
      setMigration(result.migration);
      setMessage(`پشتیبان ${file.name} در پوشهٔ «${folder.name}» ساخته و خواندن دوباره‌اش تأیید شد؛ ${result.cleared.length} کلید قدیمی پاک شد.`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'پشتیبان‌گیری ناموفق بود؛ داده‌های قدیمی حفظ شدند.'); }
    finally { setBusy(false); }
  }, [migration]);

  const clearAfterVerifiedBackup = useCallback(async () => {
    setError(''); setMessage(''); setBusy(true);
    try {
      const result = await finishLegacyMigration();
      setMigration(result.migration);
      setMessage(`${result.cleared.length} کلید قدیمی پس از تأیید سرور و پشتیبان Drive پاک شد.`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'کلیدهای قدیمی حفظ شدند.'); }
    finally { setBusy(false); }
  }, []);

  const downloadFullBackup = useCallback(async () => {
    setError(''); setMessage(''); setBusy(true);
    try {
      const contents = await createFullLearningBackup();
      const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `math-scratchpad-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage('پشتیبان کامل JSON دانلود شد. فایل را در جای امن نگه دار.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'ساخت پشتیبان کامل انجام نشد.'); }
    finally { setBusy(false); }
  }, []);

  const selectBackupFile = useCallback(async (file: File | undefined) => {
    setError(''); setMessage(''); setImportBackup(null); setImportPreview(null); setReloadAfterImport(false);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseFullLearningBackup(await file.text());
      const preview = await previewFullLearningBackup(parsed);
      setImportBackup(parsed); setImportPreview(preview);
      setMessage(`پشتیبان ${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(parsed.createdAt))} بررسی شد؛ پیش‌نمایش را بازبینی کن.`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'پشتیبان معتبر نیست و وارد نشد.'); }
    finally { setBusy(false); }
  }, []);

  const restoreFullBackup = useCallback(async () => {
    if (!importBackup || !importPreview?.canImport) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const result = await importFullLearningBackup(importBackup);
      setImportPreview(result); setReloadAfterImport(true);
      setMessage(`${result.additions.cache + result.additions.outbox + result.additions.serverEvents + result.additions.meta} رکورد افزوده شد؛ داده‌های دارای تعارض محلی حفظ شدند. برای بارگیری پیشرفت واردشده، برنامه را دوباره باز کن.`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'ادغام پشتیبان انجام نشد؛ داده‌های فعلی دست‌نخورده ماندند.'); }
    finally { setBusy(false); }
  }, [importBackup, importPreview]);

  const needsMigrationBackup = migration && migration.status !== 'complete';
  return <section aria-labelledby="sync-panel-title" lang="fa" className="mx-auto mt-4 w-full max-w-3xl rounded-xl border border-white/15 bg-white/5 p-4 text-start" dir="rtl">
    <div className="flex items-center justify-between gap-3"><h2 id="sync-panel-title" className="text-base font-semibold">همگام‌سازی و حفظ داده‌ها</h2>{onClose && <button type="button" aria-label="بستن تنظیم همگام‌سازی" onClick={onClose} className="rounded-md p-2"><X aria-hidden="true" /></button>}</div>
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
    <details className="mt-3 rounded-lg border border-white/15 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">جزئیات آخرین همگام‌سازی و خطاها</summary>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt className="font-medium">سرور · آخرین ارسال</dt><dd className="mt-1 opacity-80">{formatSyncTime(status.lastSyncedAt)}</dd><dd className="mt-1 opacity-80">{status.lastError ?? 'بدون خطا'}</dd></div>
        <div><dt className="font-medium">Drive · آخرین ارسال</dt><dd className="mt-1 opacity-80">{formatSyncTime(status.driveMirror?.lastSyncedAt)}</dd><dd className="mt-1 opacity-80">{mirrorErrorLabel('drive', status.driveMirror?.lastError ?? null)}</dd><dt className="mt-3 font-medium">پشتیبان هفتگی Drive</dt><dd className="mt-1 opacity-80">{weeklyBackupLabel(status.driveMirror)}</dd><dd className="mt-1 opacity-80">{formatSyncTime(status.driveMirror?.weeklyBackup?.lastCreatedAt)}</dd><dd className="mt-1 opacity-80">{mirrorErrorLabel('drive', status.driveMirror?.weeklyBackup?.lastError ?? null)}</dd></div>
        <div><dt className="font-medium">Notion · آخرین ارسال</dt><dd className="mt-1 opacity-80">{formatSyncTime(status.notionMirror?.lastSyncedAt)}</dd><dd className="mt-1 opacity-80">{mirrorErrorLabel('notion', status.notionMirror?.lastError ?? null)}</dd></div>
      </dl>
    </details>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div ref={googleButton} role="group" aria-label="ورود امن به حساب Google" />
      <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy || status.phase === 'syncing'} onClick={() => void syncNow()}>
        همگام‌سازی الان
      </button>
    </div>
    {migration && migration.status !== 'complete' && <div className="mt-4 rounded-lg border border-white/15 p-3">
      <h3 className="font-medium">انتقال امن اطلاعات قدیمی</h3>
      <p className="mt-1 text-sm opacity-80">
        {migration.entries.length} کلید دادهٔ قدیمی در IndexedDB نسخهٔ پشتیبان دارد؛ تا تأیید سرور و Drive پاک نمی‌شود.
        {migration.status === 'server-verified' ? ' نسخهٔ سرور تأیید شده است.' : ''}
        {migration.status === 'drive-backed-up' ? ' پشتیبان Drive تأیید شده است.' : ''}
      </p>
      {migration.status === 'pending' && <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy || status.phase === 'needs-auth' || status.phase === 'syncing'} onClick={() => void syncLegacy()}>
        ارسال و راستی‌آزمایی داده‌های قدیمی
      </button>}
      {migration.status === 'server-verified' && <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => void backUpAndClear()}>
        پشتیبان‌گیری در Drive و پایان مهاجرت
      </button>}
      {migration.status === 'drive-backed-up' && <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => void clearAfterVerifiedBackup()}>
        پاک‌کردن ایمن کلیدهای قدیمی
      </button>}
    </div>}
    <div className="mt-4 rounded-lg border border-white/15 p-3" role="group" aria-label="پشتیبان کامل داده‌های یادگیری">
      <h3 className="font-medium">پشتیبان کامل و بازیابی</h3>
      <p className="mt-1 text-sm opacity-80">خروجی شامل پیشرفت مرورگر، صف آفلاین، رویدادهای سرور و فراداده است. بازیابی ابتدا اعتبار و پیش‌نمایش را نشان می‌دهد؛ دادهٔ محلیِ متعارض حفظ می‌شود.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => void downloadFullBackup()}>دانلود پشتیبان کامل JSON</button>
        <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => backupFile.current?.click()}>انتخاب فایل پشتیبان</button>
        <input ref={backupFile} type="file" accept="application/json,.json" className="sr-only" aria-label="انتخاب فایل پشتیبان JSON" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void selectBackupFile(file); }} />
      </div>
      {importPreview && <div className="mt-3 rounded-md bg-black/10 p-3 text-sm" aria-live="polite">
        <p>در فایل: {importPreview.incoming.cache} دادهٔ مرورگر، {importPreview.incoming.outbox} رویداد صف، {importPreview.incoming.serverEvents} رویداد سرور و {importPreview.incoming.meta} فراداده.</p>
        <p className="mt-1">برای افزودن: {importPreview.additions.cache + importPreview.additions.outbox + importPreview.additions.serverEvents + importPreview.additions.meta}؛ از قبل موجود: {importPreview.alreadyPresent.cache + importPreview.alreadyPresent.outbox + importPreview.alreadyPresent.serverEvents + importPreview.alreadyPresent.meta}؛ تعارض محلیِ حفظ‌شده: {importPreview.preservedConflicts.cache + importPreview.preservedConflicts.meta}.</p>
        {importPreview.blockingConflicts.length > 0 && <ul className="mt-2 list-disc ps-5">{importPreview.blockingConflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul>}
        <button type="button" className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={busy || !importPreview.canImport || reloadAfterImport} onClick={() => void restoreFullBackup()}>ادغام امن پشتیبان</button>
      </div>}
      {reloadAfterImport && <button type="button" className="mt-3 rounded-lg border border-emerald-300/50 px-3 py-2 text-sm" onClick={() => window.location.reload()}>بارگذاری دوبارهٔ برنامه</button>}
    </div>
    {message && <p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
  </section>;
}
