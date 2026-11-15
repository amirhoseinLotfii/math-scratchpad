import { initialKeyboardOpen } from '../../shared/lib/ui-prefs';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppStore } from '../../hooks';
import { actions } from '../../store';
import { validateSession } from '../../persistence';
import { Button } from '../../shared/ui/button';
import { GoogleDriveAccessButton, GoogleLoginButton } from '../../sync/google-login-button';
import { archiveSession, bankDocument, readArchive, type ArchivedSession, type DriveBank } from './drive-bank';
import { listOfflineBanks, type CachedOfflineBank, type OfflineBankList } from '../../pwa/offline-bank-cache';
import { OfflineDownloadControl } from '../../pwa/offline-download-control';

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
  const {
    config,
    connected,
    message,
    busy,
    ready,
    online,
    available,
    checkedAt,
    token,
    setBusy,
    setMessage,
    announce,
    afterToken,
    choose,
    sync,
  } = useDriveBankConnection({ open, store, onAvailable, onBankReady, onResumeBank });
  const [archives, setArchives] = useState<ArchivedSession[]>([]);
  const [offlineBankList, setOfflineBankList] = useState<OfflineBankList>({ banks: [], corruptCount: 0 });
  const offlineBanks = offlineBankList.banks;
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
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    void listOfflineBanks()
      .then((banks) => {
        if (mounted) setOfflineBankList(banks);
      })
      .catch(() => {
        if (mounted) setOfflineBankList({ banks: [], corruptCount: 0 });
      });
    return () => {
      mounted = false;
    };
  }, [open, available?.version]);
  const closePanelRef = useBankPanelFocus({ open, ready, panel, connectButton, close, confirmation });
  async function openBank(bank: DriveBank, version: string, checkCloudTransition: boolean) {
    setBusy(true);
    try {
      const doc = bankDocument(bank, version);
      await archiveSession(store.getState());
      if (checkCloudTransition) await onBeforeBankLoad?.(bank, version);
      dispatch(actions.load({ doc }));
      dispatch(actions.keyboard(initialKeyboardOpen(false)));
      onBankReady?.(bank, version);
      onResumeBank?.(bank, version);
      setArchives(readArchive());
      onAvailable(false);
      setMessage(
        checkCloudTransition
          ? 'The new batch is ready. The previous work was safely archived first.'
          : `Offline bank ${bank.bank_id} is ready. The previous session was saved locally.`,
      );
    } catch (e) {
      setMessage(`${e instanceof Error ? e.message : 'The previous session could not be saved.'} The new batch was not opened.`);
    } finally {
      setBusy(false);
    }
  }
  async function startBank() {
    if (!available || !available.bank.questions.length) return;
    await openBank(available.bank, available.version, true);
  }
  async function openOfflineBank(cached: CachedOfflineBank) {
    await openBank(cached.bank, cached.contentVersion, false);
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
  function requestOfflineBankConfirmation(trigger: HTMLElement, bank: CachedOfflineBank) {
    confirmationTrigger.current = trigger;
    setConfirmation({ kind: 'offline-bank', bank });
  }
  async function confirmRequestedAction() {
    const action = confirmation;
    setConfirmation(null);
    if (action?.kind === 'batch') await startBank();
    else if (action?.kind === 'restore') await restore(action.saved);
    else if (action?.kind === 'offline-bank') await openOfflineBank(action.bank);
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
        <section aria-label="Cached offline banks">
          <h3>Cached offline banks ({offlineBanks.length})</h3>
          <p lang="fa" dir="rtl">
            پوستهٔ برنامه، نسخه‌های ذخیره‌شدهٔ بانک و تصاویر درس‌های موجود را برای استفادهٔ آفلاین آماده کن.
          </p>
          <OfflineDownloadControl />
          {offlineBankList.corruptCount > 0 && (
            <p role="alert" lang="fa" dir="rtl">
              برخی کپی‌های آفلاین تأیید نشدند؛ داده‌ها دست‌نخورده باقی ماندند.
            </p>
          )}
          {offlineBanks.length ? (
            <ul>
              {offlineBanks.map((cached) => {
                const currentSession = store.getState().doc.session;
                const isCurrent = currentSession?.bankId === cached.bank.bank_id && currentSession.bankVersion === cached.contentVersion;
                return (
                  <li key={`${cached.fileId}:${cached.contentVersion}`}>
                    <span>
                      <span>
                        {cached.bank.bank_id} · {cached.declaredVersion}
                      </span>
                      <small lang="fa" dir="rtl">
                        نسخهٔ ذخیره‌شده — {new Date(cached.savedAt).toLocaleDateString('fa-IR')} ·{' '}
                        {new Intl.NumberFormat('fa-IR').format(cached.sizeChars)} نویسه
                      </small>
                    </span>{' '}
                    <Button disabled={busy || isCurrent} onClick={(event) => requestOfflineBankConfirmation(event.currentTarget, cached)}>
                      Open offline bank {cached.bank.bank_id}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No verified offline banks are cached on this device yet.</p>
          )}
        </section>
        <div className="toolbar">
          <GoogleLoginButton
            buttonRef={connectButton}
            disabled={busy || !ready || !online}
            label={connected || (token.current === null && config.fileId) ? 'Sign in to Google identity' : 'Sign in to Google identity'}
          />
          <GoogleDriveAccessButton
            disabled={busy || !ready || !online}
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
          {connected && (
            <Button disabled={!online} onClick={choose}>
              Choose bank file
            </Button>
          )}
          {connected && config.fileId && (
            <Button
              onClick={() => {
                void sync(true);
              }}
              disabled={!online}
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
