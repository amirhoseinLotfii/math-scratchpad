import type { SyncPanelFeedback } from './use-sync-panel-runtime';
import type { BrowserSyncRuntime } from './runtime';
import { useCallback, useEffect, useState } from 'react';
import { getConfig, loadPicker, pickBackupFolder } from '../features/drive-bank/google';
import { createVerifiedDriveBackup } from './drive-backup';
import { requestDriveAccessTokenFromGesture } from './google-auth';
import {
  backupAndFinishLegacyMigration,
  finishLegacyMigration,
  queueLegacyMigration,
  verifyLegacyMigrationOnServer,
} from './legacy-migration';
import { readLegacyMigration, type LegacyMigration } from './browser-db';

function awaitDriveToken(): Promise<string> {
  // This is called directly from the backup button handler; keep the OAuth request in that gesture.
  return requestDriveAccessTokenFromGesture().then((token) => token.accessToken);
}

function awaitFolderSelection(config: ReturnType<typeof getConfig>, token: string): Promise<{ id: string; name: string }> {
  return new Promise((resolve, reject) => {
    pickBackupFolder(config, token, (result) => {
      if (result.id && result.name) resolve({ id: result.id, name: result.name });
      else reject(new Error(result.error ?? 'A backup folder was not selected.'));
    });
  });
}

export function useLegacyMigrationActions(runtime: BrowserSyncRuntime | undefined, { setBusy, setError, setMessage }: SyncPanelFeedback) {
  const [migration, setMigration] = useState<LegacyMigration | null>(null);
  useEffect(() => {
    let active = true;
    void readLegacyMigration()
      .then((value) => {
        if (active) setMigration(value);
      })
      .catch(() => {
        if (active) setError('وضعیت مهاجرت اطلاعات قدیمی خوانده نشد.');
      });
    return () => {
      active = false;
    };
  }, []);

  const syncLegacy = useCallback(async () => {
    if (!runtime) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const pendingMigration = await queueLegacyMigration();
      if (!pendingMigration) {
        setMessage('دادهٔ قدیمی برای انتقال پیدا نشد.');
        return;
      }
      if (
        pendingMigration.status === 'server-verified' ||
        pendingMigration.status === 'drive-backed-up' ||
        pendingMigration.status === 'complete'
      ) {
        setMigration(pendingMigration);
        setMessage('نسخهٔ سرور قبلاً راستی‌آزمایی شده است.');
        return;
      }
      await runtime.syncNow();
      const verified = await verifyLegacyMigrationOnServer();
      setMigration(verified);
      setMessage('تعداد بخش‌ها و هش هر داده با نسخهٔ سرور تطبیق داده شد. حالا پشتیبان Drive را بساز.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'انتقال امن دادهٔ قدیمی کامل نشد.');
    } finally {
      setBusy(false);
    }
  }, [runtime]);

  const backUpAndClear = useCallback(async () => {
    if (!migration || migration.status !== 'server-verified') return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const config = getConfig();
      const token = await awaitDriveToken();
      await loadPicker();
      const folder = await awaitFolderSelection(config, token);
      const result = await backupAndFinishLegacyMigration(migration.id, (current, contents) =>
        createVerifiedDriveBackup(token, folder, current, contents),
      );
      setMigration(result.migration);
      const backupStatus = result.reused ? 'قبلاً ساخته و راستی‌آزمایی شده بود' : 'ساخته و خواندن دوباره‌اش تأیید شد';
      setMessage(`پشتیبان ${result.file.name} در پوشهٔ «${folder.name}» ${backupStatus}؛ ${result.cleared.length} کلید قدیمی پاک شد.`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'پشتیبان‌گیری ناموفق بود؛ داده‌های قدیمی حفظ شدند.');
    } finally {
      setBusy(false);
    }
  }, [migration]);

  const clearAfterVerifiedBackup = useCallback(async () => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await finishLegacyMigration();
      setMigration(result.migration);
      setMessage(`${result.cleared.length} کلید قدیمی پس از تأیید سرور و پشتیبان Drive پاک شد.`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'کلیدهای قدیمی حفظ شدند.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { migration, syncLegacy, backUpAndClear, clearAfterVerifiedBackup };
}
