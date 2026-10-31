import { initialKeyboardOpen } from '../../shared/lib/ui-prefs';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppStore } from '../../hooks';
import { actions } from '../../store';
import { validateSession } from '../../persistence';
import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import { EMPTY_BANK, archiveSession, bankCacheStorageKey, bankDocument, metaFingerprint, parseBankText, readArchive, readBankCache, readDriveMeta, readPrivateBankText, saveBankCache, snapshotVersion, type ArchivedSession, type DriveBank } from './drive-bank';
import { DRIVE_CONFIG_KEY, getConfig, loadIdentity, loadPicker, pickFile, requestToken, saveConfig, type DriveConfig, type Token } from './google';
import { permittedAccount } from './identity';

export const POLL_MS = 30000;
export function DriveBankPanel({ close, open, onAvailable, onBankReady }: { close: () => void; open: boolean; onAvailable: (available: boolean) => void; onBankReady?: (bank: DriveBank | null, version: string) => void }) {
  const store = useAppStore(), dispatch = useAppDispatch();
  const [config, setConfig] = useState<DriveConfig>(getConfig), [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('Connect Google Drive to begin.'), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [available, setAvailable] = useState<{ bank: DriveBank; version: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [archives, setArchives] = useState<ArchivedSession[]>([]);
  const [confirmation, setConfirmation] = useState<{ kind: 'batch' } | { kind: 'restore'; saved: ArchivedSession } | null>(null);
  const token = useRef<Token | null>(null), fingerprint = useRef(''), active = useRef(true), syncing = useRef(false);
  const onBankReadyRef = useRef(onBankReady), onAvailableRef = useRef(onAvailable);
  onBankReadyRef.current = onBankReady; onAvailableRef.current = onAvailable;
  const panel = useRef<HTMLElement>(null), connectButton = useRef<HTMLButtonElement>(null);
  const confirmationTrigger = useRef<HTMLElement | null>(null), cancelConfirmation = useRef<HTMLButtonElement>(null);
  const cfg = useRef(config); cfg.current = config;
  async function restoreCachedBank(fileId: string) {
    if (!fileId) return;
    try {
      const cached = await readBankCache(fileId);
      if (!active.current || cfg.current.fileId !== fileId || !cached) return;
      fingerprint.current = cached.fingerprint;
      setAvailable({ bank: cached.bank, version: cached.version });
      const session = store.getState().doc.session;
      onAvailableRef.current(cached.bank.questions.length > 0 && !(session?.bankId === cached.bank.bank_id && session.bankVersion === cached.version));
      onBankReadyRef.current?.(cached.bank, cached.version);
      setMessage(`Restored the verified local bank ${cached.bank.bank_id} (${cached.bank.version}); it will be checked against Drive after reconnecting.`);
    } catch {
      // A corrupt cache is left untouched; a fresh verified Drive download can replace it.
    }
  }
  useEffect(() => { active.current = true; try { setArchives(readArchive()); } catch { setMessage('Saved sessions could not be read. No data was changed.'); } return () => { active.current = false; token.current = null; }; }, []);
  useEffect(() => { void restoreCachedBank(cfg.current.fileId); }, []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DRIVE_CONFIG_KEY) {
        const next = getConfig();
        cfg.current = next; setConfig(next); fingerprint.current = '';
        void restoreCachedBank(next.fileId);
      } else if (event.key === bankCacheStorageKey(cfg.current.fileId)) {
        void restoreCachedBank(cfg.current.fileId);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => (ready ? connectButton.current : panel.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, ready]);
  useEffect(() => { if (!open || ready) return; void Promise.all([loadIdentity(), loadPicker().catch(() => undefined)]).then(() => { if (active.current) setReady(true); }).catch(e => { if (active.current) setMessage(e instanceof Error ? e.message : 'Google services are unavailable.'); }); }, [open, ready]);
  function expire(text: string) { token.current = null; setConnected(false); setMessage(text); }
  const announce = (bank: DriveBank | null, version = '') => {
    const current = store.getState().doc.session;
    onAvailable(!!bank && bank.questions.length > 0 && !(current?.bankId === bank.bank_id && current.bankVersion === version));
  };
  async function sync(force = false) {
    if (syncing.current) return;
    const t = token.current, fileId = cfg.current.fileId;
    if (!t || Date.now() >= t.expiresAt) { expire('The Google authorization expired. Select Reconnect to check for updates.'); return; }
    if (!fileId) { setMessage('No question bank file is selected.'); return; }
    syncing.current = true;
    try {
      const meta = await readDriveMeta(fileId, t.accessToken), fp = metaFingerprint(meta);
      if (!active.current) return;
      setCheckedAt(new Date().toLocaleTimeString('en-GB'));
      if (!force && fp === fingerprint.current) return; // unchanged: no download
      const parsed = parseBankText(await readPrivateBankText(fileId, t.accessToken));
      if (!active.current) return;
      fingerprint.current = fp;
      if (parsed === EMPTY_BANK) { setAvailable(null); announce(null); onBankReady?.(null, ''); setMessage('Connected. The selected bank file is empty.'); return; }
      const version = await snapshotVersion(parsed);
      const cache = await saveBankCache(fileId, parsed, version, fp);
      setAvailable({ bank: parsed, version }); announce(parsed, version);
      onBankReady?.(parsed, version);
      const readyMessage = parsed.questions.length ? `Bank ${parsed.bank_id} (version ${parsed.version}) loaded; ${parsed.questions.length} questions ready.` : 'Connected. The bank has no questions yet.';
      const hasLessonWarnings = parsed.parseWarnings?.some(item => item.startsWith('lessons'));
      const current = store.getState().doc.session;
      const changed = current?.bankId === parsed.bank_id && !!current.bankVersion && current.bankVersion !== version;
      setMessage(`${readyMessage}${cache.saved ? ' A verified local copy is ready for offline use.' : ` ${cache.message}`}${hasLessonWarnings ? ' Some lesson content could not be read. You can continue with the bank questions.' : ''}${changed ? ' This bank version differs from the current session; the current session was not changed.' : ''}${parsed.lessons?.length ? ' Lesson progress is kept separately for each bank version.' : ''}`);
    } catch (e) {
      if (!active.current) return;
      const text = e instanceof Error ? e.message : 'The bank could not be loaded.';
      if (text.includes('expired')) expire(text); else setMessage(`${text} The previously loaded bank and current session were preserved.`);
    } finally { syncing.current = false; }
  }
  useEffect(() => {
    if (!connected) return;
    const tick = () => { if (document.visibilityState === 'visible') void sync(); };
    const timer = setInterval(tick, POLL_MS); document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [connected]);
  function afterToken(t: Token) {
    void (async () => {
      try {
        const who = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${t.accessToken}` }, cache: 'no-store' });
        if (!await permittedAccount(who.ok ? await who.json() : null)) throw Error('This is not the personal project account. Reconnect and choose the correct Google account.');
        token.current = t; setConnected(true);
        if (!cfg.current.fileId) { choose(); return; }
        fingerprint.current = ''; await sync(true);
      } catch (e) { token.current = null; if (active.current) setMessage(e instanceof Error ? e.message : 'Connection failed.'); }
      finally { if (active.current) setBusy(false); }
    })();
  }
  function choose() {
    const t = token.current;
    if (!t) { setMessage('Connect Google Drive first.'); return; }
    pickFile(cfg.current, t.accessToken, r => {
      if (!active.current) return;
      if (!r.id) { setMessage(r.error ?? 'No file was selected.'); return; }
      const c = { ...cfg.current, fileId: r.id, fileName: r.name ?? '' }; saveConfig(c); setConfig(c); cfg.current = c;
      fingerprint.current = ''; void sync(true);
    });
  }
  /** Runs synchronously in the tap handler so Android Chrome allows the Google popup. */
  function connect() {
    setBusy(true); setMessage('Choose the personal project account in the Google window.');
    requestToken(config.clientId, { prompt: connected || config.fileId ? '' : 'consent' }, r => {
      if (!active.current) return;
      if (r.token) afterToken(r.token); else { setBusy(false); setMessage(r.error ?? 'Connection failed.'); }
    });
  }
  function startBank() {
    if (!available || !available.bank.questions.length) return;
    try {
      const doc = bankDocument(available.bank, available.version);
      archiveSession(store.getState());
      dispatch(actions.load({ doc })); dispatch(actions.keyboard(initialKeyboardOpen(false))); onBankReady?.(available.bank, available.version);
      setArchives(readArchive()); onAvailable(false); setMessage('The new batch is ready. The previous session was saved in this browser.');
    } catch (e) { setMessage(`${e instanceof Error ? e.message : 'The previous session could not be saved.'} The new batch was not opened.`); }
  }
  function restore(saved: ArchivedSession) {
    try { const parsed = validateSession(JSON.parse(saved.data)); archiveSession(store.getState()); dispatch(actions.load(parsed)); setArchives(readArchive()); setMessage('The saved session was restored.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'The saved session could not be restored.'); }
  }
  function requestConfirmation(kind: 'batch' | 'restore', trigger: HTMLElement, saved?: ArchivedSession) {
    confirmationTrigger.current = trigger;
    setConfirmation(kind === 'batch' ? { kind } : saved ? { kind, saved } : null);
  }
  function confirmRequestedAction() {
    const action = confirmation;
    setConfirmation(null);
    if (action?.kind === 'batch') startBank();
    else if (action?.kind === 'restore') restore(action.saved);
  }
  const current = store.getState().doc.session;
  const same = available && current?.bankId === available.bank.bank_id && current.bankVersion === available.version;
  return <section ref={panel} tabIndex={-1} className="setup-panel" lang="en" dir="ltr" aria-label="Google Drive question bank" hidden={!open}>
    <h2>Google Drive question bank</h2>
    <p>This app can access only a file you select in Google's picker (drive.file permission), not the rest of your Drive. While this panel is open, the selected file is checked for changes every 30 seconds.</p>
    <p>Selected file: <span dir="ltr">{config.fileName || (config.fileId ? 'Selected' : '—')}</span>{checkedAt && ` · Last checked ${checkedAt}`}</p>
    <p role="status" aria-live="polite">{message}</p>
    {available?.bank.parseWarnings?.length ? <details className="bank-validation-warnings"><summary>Bank content notes ({available.bank.parseWarnings.length})</summary><ul>{available.bank.parseWarnings.map((warning, index) => <li key={`${index}-${warning}`}><bdi dir="auto">{warning}</bdi></li>)}</ul></details> : null}
    <div className="toolbar"><Button ref={connectButton} onClick={connect} disabled={busy || !ready}>{connected || (token.current === null && config.fileId) ? 'Reconnect' : 'Connect Google Drive'}</Button>
      {connected && <Button onClick={choose}>Choose bank file</Button>}
      {connected && config.fileId && <Button onClick={() => { void sync(true); }}>Check now</Button>}
      {available && available.bank.questions.length > 0 && <Button onClick={event => requestConfirmation('batch', event.currentTarget)} disabled={!!same}>Open received batch</Button>}<Button onClick={close}>Close</Button></div>
    <p>The active session never changes automatically. Before a new batch opens, the current session is saved in this browser. Google authorization lasts about one hour and is cleared when the page closes; reconnect when it expires.</p>
    {archives.length > 0 && <details><summary>Saved sessions ({archives.length})</summary>{archives.map((a, index) => <div key={`${a.id}-${a.savedAt}-${index}`}><span dir="ltr">{a.id} · {a.savedAt}</span> <Button onClick={event => requestConfirmation('restore', event.currentTarget, a)}>Resume</Button></div>)}</details>}
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <DialogContent
        aria-describedby="drive-session-confirmation-description"
        onOpenAutoFocus={event => { event.preventDefault(); cancelConfirmation.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const trigger = confirmationTrigger.current;
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
          else panel.current?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle>{confirmation?.kind === 'batch' ? 'Open a new question batch?' : 'Restore this saved session?'}</DialogTitle>
        <DialogDescription id="drive-session-confirmation-description">
          {confirmation?.kind === 'batch'
            ? 'The current session will be saved in this browser and can be restored from Saved sessions.'
            : 'The current session will also be saved.'}
        </DialogDescription>
        <div className="dialog-actions">
          <Button ref={cancelConfirmation} onClick={() => setConfirmation(null)}>Cancel</Button>
          <Button variant="default" onClick={confirmRequestedAction}>{confirmation?.kind === 'batch' ? 'Open batch' : 'Restore session'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
