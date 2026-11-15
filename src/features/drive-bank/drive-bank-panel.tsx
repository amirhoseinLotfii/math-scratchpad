import { initialKeyboardOpen } from '../../shared/lib/ui-prefs';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppStore } from '../../hooks';
import { actions } from '../../store';
import { validateSession } from '../../persistence';
import { Button } from '../../shared/ui/button';
import { GoogleDriveAccessButton, GoogleLoginButton } from '../../sync/google-login-button';
import { archiveSession, bankDocument, readArchive, type ArchivedSession, type DriveBank } from './drive-bank';

import { BankSessionConfirmation, type BankConfirmation } from './bank-session-confirmation';
import { useDriveBankConnection } from './use-drive-bank-connection';
import { useBankPanelFocus } from './use-bank-panel-focus';
export { POLL_MS } from './use-drive-bank-connection';
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
  const store = useAppStore(),
    dispatch = useAppDispatch();
  const { config, connected, message, busy, ready, available, checkedAt, token, setBusy, setMessage, announce, afterToken, choose, sync } =
    useDriveBankConnection({ open, store, onAvailable, onBankReady, onResumeBank });
  const [archives, setArchives] = useState<ArchivedSession[]>([]);
  const [confirmation, setConfirmation] = useState<BankConfirmation | null>(null);
  const panel = useRef<HTMLElement>(null),
    connectButton = useRef<HTMLDivElement>(null);
  const confirmationTrigger = useRef<HTMLElement | null>(null),
    cancelConfirmation = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setArchives(readArchive());
    } catch {
      setMessage('Saved sessions could not be read. No data was changed.');
    }
  }, []);
  const closePanelRef = useBankPanelFocus({ open, ready, panel, connectButton, close, confirmation });
  async function startBank() {
    if (!available || !available.bank.questions.length) return;
    setBusy(true);
    try {
      const doc = bankDocument(available.bank, available.version);
      await archiveSession(store.getState());
      await onBeforeBankLoad?.(available.bank, available.version);
      dispatch(actions.load({ doc }));
      dispatch(actions.keyboard(initialKeyboardOpen(false)));
      onBankReady?.(available.bank, available.version);
      onResumeBank?.(available.bank, available.version);
      setArchives(readArchive());
      onAvailable(false);
      setMessage('The new batch is ready. The previous work was safely archived first.');
    } catch (e) {
      setMessage(`${e instanceof Error ? e.message : 'The previous session could not be saved.'} The new batch was not opened.`);
    } finally {
      setBusy(false);
    }
  }
  async function restore(saved: ArchivedSession) {
    setBusy(true);
    try {
      const parsed = validateSession(JSON.parse(saved.data));
      await archiveSession(store.getState());
      dispatch(actions.load(parsed));
      setArchives(readArchive());
      setMessage('The saved session was restored.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The saved session could not be restored.');
    } finally {
      setBusy(false);
    }
  }
  function requestConfirmation(kind: 'batch' | 'restore', trigger: HTMLElement, saved?: ArchivedSession) {
    confirmationTrigger.current = trigger;
    setConfirmation(kind === 'batch' ? { kind } : saved ? { kind, saved } : null);
  }
  async function confirmRequestedAction() {
    const action = confirmation;
    setConfirmation(null);
    if (action?.kind === 'batch') await startBank();
    else if (action?.kind === 'restore') await restore(action.saved);
    close();
  }
  const current = store.getState().doc.session;
  const same = available && current?.bankId === available.bank.bank_id && current.bankVersion === available.version;
  return (
    <>
      {open && <div className="drive-bank-backdrop" aria-hidden="true" onClick={() => closePanelRef.current()} />}
      <section
        ref={panel}
        role="dialog"
        aria-modal={open ? true : undefined}
        tabIndex={-1}
        className="setup-panel"
        lang="en"
        dir="ltr"
        aria-label="Google Drive question bank"
        hidden={!open}
      >
        <h2>Google Drive question bank</h2>
        <p>
          This app can access only a file you select in Google's picker (drive.file permission), not the rest of your Drive. While this
          panel is open, the selected file is checked for changes every 30 seconds.
        </p>
        <p>
          Selected file: <span dir="ltr">{config.fileName || (config.fileId ? 'Selected' : '—')}</span>
          {checkedAt && ` · Last checked ${checkedAt}`}
        </p>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {available?.bank.parseWarnings?.length ? (
          <details className="bank-validation-warnings">
            <summary>Bank content notes ({available.bank.parseWarnings.length})</summary>
            <ul>
              {available.bank.parseWarnings.map((warning, index) => (
                <li key={`${index}-${warning}`}>
                  <bdi dir="auto">{warning}</bdi>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="toolbar">
          <GoogleLoginButton
            buttonRef={connectButton}
            disabled={busy || !ready}
            label={connected || (token.current === null && config.fileId) ? 'Sign in to Google identity' : 'Sign in to Google identity'}
          />
          <GoogleDriveAccessButton
            disabled={busy || !ready}
            label={connected ? 'Reconnect Google Drive access' : 'Grant Google Drive access'}
            onComplete={async (driveToken) => {
              setBusy(true);
              try {
                await afterToken(driveToken, true);
              } finally {
                setBusy(false);
              }
            }}
          />
          {connected && <Button onClick={choose}>Choose bank file</Button>}
          {connected && config.fileId && (
            <Button
              onClick={() => {
                void sync(true);
              }}
            >
              Check now
            </Button>
          )}
          {available && available.bank.questions.length > 0 && (
            <Button onClick={(event) => requestConfirmation('batch', event.currentTarget)} disabled={!!same}>
              Open received batch
            </Button>
          )}
          <Button onClick={close}>Close</Button>
        </div>
        <p>
          The active session never changes automatically. Before a new batch opens, the current session is saved in this browser. Google
          authorization lasts about one hour and is cleared when the page closes; reconnect when it expires.
        </p>
        {archives.length > 0 && (
          <details>
            <summary>Saved sessions ({archives.length})</summary>
            {archives.map((a, index) => (
              <div key={`${a.id}-${a.savedAt}-${index}`}>
                <span dir="ltr">
                  {a.id} · {a.savedAt}
                </span>{' '}
                <Button onClick={(event) => requestConfirmation('restore', event.currentTarget, a)}>Resume</Button>
              </div>
            ))}
          </details>
        )}
        <BankSessionConfirmation
          confirmation={confirmation}
          setConfirmation={setConfirmation}
          cancelConfirmation={cancelConfirmation}
          confirmationTrigger={confirmationTrigger}
          panel={panel}
          confirmRequestedAction={confirmRequestedAction}
        />
      </section>
    </>
  );
}
