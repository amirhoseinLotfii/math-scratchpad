import type { LegacyMigration } from './browser-db';
import type { SyncStatus } from './runtime';

export function LegacyMigrationStatus({
  migration,
  busy,
  phase,
  syncLegacy,
  backUpAndClear,
  clearAfterVerifiedBackup,
}: {
  migration: LegacyMigration | null;
  busy: boolean;
  phase: SyncStatus['phase'];
  syncLegacy: () => Promise<void>;
  backUpAndClear: () => Promise<void>;
  clearAfterVerifiedBackup: () => Promise<void>;
}) {
  if (!migration || migration.status === 'complete') return null;
  return (
    <div className="mt-4 rounded-lg border border-white/15 p-3">
      <h3 className="font-medium">انتقال امن اطلاعات قدیمی</h3>
      <p className="mt-1 text-sm opacity-80">
        {migration.entries.length} کلید دادهٔ قدیمی در IndexedDB نسخهٔ پشتیبان دارد؛ تا تأیید سرور و Drive پاک نمی‌شود.
        {migration.status === 'server-verified' ? ' نسخهٔ سرور تأیید شده است.' : ''}
        {migration.status === 'drive-backed-up' ? ' پشتیبان Drive تأیید شده است.' : ''}
      </p>
      {migration.status === 'pending' && (
        <button
          type="button"
          className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy || phase === 'needs-auth' || phase === 'syncing'}
          onClick={() => void syncLegacy()}
        >
          ارسال و راستی‌آزمایی داده‌های قدیمی
        </button>
      )}
      {migration.status === 'server-verified' && (
        <button
          type="button"
          className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => void backUpAndClear()}
        >
          پشتیبان‌گیری در Drive و پایان مهاجرت
        </button>
      )}
      {migration.status === 'drive-backed-up' && (
        <button
          type="button"
          className="mt-3 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => void clearAfterVerifiedBackup()}
        >
          پاک‌کردن ایمن کلیدهای قدیمی
        </button>
      )}
    </div>
  );
}
