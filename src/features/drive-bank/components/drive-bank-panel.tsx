import type { DriveBank } from '../../../domain/entities/drive-bank.types';
import { Button } from '../../../shared/ui/button';
import { GoogleDriveAccessButton, GoogleLoginButton } from '../../../sync/google-login-button';
import { POLL_MS, useDriveBankPanel } from '../hooks/use-drive-bank-panel';
import { BankConfirmationDialog } from './bank-confirmation-dialog';

export { POLL_MS };

export function DriveBankPanel({
  close,
  open,
  onAvailable,
  onBankReady,
  onBeforeBankLoad,
  onResumeBank,
}: {
  close: () => void;
  open: boolean;
  onAvailable: (available: boolean) => void;
  onBankReady?: (bank: DriveBank | null, version: string) => void;
  onBeforeBankLoad?: (bank: DriveBank, version: string) => Promise<void>;
  onResumeBank?: (bank: DriveBank, version: string) => void;
}) {
  const {
    config,
    connected,
    message,
    busy,
    setBusy,
    ready,
    available,
    checkedAt,
    archives,
    confirmation,
    setConfirmation,
    token,
    panel,
    connectButton,
    confirmationTrigger,
    cancelConfirmation,
    closePanelRef,
    same,
    sync,
    afterToken,
    choose,
    requestConfirmation,
    confirmRequestedAction,
  } = useDriveBankPanel({ close, open, onAvailable, onBankReady, onBeforeBankLoad, onResumeBank });

  return (
    <>
      {open && <div className="drive-bank-backdrop" aria-hidden="true" onClick={() => closePanelRef.current()} />}
      <section ref={panel} role="dialog" aria-modal={open ? true : undefined} tabIndex={-1} className="setup-panel" lang="en" dir="ltr" aria-label="Google Drive question bank" hidden={!open}>
        <h2>Google Drive question bank</h2>
        <p>This app can access only a file you select in Google's picker (drive.file permission), not the rest of your Drive. While this panel is open, the selected file is checked for changes every 30 seconds.</p>
        <p>Selected file: <span dir="ltr">{config.fileName || (config.fileId ? 'Selected' : '—')}</span>{checkedAt && ` · Last checked ${checkedAt}`}</p>
        <p role="status" aria-live="polite">{message}</p>
        {available?.bank.parseWarnings?.length ? <details className="bank-validation-warnings"><summary>Bank content notes ({available.bank.parseWarnings.length})</summary><ul>{available.bank.parseWarnings.map((warning, index) => <li key={`${index}-${warning}`}><bdi dir="auto">{warning}</bdi></li>)}</ul></details> : null}
        <div className="toolbar">
          <GoogleLoginButton
            buttonRef={connectButton}
            disabled={busy || !ready}
            label={connected || (token.current === null && config.fileId) ? 'Sign in to Google identity' : 'Sign in to Google identity'}
          />
          <GoogleDriveAccessButton
            disabled={busy || !ready}
            label={connected ? 'Reconnect Google Drive access' : 'Grant Google Drive access'}
            onComplete={async driveToken => { setBusy(true); try { await afterToken(driveToken, true); } finally { setBusy(false); } }}
          />
          {connected && <Button onClick={choose}>Choose bank file</Button>}
          {connected && config.fileId && <Button onClick={() => { void sync(true); }}>Check now</Button>}
          {available && available.bank.questions.length > 0 && <Button onClick={event => requestConfirmation('batch', event.currentTarget)} disabled={!!same}>Open received batch</Button>}
          <Button onClick={close}>Close</Button>
        </div>
        <p>The active session never changes automatically. Before a new batch opens, the current session is saved in this browser. Google authorization lasts about one hour and is cleared when the page closes; reconnect when it expires.</p>
        {archives.length > 0 && <details><summary>Saved sessions ({archives.length})</summary>{archives.map((a, index) => <div key={`${a.id}-${a.savedAt}-${index}`}><span dir="ltr">{a.id} · {a.savedAt}</span> <Button onClick={event => requestConfirmation('restore', event.currentTarget, a)}>Resume</Button></div>)}</details>}
        <BankConfirmationDialog
          confirmation={confirmation}
          onClose={() => setConfirmation(null)}
          onConfirm={confirmRequestedAction}
          cancelConfirmationRef={cancelConfirmation}
          confirmationTriggerRef={confirmationTrigger}
          panelRef={panel}
        />
      </section>
    </>
  );
}
