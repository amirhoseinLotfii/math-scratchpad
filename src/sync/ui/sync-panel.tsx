import { useRef } from 'react';
import { X } from 'lucide-react';
import { GoogleLoginButton } from '../google-login-button';
import { SyncBackupSections } from './sync-backup-sections';
import { SyncStatusCards } from './sync-status-cards';
import { useModalFocusTrap } from './use-modal-focus-trap';
import { useSyncPanelController } from './use-sync-panel-controller';

export function SyncPanel({ onClose }: { onClose?: () => void }) {
  const modal = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isClosable = !!onClose;
  const backupFile = useRef<HTMLInputElement>(null);

  useModalFocusTrap(modal, isClosable, closeRef);
  const ctrl = useSyncPanelController();

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
          <h2 id="sync-panel-title" className="text-base font-semibold">همگام‌سازی و حفظ داده‌ها</h2>
          {onClose && <button type="button" aria-label="بستن تنظیم همگام‌سازی" onClick={onClose} className="rounded-md p-2"><X aria-hidden="true" /></button>}
        </div>
        <SyncStatusCards status={ctrl.status} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <GoogleLoginButton disabled={ctrl.busy || ctrl.status.phase === 'syncing'} showPrepareError={false} />
          <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={ctrl.busy} onClick={() => void ctrl.signOut()}>
            خروج از حساب Google در این دستگاه
          </button>
          <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={ctrl.busy || ctrl.status.phase === 'syncing'} onClick={() => void ctrl.syncNow()}>
            همگام‌سازی الان
          </button>
          <button type="button" className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-50" disabled={ctrl.busy} onClick={() => void ctrl.refreshMirrorHealth()}>
            بررسی اتصال و خطای Drive / Notion
          </button>
          <button
            type="button"
            className="rounded-lg border border-emerald-300/40 px-3 py-2 text-sm disabled:opacity-50"
            disabled={ctrl.busy || ctrl.status.phase !== 'synced' || ctrl.status.driveMirror?.status !== 'synced'
              || ctrl.status.notionMirror?.status !== 'synced' || ctrl.status.driveMirror.pendingCount > 0 || ctrl.status.notionMirror.pendingCount > 0}
            onClick={() => void ctrl.sendSafeIntegrationTest()}
          >
            تست امن اتصال Drive و Notion
          </button>
        </div>
        <SyncBackupSections
          busy={ctrl.busy}
          status={ctrl.status}
          migration={ctrl.migration}
          backupFileRef={backupFile}
          importPreview={ctrl.importPreview}
          reloadAfterImport={ctrl.reloadAfterImport}
          onSyncLegacy={() => void ctrl.syncLegacy()}
          onBackUpAndClear={() => void ctrl.backUpAndClear()}
          onClearAfterVerifiedBackup={() => void ctrl.clearAfterVerifiedBackup()}
          onDownloadFullBackup={() => void ctrl.downloadFullBackup()}
          onSelectBackupFile={file => void ctrl.selectBackupFile(file)}
          onRestoreFullBackup={() => void ctrl.restoreFullBackup()}
        />
        {ctrl.message && <p role="status" className="mt-3 text-sm text-emerald-300">{ctrl.message}</p>}
        {ctrl.error && <p role="alert" className="mt-3 text-sm text-rose-300">{ctrl.error}</p>}
      </section>
    </>
  );
}
