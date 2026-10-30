import { initialKeyboardOpen } from '../../shared/lib/ui-prefs';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppStore } from '../../hooks';
import { actions } from '../../store';
import { validateSession } from '../../persistence';
import { Button } from '../../shared/ui/button';
import { EMPTY_BANK, archiveSession, bankDocument, metaFingerprint, parseBankText, readArchive, readDriveMeta, readPrivateBankText, snapshotVersion, type ArchivedSession, type DriveBank } from './drive-bank';
import { getConfig, loadIdentity, loadPicker, pickFile, requestToken, saveConfig, type DriveConfig, type Token } from './google';
import { permittedAccount } from './identity';

export const POLL_MS = 30000;
export function DriveBankPanel({ close, open, onAvailable, onBankReady }: { close: () => void; open: boolean; onAvailable: (available: boolean) => void; onBankReady?: (bank: DriveBank | null, version: string) => void }) {
  const store = useAppStore(), dispatch = useAppDispatch();
  const [config, setConfig] = useState<DriveConfig>(getConfig), [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('Connect Google Drive to begin.'), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [available, setAvailable] = useState<{ bank: DriveBank; version: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [archives, setArchives] = useState<ArchivedSession[]>([]);
  const token = useRef<Token | null>(null), fingerprint = useRef(''), active = useRef(true), syncing = useRef(false);
  const panel = useRef<HTMLElement>(null), connectButton = useRef<HTMLButtonElement>(null);
  const cfg = useRef(config); cfg.current = config;
  useEffect(() => { active.current = true; try { setArchives(readArchive()); } catch { setMessage('Saved sessions could not be read. No data was changed.'); } return () => { active.current = false; token.current = null; }; }, []);
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
      setAvailable({ bank: parsed, version }); announce(parsed, version);
      onBankReady?.(parsed, version);
      const readyMessage = parsed.questions.length ? `Bank ${parsed.bank_id} (version ${parsed.version}) loaded; ${parsed.questions.length} questions ready.` : 'Connected. The bank has no questions yet.';
      const hasLessonWarnings = parsed.parseWarnings?.some(item => item.startsWith('lessons'));
      const current = store.getState().doc.session;
      const changed = current?.bankId === parsed.bank_id && !!current.bankVersion && current.bankVersion !== version;
      setMessage(`${readyMessage}${hasLessonWarnings ? ' Some lesson content could not be read. You can continue with the bank questions.' : ''}${changed ? ' This bank version differs from the current session; the current session was not changed.' : ''}${parsed.lessons?.length ? ' Lesson progress is kept separately for each bank version.' : ''}`);
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
    if (!window.confirm('Open a new question batch? The current session will be saved in this browser and can be restored from Saved sessions.')) return;
    try {
      const doc = bankDocument(available.bank, available.version);
      archiveSession(store.getState());
      dispatch(actions.load({ doc })); dispatch(actions.keyboard(initialKeyboardOpen(true))); onBankReady?.(available.bank, available.version);
      setArchives(readArchive()); onAvailable(false); setMessage('The new batch is ready. The previous session was saved in this browser.');
    } catch (e) { setMessage(`${e instanceof Error ? e.message : 'The previous session could not be saved.'} The new batch was not opened.`); }
  }
  function restore(saved: ArchivedSession) {
    if (!window.confirm('Restore this saved session? The current session will also be saved.')) return;
    try { const parsed = validateSession(JSON.parse(saved.data)); archiveSession(store.getState()); dispatch(actions.load(parsed)); setArchives(readArchive()); setMessage('The saved session was restored.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'The saved session could not be restored.'); }
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
      {available && available.bank.questions.length > 0 && <Button onClick={startBank} disabled={!!same}>Open received batch</Button>}<Button onClick={close}>Close</Button></div>
    <p>The active session never changes automatically. Before a new batch opens, the current session is saved in this browser. Google authorization lasts about one hour and is cleared when the page closes; reconnect when it expires.</p>
    {archives.length > 0 && <details><summary>Saved sessions ({archives.length})</summary>{archives.map((a, index) => <div key={`${a.id}-${a.savedAt}-${index}`}><span dir="ltr">{a.id} · {a.savedAt}</span> <Button onClick={() => restore(a)}>Resume</Button></div>)}</details>}
  </section>;
}
