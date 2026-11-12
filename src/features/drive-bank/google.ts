/* Browser-only Google sign-in (GIS token model) and Google Picker. No client secret, no refresh token, nothing stored server-side. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
import { GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID } from './drive-config';
import { getLearningStorage } from '../../sync/browser-db';
import { announceGoogleAuthStateChanged, clearAuthRecord, GOOGLE_AUTH_STATE_EVENT, readAuthRecord, writeAuthRecord } from '../../sync/google-auth-state';
export const SCOPES = `openid email ${DRIVE_SCOPE}`;
export const DRIVE_CONFIG_KEY = 'math-scratchpad-drive-config-v1';
/** Built-in public identifiers (see drive-config.ts) plus the picked file, which stays in this browser. */
export type DriveConfig = { clientId: string; apiKey: string; appId: string; fileId: string; fileName: string };
export function getConfig(): DriveConfig {
  let v: Record<string, unknown> = {};
  try { v = JSON.parse(getLearningStorage().getItem(DRIVE_CONFIG_KEY) ?? '{}') ?? {}; } catch { /* ignore */ }
  const s = (k: string) => typeof v[k] === 'string' ? v[k] as string : '';
  // Only the picked file is read from storage; any old saved clientId/apiKey/appId is ignored.
  return { clientId: GOOGLE_CLIENT_ID, apiKey: GOOGLE_API_KEY, appId: GOOGLE_APP_ID, fileId: s('fileId'), fileName: s('fileName') };
}
export function saveConfig(c: Pick<DriveConfig, 'fileId' | 'fileName'>) { getLearningStorage().setItem(DRIVE_CONFIG_KEY, JSON.stringify({ fileId: c.fileId, fileName: c.fileName })); }

/* eslint-disable @typescript-eslint/no-explicit-any */
type G = any;
declare global { interface Window { google?: G; gapi?: G } }
const loaded = new Map<string, Promise<void>>();
function script(src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  if (!loaded.has(src)) loaded.set(src, new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src; el.async = true;
    el.onload = () => resolve(); el.onerror = () => { loaded.delete(src); reject(Error('Google services could not be loaded. Check your internet connection or content blocker.')); };
    document.head.appendChild(el);
  }));
  return loaded.get(src)!;
}
export const loadIdentity = () => script('https://accounts.google.com/gsi/client', () => !!window.google?.accounts?.oauth2);
export async function loadPicker(): Promise<void> {
  await script('https://apis.google.com/js/api.js', () => !!window.gapi);
  if (window.google?.picker) return;
  await new Promise<void>((resolve, reject) => window.gapi.load('picker', { callback: resolve, onerror: () => reject(Error('Google Picker could not be loaded.')) }));
}
const GIS_ERRORS: Record<string, string> = {
  popup_closed: 'The Google window closed before authorization was granted.',
  popup_failed_to_open: 'The browser could not open the Google window. In Chrome for Android, allow pop-ups for this site in Settings → Site settings → Pop-ups, then try again.',
  unknown: 'Google connection failed.',
};
export type GoogleDrivePopupErrorCode = 'prompt_unavailable' | 'popup_blocked' | 'user_cancelled' | 'network_error';
export type Token = { accessToken: string; expiresAt: number };

const DRIVE_TOKEN_SESSION_KEY = 'math-scratchpad-drive-token-v1';
const DRIVE_CONSENT_KEY = 'math-scratchpad-drive-consent-v1';
const DRIVE_REFRESH_SKEW_MS = 5 * 60_000;
let cachedDriveToken: Token | undefined;
let driveRefreshFlight: Promise<Token | undefined> | undefined;

function hasDriveConsent(): boolean {
  return readAuthRecord(DRIVE_CONSENT_KEY) === '1';
}

function markDriveConsent(): void {
  writeAuthRecord(DRIVE_CONSENT_KEY, '1');
}

function clearDriveConsent(): void {
  clearAuthRecord(DRIVE_CONSENT_KEY);
}

/** Short-lived Drive credential shared across tabs in this browser; it survives refresh and a new tab until it expires. */
export function readDriveSessionToken(): Token | undefined {
  if (cachedDriveToken && cachedDriveToken.expiresAt > Date.now()) return cachedDriveToken;
  cachedDriveToken = undefined;
  try {
    const raw = readAuthRecord(DRIVE_TOKEN_SESSION_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('Invalid Drive token cache.');
    const record = value as { accessToken?: unknown; expiresAt?: unknown };
    if (typeof record.accessToken !== 'string' || !record.accessToken
      || typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)) throw new Error('Invalid Drive token cache.');
    if (record.expiresAt <= Date.now()) {
      // Consent remains so requestAccessToken({ prompt: '' }) can mint a fresh token.
      markDriveConsent();
      clearAuthRecord(DRIVE_TOKEN_SESSION_KEY);
      return undefined;
    }
    markDriveConsent();
    cachedDriveToken = { accessToken: record.accessToken, expiresAt: record.expiresAt };
    return cachedDriveToken;
  } catch {
    clearAuthRecord(DRIVE_TOKEN_SESSION_KEY);
    return undefined;
  }
}

export function saveDriveSessionToken(token: Token): void {
  if (!token.accessToken || token.expiresAt <= Date.now()) return;
  cachedDriveToken = token;
  writeAuthRecord(DRIVE_TOKEN_SESSION_KEY, JSON.stringify(token));
  markDriveConsent();
  announceGoogleAuthStateChanged();
}

export function clearDriveSessionToken(): void {
  cachedDriveToken = undefined;
  clearAuthRecord(DRIVE_TOKEN_SESSION_KEY);
  clearDriveConsent();
  announceGoogleAuthStateChanged();
}

