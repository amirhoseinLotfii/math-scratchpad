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
export function DriveBankPanel({ close, open, onAvailable }: { close: () => void; open: boolean; onAvailable: (available: boolean) => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(()=>{if(open){const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('button:not(:disabled),summary')?.focus());return()=>cancelAnimationFrame(frame);}},[open]);
  const store = useAppStore(), dispatch = useAppDispatch();
  const [config, setConfig] = useState<DriveConfig>(getConfig), [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('برای شروع «اتصال Google Drive» را بزن.'), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [available, setAvailable] = useState<{ bank: DriveBank; version: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [archives, setArchives] = useState<ArchivedSession[]>([]);
  const token = useRef<Token | null>(null), fingerprint = useRef(''), active = useRef(true), syncing = useRef(false);
  const cfg = useRef(config); cfg.current = config;
  useEffect(() => { active.current = true; try { setArchives(readArchive()); } catch { setMessage('بایگانی محلی قابل خواندن نیست؛ هیچ داده‌ای تغییر نکرد.'); } return () => { active.current = false; token.current = null; }; }, []);
  useEffect(() => { if (!open || ready) return; void Promise.all([loadIdentity(), loadPicker().catch(() => undefined)]).then(() => { if (active.current) setReady(true); }).catch(e => { if (active.current) setMessage(e instanceof Error ? e.message : 'سرویس Google در دسترس نیست.'); }); }, [open, ready]);
  function expire(text: string) { token.current = null; setConnected(false); setMessage(text); }
  const announce = (bank: DriveBank | null, version = '') => {
    const current = store.getState().doc.session;
    onAvailable(!!bank && bank.questions.length > 0 && !(current?.bankId === bank.bank_id && current.bankVersion === version));
  };
  async function sync(force = false) {
    if (syncing.current) return;
    const t = token.current, fileId = cfg.current.fileId;
    if (!t || Date.now() >= t.expiresAt) { expire('مجوز یک‌ساعتهٔ Google تمام شد؛ برای دریافت تغییرات «اتصال دوباره» را بزن (معمولاً بدون رمز، با یک لمس).'); return; }
    if (!fileId) { setMessage('هنوز فایل بانک انتخاب نشده.'); return; }
    syncing.current = true;
    try {
      const meta = await readDriveMeta(fileId, t.accessToken), fp = metaFingerprint(meta);
      if (!active.current) return;
      setCheckedAt(new Date().toLocaleTimeString('fa-IR'));
      if (!force && fp === fingerprint.current) return; // unchanged: no download
      const parsed = parseBankText(await readPrivateBankText(fileId, t.accessToken));
      if (!active.current) return;
      fingerprint.current = fp;
      if (parsed === EMPTY_BANK) { setAvailable(null); announce(null); setMessage('اتصال برقرار است؛ فایل بانک هنوز خالی است.'); return; }
      const version = await snapshotVersion(parsed);
      setAvailable({ bank: parsed, version }); announce(parsed, version);
      setMessage(parsed.questions.length ? `بانک ${parsed.bank_id} (نسخهٔ ${parsed.version}) دریافت شد؛ ${parsed.questions.length} سؤال آماده است.` : 'اتصال برقرار است؛ بانک هنوز سؤالی ندارد.');
    } catch (e) {
      if (!active.current) return;
      const text = e instanceof Error ? e.message : 'دریافت بانک ناموفق بود.';
      if (text.includes('منقضی')) expire(text); else setMessage(`${text} نسخهٔ قبلی دریافت‌شده و جلسهٔ فعلی دست نخورد.`);
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
        if (!await permittedAccount(who.ok ? await who.json() : null)) throw Error('این حساب، حساب شخصی تعیین‌شدهٔ پروژه نیست؛ دوباره وصل شو و حساب درست را انتخاب کن.');
        token.current = t; setConnected(true);
        if (!cfg.current.fileId) { choose(); return; }
        fingerprint.current = ''; await sync(true);
      } catch (e) { token.current = null; if (active.current) setMessage(e instanceof Error ? e.message : 'اتصال انجام نشد.'); }
      finally { if (active.current) setBusy(false); }
    })();
  }
  function choose() {
    const t = token.current;
    if (!t) { setMessage('اول «اتصال Google Drive» را بزن.'); return; }
    pickFile(cfg.current, t.accessToken, r => {
      if (!active.current) return;
      if (!r.id) { setMessage(r.error ?? 'فایلی انتخاب نشد.'); return; }
      const c = { ...cfg.current, fileId: r.id, fileName: r.name ?? '' }; saveConfig(c); setConfig(c); cfg.current = c;
      fingerprint.current = ''; void sync(true);
    });
  }
  /** Runs synchronously in the tap handler so Android Chrome allows the Google popup. */
  function connect() {
    setBusy(true); setMessage('در پنجرهٔ Google حساب شخصی پروژه را انتخاب کن…');
    requestToken(config.clientId, { prompt: connected || config.fileId ? '' : 'consent' }, r => {
      if (!active.current) return;
      if (r.token) afterToken(r.token); else { setBusy(false); setMessage(r.error ?? 'اتصال انجام نشد.'); }
    });
  }
  function startBank() {
    if (!available || !available.bank.questions.length) return;
    if (!window.confirm('دستهٔ جدید باز شود؟ جلسهٔ فعلی اول در همین مرورگر ذخیره می‌شود و از «جلسه‌های ذخیره‌شده» قابل برگشت است.')) return;
    try {
      const doc = bankDocument(available.bank, available.version);
      archiveSession(store.getState());
      dispatch(actions.load({ doc })); dispatch(actions.keyboard(initialKeyboardOpen(true)));
      setArchives(readArchive()); onAvailable(false); setMessage('دستهٔ جدید باز شد؛ جلسهٔ قبلی در همین مرورگر حفظ شد.');
    } catch (e) { setMessage(`${e instanceof Error ? e.message : 'ذخیرهٔ جلسهٔ قبلی ناموفق بود.'} دستهٔ جدید باز نشد.`); }
  }
  function restore(saved: ArchivedSession) {
    if (!window.confirm('این جلسهٔ ذخیره‌شده باز شود؟ جلسهٔ فعلی هم ذخیره می‌شود.')) return;
    try { const parsed = validateSession(JSON.parse(saved.data)); archiveSession(store.getState()); dispatch(actions.load(parsed)); setArchives(readArchive()); setMessage('جلسهٔ ذخیره‌شده باز شد.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'بازکردن جلسه ناموفق بود.'); }
  }
  const current = store.getState().doc.session;
  const same = available && current?.bankId === available.bank.bank_id && current.bankVersion === available.version;
  return <section ref={panel} className="setup-panel" lang="en" dir="ltr" aria-label="Google Drive bank" hidden={!open}>
    <h2>Google Drive question bank</h2>
    <details className="drive-access-details"><summary>Access and session details</summary><p lang="fa" dir="auto">برنامه فقط به فایلی که خودت در پنجرهٔ Google انتخاب می‌کنی دسترسی دارد (مجوز drive.file)، نه به بقیهٔ Drive. وقتی صفحه باز است، هر ۳۰ ثانیه تغییر فایل بررسی می‌شود.</p></details>
    <p>Selected file: <span dir="ltr">{config.fileName || (config.fileId ? 'Selected' : '—')}</span>{checkedAt && ` · Last checked ${checkedAt}`}</p>
    <p role="status" aria-live="polite" dir="auto" lang="fa">{message}</p>
    <div className="toolbar"><Button onClick={connect} disabled={busy || !ready}>{connected ? 'Reconnect' : token.current === null && config.fileId ? 'Reconnect' : 'Connect Google Drive'}</Button>
      {connected && <Button onClick={choose}>Choose bank file</Button>}
      {connected && config.fileId && <Button onClick={() => { void sync(true); }}>Check now</Button>}
      {available && available.bank.questions.length > 0 && <Button onClick={startBank} disabled={!!same}>Open received batch</Button>}<Button onClick={close}>Close</Button></div>
    <details className="drive-access-details"><summary>Session recovery and reconnecting</summary><p dir="auto" lang="fa">جلسهٔ در حال حل هیچ‌وقت خودکار عوض نمی‌شود؛ قبل از بازکردن دستهٔ تازه، جلسهٔ فعلی در مرورگر ذخیره می‌شود. مجوز Google حدود یک ساعت معتبر است و بعد از بستن صفحه هم پاک می‌شود؛ پس از آن یک لمس روی «اتصال دوباره» لازم است.</p></details>
    {archives.length > 0 && <details><summary>Saved sessions ({archives.length})</summary>{archives.map((a, index) => <div key={`${a.id}-${a.savedAt}-${index}`}><span dir="ltr">{a.id} · {a.savedAt}</span> <Button onClick={() => restore(a)}>Resume</Button></div>)}</details>}
  </section>;
}
