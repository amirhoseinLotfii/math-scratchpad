import { useState, useSyncExternalStore } from 'react';
import { SYNC_STATE_BUDGET_BYTES } from '../../shared/contracts/limits';
import { getAuthenticatedServerStorage } from './browser-db';
import { SERVER_STORAGE_BUDGET_EVENT, type OversizedState, type ServerBackedStorage } from './server-storage';

const EMPTY_STATUS: ReadonlyMap<string, OversizedState> = new Map();
const persian = new Intl.NumberFormat('fa-IR');
const getEmptyStatus = () => EMPTY_STATUS;

export function subscribeServerStorageBudget(listener: () => void) {
  globalThis.addEventListener(SERVER_STORAGE_BUDGET_EVENT, listener);
  return () => globalThis.removeEventListener(SERVER_STORAGE_BUDGET_EVENT, listener);
}

export function StateBudgetMeter({ bytes }: { bytes: number }) {
  if (bytes < SYNC_STATE_BUDGET_BYTES * 0.8) return null;
  const percent = persian.format(Math.floor(bytes * 100 / SYNC_STATE_BUDGET_BYTES));
  return <p role="status" className="small" dir="rtl" lang="fa">حجم جلسه: {percent}٪ ظرفیت همگام‌سازی</p>;
}

export function useHasOversizedState(): boolean {
  return useSyncExternalStore(
    subscribeServerStorageBudget, () => !!getAuthenticatedServerStorage()?.getOversizedState().size, () => false,
  );
}

export function OversizedStateWarning({ storage, onBackup }: {
  storage?: ServerBackedStorage;
  onBackup?: () => void;
}) {
  const status = useSyncExternalStore(
    subscribeServerStorageBudget,
    () => (storage ?? getAuthenticatedServerStorage())?.getOversizedState() ?? EMPTY_STATUS,
    getEmptyStatus,
  );
  const [backupResult, setBackupResult] = useState('');
  const [busy, setBusy] = useState(false);
  if (!status.size) return null;
  const bytes = Math.max(...Array.from(status.values(), item => item.bytes));

  async function download() {
    if (onBackup) {
      onBackup();
      return;
    }
    setBusy(true);
    try {
      const { downloadFullLearningBackup } = await import('./learning-backup-download');
      await downloadFullLearningBackup('local');
      setBackupResult('پشتیبان کامل JSON دانلود شد.');
    } catch (error) {
      setBackupResult(error instanceof Error ? error.message : 'ساخت پشتیبان کامل انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="server-connection-gate-message" dir="rtl" lang="fa">
    <p role="status">
      این جلسه برای همگام‌سازی ابری خیلی بزرگ است ({persian.format(Math.ceil(bytes / 1_000))} از ۹۵۰ کیلوبایت).
      روی این دستگاه ذخیره است. برای همگام‌سازی، یک جلسهٔ تازه شروع کن یا پشتیبان بگیر.
    </p>
    <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm"
      disabled={busy} onClick={() => void download()}>دانلود پشتیبان کامل JSON</button>
    {backupResult && <p role="status">{backupResult}</p>}
  </div>;
}