if (typeof window !== 'undefined') {
  window.addEventListener(GOOGLE_AUTH_STATE_EVENT, () => {
    cachedDriveToken = undefined;
    readDriveSessionToken();
  });
}
/** Must be called directly inside a tap handler, otherwise Android Chrome blocks the popup. */
export function requestToken(clientId: string, opts: { prompt?: '' | 'consent' | 'select_account'; hint?: string }, done: (r: { token?: Token; error?: string; errorCode?: GoogleDrivePopupErrorCode }) => void) {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) { done({ error: 'ورود Google هنوز در این مرورگر آماده نیست. صفحه را دوباره بارگیری کن و دوباره تلاش کن.', errorCode: 'prompt_unavailable' }); return; }
  const client = oauth2.initTokenClient({
    client_id: clientId, scope: SCOPES, include_granted_scopes: false, ...(opts.hint ? { login_hint: opts.hint } : {}),
    error_callback: (e: { type?: string }) => {
      const type = e?.type ?? 'unknown';
      const errorCode = type === 'popup_failed_to_open' ? 'popup_blocked'
        : type === 'popup_closed' ? 'user_cancelled' : 'network_error';
      done({ error: GIS_ERRORS[type] ?? GIS_ERRORS.unknown, errorCode });
    },
    callback: (r: { access_token?: string; expires_in?: number | string; error?: string; error_description?: string }) => {
      if (r.error || !r.access_token) {
        done({ error: r.error === 'access_denied' ? 'Access was denied. If Google shows “App not verified” or “Access blocked”, the personal account may need to be added as a test user.' : `Google returned an error: ${r.error ?? 'no access token'}`, errorCode: r.error === 'access_denied' ? 'user_cancelled' : 'network_error' });
        return;
      }
      if (!oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) { done({ error: 'Google Drive access was not granted. Reconnect and approve the requested permission.', errorCode: 'user_cancelled' }); return; }
      done({ token: { accessToken: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 - 60000 } });
    },
  });
  client.requestAccessToken({ prompt: opts.prompt ?? '' });
}

/**
 * Mint a fresh Drive access token with prompt: '' when the user previously granted
 * consent. Returns undefined when Google requires a visible re-authorization.
 */
export function refreshDriveSessionTokenSilently(): Promise<Token | undefined> {
  const saved = readDriveSessionToken();
  if (saved && saved.expiresAt > Date.now() + DRIVE_REFRESH_SKEW_MS) return Promise.resolve(saved);
  if (!saved && !hasDriveConsent()) return Promise.resolve(undefined);
  if (driveRefreshFlight) return driveRefreshFlight;

  driveRefreshFlight = (async () => {
    try {
      await loadIdentity();
      return await new Promise<Token | undefined>(resolve => {
        requestToken(GOOGLE_CLIENT_ID, { prompt: '' }, result => {
          if (result.token) {
            saveDriveSessionToken(result.token);
            resolve(result.token);
          } else {
            resolve(undefined);
          }
        });
      });
    } catch {
      return undefined;
    } finally {
      driveRefreshFlight = undefined;
    }
  })();
  return driveRefreshFlight;
}

/** Return a usable Drive token, attempting a silent GIS refresh when the saved one is expired or near expiry. */
export async function ensureDriveSessionToken(): Promise<Token | undefined> {
  const saved = readDriveSessionToken();
  if (saved && saved.expiresAt > Date.now() + DRIVE_REFRESH_SKEW_MS) return saved;
  if (!saved && !hasDriveConsent()) return undefined;
  const refreshed = await refreshDriveSessionTokenSilently();
  return refreshed ?? readDriveSessionToken();
}

/** Opens Google Picker so the user grants this app (drive.file) access to just the chosen file. */
export function pickFile(cfg: DriveConfig, token: string, done: (r: { id?: string; name?: string; error?: string }) => void) {
  const p = window.google?.picker;
  if (!p) { done({ error: 'Google Picker is not ready.' }); return; }
  const view = new p.DocsView(p.ViewId.DOCS).setMimeTypes('application/json,text/plain').setMode(p.DocsViewMode.LIST).setQuery('MATH_QUESTION_BANK.json');
  new p.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId).setOrigin(window.location.origin)
    .setLocale('en').setTitle('Select MATH_QUESTION_BANK.json').setCallback((data: any) => {
      if (data.action === p.Action.PICKED) { const d = data.docs?.[0]; done(d?.id ? { id: d.id, name: d.name } : { error: 'No file was selected.' }); }
      else if (data.action === p.Action.CANCEL) done({ error: 'File selection was canceled.' });
    }).build().setVisible(true);
}

/** Lets the owner select a private Drive folder for one-time learning-data backups. */
export function pickBackupFolder(cfg: DriveConfig, token: string, done: (r: { id?: string; name?: string; error?: string }) => void) {
  const p = window.google?.picker;
  if (!p) { done({ error: 'Google Picker is not ready.' }); return; }
  const view = new p.DocsView(p.ViewId.FOLDERS).setSelectFolderEnabled(true).setMode(p.DocsViewMode.LIST);
  new p.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId).setOrigin(window.location.origin)
    .setLocale('fa').setTitle('پوشهٔ خصوصی پشتیبان را انتخاب کن').setCallback((data: any) => {
      if (data.action === p.Action.PICKED) { const d = data.docs?.[0]; done(d?.id ? { id: d.id, name: d.name } : { error: 'No folder was selected.' }); }
      else if (data.action === p.Action.CANCEL) done({ error: 'Folder selection was canceled.' });
    }).build().setVisible(true);
}
