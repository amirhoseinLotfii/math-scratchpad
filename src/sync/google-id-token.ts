import { GOOGLE_CLIENT_ID } from '../features/drive-bank/drive-config';
import { loadIdentity } from '../features/drive-bank/google';
import { announceGoogleAuthStateChanged, clearAuthRecord, GOOGLE_AUTH_STATE_EVENT, readAuthRecord, writeAuthRecord } from './google-auth-state';

type GoogleCredential = { credential?: string };
type PromptMomentNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
};
type GoogleIdApi = {
  initialize(options: { client_id: string; callback: (response: GoogleCredential) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void;
  renderButton(element: HTMLElement, options: Record<string, string | boolean>): void;
  prompt(callback?: (notification: PromptMomentNotification) => void): void;
};

let initializedFor = '';
let initializedApi: GoogleIdApi | undefined;
const tokenListeners = new Set<(token: string, expiresAt: number) => void>();
const credentialWaiters = new Set<(token: string, expiresAt: number) => void>();
let standaloneButtonCount = 0;
let cached: { token: string; expiresAt: number } | undefined;
const SESSION_TOKEN_KEY = 'math-scratchpad-google-id-token-v1';

function restoreSessionToken(): { token: string; expiresAt: number } | undefined {
  try {
    const raw = readAuthRecord(SESSION_TOKEN_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('invalid session token');
    const record = value as { token?: unknown; expiresAt?: unknown };
    if (typeof record.token !== 'string' || typeof record.expiresAt !== 'number') throw new Error('invalid session token');
    const expiresAt = Math.min(record.expiresAt, tokenExpiry(record.token));
    if (!expiresAt || expiresAt <= Date.now() + 60_000) {
      clearAuthRecord(SESSION_TOKEN_KEY);
      return undefined;
    }
    return { token: record.token, expiresAt };
  } catch {
    clearAuthRecord(SESSION_TOKEN_KEY);
    return undefined;
  }
}

function persistSessionToken(value: { token: string; expiresAt: number }): void {
  writeAuthRecord(SESSION_TOKEN_KEY, JSON.stringify(value));
}

function tokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof decoded.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp * 1_000 : 0;
  } catch { return 0; }
}

function getGoogleIdApi(): GoogleIdApi | undefined {
  return (window as Window & { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id;
}

function initializeGoogleIdClient(): GoogleIdApi {
  const api = getGoogleIdApi();
  if (!api) throw new Error('ورود امن گوگل در این مرورگر بارگیری نشد.');
  if (initializedFor !== GOOGLE_CLIENT_ID || initializedApi !== api) {
    api.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: true,
      cancel_on_tap_outside: true,
      callback: (response: GoogleCredential) => {
        const token = response.credential;
        if (!token) return;
        const expiresAt = tokenExpiry(token);
        if (!expiresAt || expiresAt <= Date.now()) return;
        if (credentialWaiters.size) {
          for (const waiter of [...credentialWaiters]) waiter(token, expiresAt);
          return;
        }
        if (!standaloneButtonCount) return;
        cached = { token, expiresAt };
        persistSessionToken(cached);
        for (const tokenListener of [...tokenListeners]) tokenListener(token, expiresAt);
        announceGoogleAuthStateChanged();
      },
    });
    initializedFor = GOOGLE_CLIENT_ID;
    initializedApi = api;
  }
  return api;
}

function addTokenListener(listener: (token: string, expiresAt: number) => void): () => void {
  tokenListeners.add(listener);
  const saved = getGoogleIdTokenRecord();
  if (saved) listener(saved.token, saved.expiresAt);
  return () => { tokenListeners.delete(listener); };
}

export async function prepareGoogleIdClient(): Promise<void> {
  await loadIdentity();
  initializeGoogleIdClient();
}

export async function subscribeGoogleIdToken(listener: (token: string, expiresAt: number) => void): Promise<() => void> {
  await prepareGoogleIdClient();
  return addTokenListener(listener);
}

export async function mountGoogleIdButton(element: HTMLElement, listener: (token: string, expiresAt: number) => void): Promise<() => void> {
  await prepareGoogleIdClient();
  // StrictMode and fast state changes can start overlapping mounts while GIS loads.
  // Clear the target first so only one Google button remains in the connection card.
  element.replaceChildren();
  getGoogleIdApi()?.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'fa', logo_alignment: 'left' });
  standaloneButtonCount += 1;
  const unsubscribe = addTokenListener(listener);
  return () => { standaloneButtonCount -= 1; unsubscribe(); };
}

/** Call from a user gesture after prepareGoogleIdClient; GIS may show its One Tap account prompt. */
export function requestGoogleIdCredential(): Promise<{ token: string; expiresAt: number }> {
  const saved = getGoogleIdTokenRecord();
  if (saved) return Promise.resolve(saved);
  let api: GoogleIdApi;
  try { api = initializeGoogleIdClient(); }
  catch { return Promise.reject(new Error('ورود گوگل هنوز آماده نیست. چند لحظه صبر کن و دوباره تلاش کن.')); }

  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    let timeout = 0;
    const finish = (problem?: Error, value?: { token: string; expiresAt: number }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe();
      if (problem) reject(problem);
      else if (value) resolve(value);
      else reject(new Error('Google did not return an account credential.'));
    };
    const listener = (token: string, expiresAt: number) => finish(undefined, { token, expiresAt });
    credentialWaiters.add(listener);
    unsubscribe = () => { credentialWaiters.delete(listener); };
    timeout = window.setTimeout(() => finish(new Error('Google account sign-in timed out. Try again and complete the Google prompt.')), 30_000);
    try {
      api.prompt(notification => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
          finish(new Error('Google account sign-in was not completed. Allow the Google prompt, then try again.'));
        }
      });
    } catch (problem) {
      finish(problem instanceof Error ? problem : new Error('Google account sign-in could not be started.'));
    }
  });
}

function getGoogleIdTokenRecord(): { token: string; expiresAt: number } | undefined {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;
  cached = restoreSessionToken();
  return cached;
}

export function getGoogleIdToken(): string | undefined {
  return getGoogleIdTokenRecord()?.token;
}

export function commitGoogleIdToken(token: string): void {
  const expiresAt = tokenExpiry(token);
  if (!expiresAt || expiresAt <= Date.now() + 60_000) {
    throw new Error('Google returned an expired account credential.');
  }
  cached = { token, expiresAt };
  persistSessionToken(cached);
  for (const tokenListener of [...tokenListeners]) tokenListener(token, expiresAt);
  announceGoogleAuthStateChanged();
}

export function clearGoogleIdToken(): void {
  cached = undefined;
  clearAuthRecord(SESSION_TOKEN_KEY);
  announceGoogleAuthStateChanged();
}

export function googleIdTokenReady(): boolean { return !!getGoogleIdTokenRecord(); }

if (typeof window !== 'undefined') {
  window.addEventListener(GOOGLE_AUTH_STATE_EVENT, () => {
    cached = restoreSessionToken();
  });
}
