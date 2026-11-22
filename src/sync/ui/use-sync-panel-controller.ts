import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getConfig, loadPicker } from '../../auth/google';
import { queueLearnEvent, readLegacyMigration, type LegacyMigration } from '../browser-db';
import { createVerifiedDriveBackup } from '../drive-backup';
import { emitTestLearnEvent } from '../events';
import { requestDriveAccessTokenFromGesture, signOutGoogle } from '../google-auth';
import {
  createFullLearningBackup,
  importFullLearningBackup,
  parseFullLearningBackup,
  previewFullLearningBackup,
  type FullLearningBackup,
  type LearningBackupPreview,
} from '../learning-backup';
import {
  backupAndFinishLegacyMigration,
  finishLegacyMigration,
  queueLegacyMigration,
  verifyLegacyMigrationOnServer,
} from '../legacy-migration';
import { getDefaultSyncRuntime } from '../runtime';
import { subscribeApiToken } from '../worker-session';
import { pickBackupFolder } from './backup-folder-picker';
import { EMPTY_SYNC_STATUS } from './sync-panel-labels';

function awaitDriveToken(): Promise<string> {
  // This is called directly from the backup button handler; keep the OAuth request in that gesture.
  return requestDriveAccessTokenFromGesture().then(token => token.accessToken);
}

function awaitFolderSelection(config: ReturnType<typeof getConfig>, token: string): Promise<{ id: string; name: string }> {
  return new Promise((resolve, reject) => {
    pickBackupFolder(config, token, result => {
      if (result.id && result.name) resolve({ id: result.id, name: result.name });
      else reject(new Error(result.error ?? 'A backup folder was not selected.'));
    });
  });
}

export function useSyncPanelController() {
  const runtime = getDefaultSyncRuntime();
  const status = useSyncExternalStore(runtime?.subscribe ?? (() => () => undefined), runtime?.getSnapshot ?? (() => EMPTY_SYNC_STATUS), () => EMPTY_SYNC_STATUS);
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
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void subscribeApiToken(token => runtime?.setIdToken(token)).then(removeListener => {
      if (!active) removeListener();
      else unsubscribe = removeListener;
    }).catch(problem => {
      if (active) setError(problem instanceof Error ? problem.message : 'ورود گوگل بارگیری نشد.');
    });
    return () => { active = false; unsubscribe?.(); };
  }, [runtime]);

  const signOut = useCallback(async () => {
    setError(''); setMessage(''); setBusy(true);
    try {
      await signOutGoogle();
      runtime?.setIdToken(null);
      setMessage('از حساب خارج شدی؛ نشست سرور این دستگاه باطل شد. داده‌های این دستگاه محفوظ‌اند.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'خروج انجام نشد.'); }
    finally { setBusy(false); }
  }, [runtime]);

  const syncNow = useCallback(async () => {
    if (!runtime) { setError('سرویس صف آفلاین هنوز آماده نشده است.'); return; }
    setError(''); setMessage(''); setBusy(true);
    try { await runtime.syncAllNow(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'همگام‌سازی انجام نشد.'); }
    finally { setBusy(false); }
  }, [runtime]);

  const refreshMirrorHealth = useCallback(async () => {
    if (!runtime) { setError('موتور همگام‌سازی آماده نیست.'); return; }
    setError(''); setMessage(''); setBusy(true);
    try {
      await runtime.refreshMirrorStatuses();
      setMessage('وضعیت Drive و Notion دوباره از سرور دریافت شد. جزئیات خطاها را در بخش بالا ببین.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'خواندن وضعیت سرویس‌ها ناموفق بود.');
    } finally { setBusy(false); }
  }, [runtime]);

  const sendSafeIntegrationTest = useCallback(async () => {
    if (!runtime || status.phase !== 'synced'
      || status.driveMirror?.status !== 'synced' || status.notionMirror?.status !== 'synced'
      || status.driveMirror.pendingCount > 0 || status.notionMirror.pendingCount > 0) {
      setError('برای ساخت رویداد آزمایشی، ابتدا ورود گوگل و همگام‌سازی هر دو آینه باید آماده و بدون صف باشد.');
      return;
    }
    setError(''); setMessage(''); setBusy(true);
    try {
      const session = `sync-test-${crypto.randomUUID()}`;
      const event = emitTestLearnEvent({
        bankVersion: 'sync-test-v1',
        session,
        chapter: 0,
        lesson: 'sync-verification',
        section: 'sync-verification',
        concept: 'sync-verification',
      }, {
        type: 'check_answer',
        itemId: 'sync-verification',
        itemType: 'typed',
        questionText: 'Math Scratchpad integration verification (test only)',
        userAnswer: 'SYNC_TEST_ONLY',
        verdict: 'submitted',
        verdictSource: 'none',
        note: 'Synthetic owner-approved integration check; not a learner result.',
      });
      await queueLearnEvent(event);
      await runtime.syncAllNow();
      const latest = runtime.getSnapshot();
      if (latest.driveMirror?.status === 'synced' && latest.notionMirror?.status === 'synced'
        && latest.driveMirror.pendingCount === 0 && latest.notionMirror.pendingCount === 0) {
        setMessage(`رویداد آزمایشی ${event.id} با isTest=true ارسال شد؛ در Notion باید Data Mode = Test باشد. این رویداد در پیشرفت واقعی محاسبه نمی‌شود.`);
      } else {
        setMessage(`رویداد آزمایشی ${event.id} با isTest=true در صف قرار گرفت؛ آینه‌ها هنوز کامل نشده‌اند. از وضعیت بالا پیگیری کن و فعلاً رویداد دیگری نساز.`);
      }
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'ساخت یا ارسال رویداد آزمایشی ناموفق بود.'); }
    finally { setBusy(false); }
  }, [runtime, status]);

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
      const result = await backupAndFinishLegacyMigration(migration.id, (current, contents) =>
        createVerifiedDriveBackup(token, folder, current, contents));
      setMigration(result.migration);
      const backupStatus = result.reused ? 'قبلاً ساخته و راستی‌آزمایی شده بود' : 'ساخته و خواندن دوباره‌اش تأیید شد';
      setMessage(`پشتیبان ${result.file.name} در پوشهٔ «${folder.name}» ${backupStatus}؛ ${result.cleared.length} کلید قدیمی پاک شد.`);
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

  return {
    status,
    migration,
    importPreview,
    reloadAfterImport,
    busy,
    error,
    message,
    signOut,
    syncNow,
    refreshMirrorHealth,
    sendSafeIntegrationTest,
    syncLegacy,
    backUpAndClear,
    clearAfterVerifiedBackup,
    downloadFullBackup,
    selectBackupFile,
    restoreFullBackup,
  };
}
