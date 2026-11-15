import { InstallApp } from '../pwa/install-app';
import { SyncStatusDetails } from './sync-status-details';
import { LegacyMigrationStatus } from './legacy-migration-status';
import { OversizedStateWarning } from './state-sync-budget-ui';
import { useState } from 'react';
import { X } from 'lucide-react';
import { GoogleLoginButton } from './google-login-button';
import { getDefaultSyncRuntime } from './runtime';

import { LearningBackupPanel, useLearningBackupActions } from './learning-backup-panel';
import { useLegacyMigrationActions } from './use-legacy-migration-actions';
import { useSyncPanelRuntime } from './use-sync-panel-runtime';
import { useSyncPanelModal } from './use-sync-panel-modal';
export function SyncPanel({ onClose }: { onClose?: () => void }) {
  const runtime = getDefaultSyncRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const feedback = { setBusy, setError, setMessage };
  const { status, signOut, syncNow, refreshMirrorHealth, sendSafeIntegrationTest } = useSyncPanelRuntime(feedback);
  const { migration, syncLegacy, backUpAndClear, clearAfterVerifiedBackup } = useLegacyMigrationActions(runtime, feedback);
  const backup = useLearningBackupActions(feedback);
  const { downloadFullBackup } = backup;
  const { modal, closeRef, isClosable } = useSyncPanelModal(onClose);
  return (
    <>
      {isClosable && <div className="sync-panel-backdrop" aria-hidden="true" onClick={() => closeRef.current?.()} />}
      <section
        ref={modal}
        role={isClosable ? 'dialog' : 'region'}
        aria-modal={isClosable ? true : undefined}
        tabIndex={-1}
        aria-labelledby="sync-panel-title"
        lang="fa"
        className="sync-panel-floating mx-auto mt-4 w-full max-w-3xl rounded-xl border border-white/15 bg-white/5 p-4 text-start"
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="sync-panel-title" className="text-base font-semibold">
            همگام‌سازی و حفظ داده‌ها
          </h2>
          {onClose && (
            <button type="button" aria-label="بستن تنظیم همگام‌سازی" onClick={onClose} className="rounded-md p-2">
              <X aria-hidden="true" />
            </button>
          )}
        </div>
        <InstallApp />
        <OversizedStateWarning onBackup={() => void downloadFullBackup('local')} />
        <SyncStatusDetails status={status} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <GoogleLoginButton disabled={busy || status.phase === 'syncing'} showPrepareError={false} />
          <button
            type="button"
            className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void signOut()}
          >
            خروج از حساب Google در این دستگاه
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy || status.phase === 'syncing'}
            onClick={() => void syncNow()}
          >
            همگام‌سازی الان
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void refreshMirrorHealth()}
          >
            بررسی اتصال و خطای Drive / Notion
          </button>
          <button
            type="button"
            className="rounded-lg border border-emerald-300/40 px-3 py-2 text-sm disabled:opacity-50"
            disabled={
              busy ||
              status.phase !== 'synced' ||
              status.driveMirror?.status !== 'synced' ||
              status.notionMirror?.status !== 'synced' ||
              status.driveMirror.pendingCount > 0 ||
              status.notionMirror.pendingCount > 0
            }
            onClick={() => void sendSafeIntegrationTest()}
          >
            تست امن اتصال Drive و Notion
          </button>
        </div>
        <LegacyMigrationStatus
          migration={migration}
          busy={busy}
          phase={status.phase}
          syncLegacy={syncLegacy}
          backUpAndClear={backUpAndClear}
          clearAfterVerifiedBackup={clearAfterVerifiedBackup}
        />
        <LearningBackupPanel {...backup} busy={busy} />
        {message && (
          <p role="status" className="mt-3 text-sm text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-300">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
