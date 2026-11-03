import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { getConfig, loadPicker, pickBackupFolder, requestToken } from '../features/drive-bank/google';
import { createVerifiedDriveBackup } from './drive-backup';
import { mountGoogleIdButton } from './google-id-token';
import { permittedAccount } from '../features/drive-bank/identity';
import { backupAndFinishLegacyMigration, finishLegacyMigration, queueLegacyMigration, verifyLegacyMigrationOnServer } from './legacy-migration';
import { getDefaultSyncRuntime } from './runtime';
import { readLegacyMigration, type LegacyMigration } from './browser-db';

const EMPTY_SYNC_STATUS = { phase: 'idle' as const, pending: 0 };

function statusLabel(phase: string): string {
  if (phase === 'syncing') return 'در حال ارسال';
  if (phase === 'synced') return 'همگام‌شده با سرور';
  if (phase === 'retrying') return 'اتصال برقرار نیست؛ تلاش دوباره زمان‌بندی شد';
  if (phase === 'needs-auth') return 'برای ارسال امن، به حساب گوگل وصل شو';
  if (phase === 'error') return 'همگام‌سازی متوقف شد';
  if (phase === 'queued') return 'در صف ارسال';
  return 'آمادهٔ همگام‌سازی';
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
  const [migration, setMigration] = useState<LegacyMigration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
    try { await runtime.syncNow(); }
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
      // The migration helper re-reads the latest IndexedDB state after the picker
      // and holds the cross-tab lock through upload, read-back and cleanup.
      const result = await backupAndFinishLegacyMigration(migration.id, (current, contents) =>
        createVerifiedDriveBackup(token, folder, current, contents));
      setMigration(result.migration);
      if (result.reused && result.migration.status === 'complete') {
        setMessage(`مهاجرت در تب دیگر قبلاً تکمیل شده بود؛ پشتیبان ${result.file.name} در پوشهٔ «${folder.name}» تأیید شد.`);
      } else {
        const backupStatus = result.reused ? 'قبلاً ساخته و راستی‌آزمایی شده بود' : 'ساخته و خواندن دوباره‌اش تأیید شد';
        setMessage(`پشتیبان ${result.file.name} در پوشهٔ «${folder.name}» ${backupStatus}؛ ${result.cleared.length} کلید قدیمی پاک شد.`);
      }
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

  const needsMigrationBackup = migration && migration.status !== 'complete';
  return <section aria-labelledby="sync-panel-title" lang="fa" className="mx-auto mt-4 w-full max-w-3xl rounded-xl border border-white/15 bg-white/5 p-4 text-start" dir="rtl">
    <div className="flex items-center justify-between gap-3"><h2 id="sync-panel-title" className="text-base font-semibold">همگام‌سازی و حفظ داده‌ها</h2>{onClose && <button type="button" aria-label="بستن تنظیم همگام‌سازی" onClick={onClose} className="rounded-md p-2"><X aria-hidden="true" /></button>}</div>
    <p className="mt-1 text-sm opacity-80" role="status" aria-live="polite">
      {statusLabel(status.phase)}{status.pending ? ` · ${status.pending} رویداد در صف` : ''}
    </p>
    {status.lastError && <p className="mt-1 text-sm text-amber-300">{status.lastError}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div ref={googleButton} aria-label="ورود امن به حساب Google" />
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
    {message && <p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
  </section>;
}
