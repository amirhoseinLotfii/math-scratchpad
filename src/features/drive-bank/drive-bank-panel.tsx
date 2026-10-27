import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppStore } from '../../hooks';
import { actions } from '../../store';
import { validateSession } from '../../persistence';
import { Button } from '../../shared/ui/button';
import { archiveSession, bankDocument, findQuestionBank, readArchive, readPrivateBank, snapshotVersion, type ArchivedSession, type DriveBank } from './drive-bank';
import { permittedAccount } from './identity';

const CONFIG_KEY = 'math-scratchpad-drive-config-v1';
type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type Identity = { accounts: { oauth2: { initTokenClient(config: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback: () => void }): { requestAccessToken(): void } } } };
declare global { interface Window { google?: Identity } }
type Config = { clientId: string };
function getConfig(): Config {
  try { const v = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}'); return { clientId: typeof v.clientId === 'string' ? v.clientId : '' }; } catch { return { clientId: '' }; }
}
function identityScript(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => window.google?.accounts.oauth2 ? resolve() : reject(Error('سرویس ورود Google آماده نشد.'));
    script.onerror = () => reject(Error('سرویس ورود Google در دسترس نیست.')); document.head.appendChild(script);
  });
}
export function DriveBankPanel({ close, open, onAvailable }: { close: () => void; open: boolean; onAvailable: (available: boolean) => void }) {
  const store = useAppStore(), dispatch = useAppDispatch();
  const [config, setConfig] = useState<Config>(getConfig), [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('برای اتصال اولیه از حساب شخصی Google استفاده کن.'), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [available, setAvailable] = useState<{ bank: DriveBank; version: string } | null>(null);
  const [archives, setArchives] = useState<ArchivedSession[]>([]);
  const token = useRef(''), expiry = useRef(0), active = useRef(true), syncGeneration = useRef(0);
  useEffect(() => { active.current = true; try { setArchives(readArchive()); } catch { setMessage('بایگانی محلی قابل خواندن نیست؛ هیچ داده‌ای تغییر نکرد.'); } return () => { active.current = false; token.current = ''; }; }, []);
  useEffect(() => { if (!open || ready) return; void identityScript().then(() => { if (active.current) setReady(true); }).catch(e => { if (active.current) setMessage(e instanceof Error ? e.message : 'سرویس Google در دسترس نیست.'); }); }, [open, ready]);
  async function sync() {
    const generation = ++syncGeneration.current;
    if (!token.current || Date.now() >= expiry.current) { token.current = ''; if (active.current) { setConnected(false); setAvailable(null); onAvailable(false); setMessage('مجوز Google منقضی شد؛ برای ادامه دوباره متصل شو.'); } return; }
    try {
      const fileId = await findQuestionBank(token.current), bank = await readPrivateBank(fileId, token.current), version = await snapshotVersion(bank);
      if (active.current && generation === syncGeneration.current) { const current = store.getState().doc.session; setAvailable({ bank, version }); onAvailable(!!bank.questions.length && !(current?.bankId === bank.bank_id && current.bankVersion === version)); setMessage(bank.questions.length ? `بانک ${bank.bank_id} دریافت شد؛ ${bank.questions.length} سؤال آماده است.` : 'اتصال برقرار است؛ بانک هنوز سؤالی ندارد.'); }
    } catch (e) { if (active.current && generation === syncGeneration.current) { setAvailable(null); onAvailable(false); setMessage(e instanceof Error ? e.message : 'دریافت بانک ناموفق بود.'); } }
  }
  useEffect(() => { if (!connected) return; const timer = setInterval(() => { void sync(); }, 30000); return () => clearInterval(timer); }, [connected]);
  function connect() {
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(config.clientId)) { setMessage('شناسهٔ OAuth برای راه‌اندازی اولیه لازم است.'); return; }
    setBusy(true);
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      if (!window.google?.accounts.oauth2) throw Error('سرویس ورود Google هنوز آماده نیست.');
      window.google!.accounts.oauth2.initTokenClient({ client_id: config.clientId, scope: 'openid email https://www.googleapis.com/auth/drive.readonly',
        error_callback: () => { if (active.current) { setBusy(false); setMessage('اتصال Google انجام نشد.'); } },
        callback: response => { void (async () => {
          try {
            if (response.error || !response.access_token || !response.expires_in) throw Error('مجوز خواندن Drive داده نشد.');
            const who = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${response.access_token}` }, cache: 'no-store' });
            const profile: unknown = who.ok ? await who.json() : null;
            if (!await permittedAccount(profile)) throw Error('حساب انتخاب‌شده حساب شخصی تأییدشدهٔ پروژه نیست.');
            token.current = response.access_token; expiry.current = Date.now() + response.expires_in * 1000 - 5000; setConnected(true); await sync();
          } catch (e) { token.current = ''; if (active.current) setMessage(e instanceof Error ? e.message : 'اتصال انجام نشد.'); }
          finally { if (active.current) setBusy(false); }
        })(); },
      }).requestAccessToken();
    } catch (e) { setBusy(false); setMessage(e instanceof Error ? e.message : 'اتصال انجام نشد.'); }
  }
  function startBank() {
    if (!available || !available.bank.questions.length) return;
    try {
      const doc = bankDocument(available.bank, available.version);
      archiveSession(store.getState());
      dispatch(actions.load({ doc })); dispatch(actions.keyboard(true));
      setArchives(readArchive()); onAvailable(false); setMessage('دستهٔ جدید باز شد؛ جلسهٔ قبلی در همین مرورگر حفظ شد.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'ذخیرهٔ جلسهٔ قبلی ناموفق بود.'); }
  }
  function restore(saved: ArchivedSession) {
    try { const parsed = validateSession(JSON.parse(saved.data)); archiveSession(store.getState()); dispatch(actions.load(parsed)); setArchives(readArchive()); setMessage('جلسهٔ ذخیره‌شده باز شد.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'بازکردن جلسه ناموفق بود.'); }
  }
  const current = store.getState().doc.session;
  const same = available && current?.bankId === available.bank.bank_id && current.bankVersion === available.version;
  return <section className="setup-panel" lang="fa" dir="rtl" aria-label="بانک Google Drive" hidden={!open}>
    <h2>بانک سؤال در Google Drive</h2>
    <p>فایل خصوصی از حساب شخصی پروژه خوانده می‌شود. مجوز Google دسترسی فقط خواندن به فایل‌های Drive این حساب را به برنامه می‌دهد. هنگام اتصال، تغییرات هر ۳۰ ثانیه بررسی می‌شوند.</p>
    <label htmlFor="drive-client">شناسه OAuth برنامه</label><input id="drive-client" value={config.clientId} onChange={e => { token.current = ''; setConnected(false); setAvailable(null); onAvailable(false); setConfig({ ...config, clientId: e.target.value.trim() }); }} dir="ltr" autoComplete="off" />
    <p role="status" aria-live="polite">{message}</p>
    <div className="toolbar"><Button onClick={connect} disabled={busy || !ready}>{connected ? 'اتصال دوباره' : 'اتصال Google Drive'}</Button>{available && available.bank.questions.length > 0 && <Button onClick={startBank} disabled={!!same}>بازکردن دستهٔ دریافت‌شده</Button>}<Button onClick={close}>بستن</Button></div>
    <p>جلسهٔ در حال حل خودکار جایگزین نمی‌شود؛ هنگام بازکردن دستهٔ تازه، جلسهٔ قبلی در مرورگر ذخیره می‌شود. پس از انقضای مجوز ممکن است اتصال دوباره لازم باشد.</p>
    {archives.length > 0 && <details><summary>جلسه‌های ذخیره‌شده ({archives.length})</summary>{archives.map((a, index) => <div key={`${a.id}-${a.savedAt}-${index}`}><span dir="ltr">{a.id} · {a.savedAt}</span> <Button onClick={() => restore(a)}>ادامه</Button></div>)}</details>}
  </section>;
}
