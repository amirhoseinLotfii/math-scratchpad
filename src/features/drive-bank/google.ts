/* Browser-only Google sign-in (GIS token model) and Google Picker. No client secret, no refresh token, nothing stored server-side. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
import { GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID } from './drive-config';
export const SCOPES = `openid email ${DRIVE_SCOPE}`;
const CONFIG_KEY = 'math-scratchpad-drive-config-v1';
/** Built-in public identifiers (see drive-config.ts) plus the picked file, which stays in this browser. */
export type DriveConfig = { clientId: string; apiKey: string; appId: string; fileId: string; fileName: string };
export function getConfig(): DriveConfig {
  let v: Record<string, unknown> = {};
  try { v = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') ?? {}; } catch { /* ignore */ }
  const s = (k: string) => typeof v[k] === 'string' ? v[k] as string : '';
  // Only the picked file is read from storage; any old saved clientId/apiKey/appId is ignored.
  return { clientId: GOOGLE_CLIENT_ID, apiKey: GOOGLE_API_KEY, appId: GOOGLE_APP_ID, fileId: s('fileId'), fileName: s('fileName') };
}
export function saveConfig(c: Pick<DriveConfig, 'fileId' | 'fileName'>) { localStorage.setItem(CONFIG_KEY, JSON.stringify({ fileId: c.fileId, fileName: c.fileName })); }

/* eslint-disable @typescript-eslint/no-explicit-any */
type G = any;
declare global { interface Window { google?: G; gapi?: G } }
const loaded = new Map<string, Promise<void>>();
function script(src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  if (!loaded.has(src)) loaded.set(src, new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src; el.async = true;
    el.onload = () => resolve(); el.onerror = () => { loaded.delete(src); reject(Error('سرویس Google بارگیری نشد؛ اینترنت یا مسدودکنندهٔ تبلیغات را بررسی کن.')); };
    document.head.appendChild(el);
  }));
  return loaded.get(src)!;
}
export const loadIdentity = () => script('https://accounts.google.com/gsi/client', () => !!window.google?.accounts?.oauth2);
export async function loadPicker(): Promise<void> {
  await script('https://apis.google.com/js/api.js', () => !!window.gapi);
  if (window.google?.picker) return;
  await new Promise<void>((resolve, reject) => window.gapi.load('picker', { callback: resolve, onerror: () => reject(Error('Google Picker بارگیری نشد.')) }));
}
const GIS_ERRORS: Record<string, string> = {
  popup_closed: 'پنجرهٔ Google بسته شد و مجوزی داده نشد.',
  popup_failed_to_open: 'مرورگر پنجرهٔ Google را باز نکرد. در Chrome اندروید: منوی ⋮ ← Settings ← Site settings ← Pop-ups را برای این سایت مجاز کن و دوباره بزن.',
  unknown: 'اتصال Google انجام نشد.',
};
export type Token = { accessToken: string; expiresAt: number };
/** Must be called directly inside a tap handler, otherwise Android Chrome blocks the popup. */
export function requestToken(clientId: string, opts: { prompt?: '' | 'consent' | 'select_account'; hint?: string }, done: (r: { token?: Token; error?: string }) => void) {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) { done({ error: 'سرویس ورود Google هنوز آماده نیست؛ چند ثانیه بعد دوباره بزن.' }); return; }
  const client = oauth2.initTokenClient({
    client_id: clientId, scope: SCOPES, include_granted_scopes: false, ...(opts.hint ? { login_hint: opts.hint } : {}),
    error_callback: (e: { type?: string }) => done({ error: GIS_ERRORS[e?.type ?? 'unknown'] ?? GIS_ERRORS.unknown }),
    callback: (r: { access_token?: string; expires_in?: number | string; error?: string; error_description?: string }) => {
      if (r.error || !r.access_token) { done({ error: r.error === 'access_denied' ? 'اجازه داده نشد. اگر پیام «App not verified/Access blocked» دیدی، حساب شخصی باید در Test users باشد.' : `Google خطا داد: ${r.error ?? 'بدون توکن'}` }); return; }
      if (!oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) { done({ error: 'تیک دسترسی Drive را در صفحهٔ Google نزدی؛ دوباره وصل شو و آن را تأیید کن.' }); return; }
      done({ token: { accessToken: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 - 60000 } });
    },
  });
  client.requestAccessToken({ prompt: opts.prompt ?? '' });
}
/** Opens Google Picker so the user grants this app (drive.file) access to just the chosen file. */
export function pickFile(cfg: DriveConfig, token: string, done: (r: { id?: string; name?: string; error?: string }) => void) {
  const p = window.google?.picker;
  if (!p) { done({ error: 'Google Picker آماده نیست.' }); return; }
  const view = new p.DocsView(p.ViewId.DOCS).setMimeTypes('application/json,text/plain').setMode(p.DocsViewMode.LIST).setQuery('MATH_QUESTION_BANK.json');
  new p.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId).setOrigin(window.location.origin)
    .setTitle('فایل MATH_QUESTION_BANK.json را انتخاب کن').setCallback((data: any) => {
      if (data.action === p.Action.PICKED) { const d = data.docs?.[0]; done(d?.id ? { id: d.id, name: d.name } : { error: 'فایلی انتخاب نشد.' }); }
      else if (data.action === p.Action.CANCEL) done({ error: 'انتخاب فایل لغو شد.' });
    }).build().setVisible(true);
}
