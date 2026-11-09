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
let silentRefreshFlight: Promise<{ token: string; expiresAt: number } | undefined> | undefined;
const SESSION_TOKEN_KEY = 'math-scratchpad-google-id-token-v1';
const SESSION_HINT_KEY = 'math-scratchpad-google-id-session-v1';
/** Prefer a silent refresh when less than this remains on the saved credential. */
const REFRESH_SKEW_MS = 5 * 60_000;
/** Do not hand callers a credential that expires sooner than this. */
const USABLE_SKEW_MS = 60_000;
const SILENT_REFRESH_TIMEOUT_MS = 8_000;

function hasGoogleIdSessionHint(): boolean {
  return readAuthRecord(SESSION_HINT_KEY) === '1';
}

function markGoogleIdSessionHint(): void {
  writeAuthRecord(SESSION_HINT_KEY, '1');
}

function clearGoogleIdSessionHint(): void {
  clearAuthRecord(SESSION_HINT_KEY);
}

function restoreSessionToken(): { token: string; expiresAt: number } | undefined {
  try {
    const raw = readAuthRecord(SESSION_TOKEN_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('invalid session token');
    const record = value as { token?: unknown; expiresAt?: unknown };
    if (typeof record.token !== 'string' || typeof record.expiresAt !== 'number') throw new Error('invalid session token');
    const expiresAt = Math.min(record.expiresAt, tokenExpiry(record.token));
    if (!expiresAt || expiresAt <= Date.now() + USABLE_SKEW_MS) {
      // Keep the session hint so a later silent GIS prompt can restore the login.
      markGoogleIdSessionHint();
      clearAuthRecord(SESSION_TOKEN_KEY);
      return undefined;
    }
    markGoogleIdSessionHint();
    return { token: record.token, expiresAt };
  } catch {
    clearAuthRecord(SESSION_TOKEN_KEY);
    return undefined;
  }
}

function persistSessionToken(value: { token: string; expiresAt: number }): void {
  writeAuthRecord(SESSION_TOKEN_KEY, JSON.stringify(value));
  markGoogleIdSessionHint();
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

function acceptCredential(token: string, expiresAt: number, persist: boolean): void {
  if (persist) {
    cached = { token, expiresAt };
    persistSessionToken(cached);
  }
  for (const tokenListener of [...tokenListeners]) tokenListener(token, expiresAt);
  if (persist) announceGoogleAuthStateChanged();
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
        acceptCredential(token, expiresAt, true);
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

function maybeStartSilentRefresh(): void {
  const saved = getGoogleIdTokenRecord();
  if (saved && saved.expiresAt > Date.now() + REFRESH_SKEW_MS) return;
  if (!saved && !hasGoogleIdSessionHint()) return;
  void refreshGoogleIdTokenSilently();
}

export async function prepareGoogleIdClient(): Promise<void> {
  await loadIdentity();
  initializeGoogleIdClient();
  maybeStartSilentRefresh();
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
export async function requestGoogleIdCredential(): Promise<{ token: string; expiresAt: number }> {
  const saved = getGoogleIdTokenRecord();
  if (saved) return saved;
  if (silentRefreshFlight) {
    const refreshed = await silentRefreshFlight;
    if (refreshed) return refreshed;
  }
  let api: GoogleIdApi;
  try { api = initializeGoogleIdClient(); }
  catch { throw new Error('ورود گوگل هنوز آماده نیست. چند لحظه صبر کن و دوباره تلاش کن.'); }

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

/**
 * Ask GIS for a fresh ID token without a visible login when Google still has an
 * active session for this site (auto_select + prompt). Resolves undefined when
 * silent re-auth is unavailable; a visible sign-in is then expected.
 */
export function refreshGoogleIdTokenSilently(): Promise<{ token: string; expiresAt: number } | undefined> {
  const fresh = getGoogleIdTokenRecord();
  if (fresh && fresh.expiresAt > Date.now() + REFRESH_SKEW_MS) return Promise.resolve(fresh);
  if (!fresh && !hasGoogleIdSessionHint()) return Promise.resolve(undefined);
  if (silentRefreshFlight) return silentRefreshFlight;

  silentRefreshFlight = (async () => {
    try {
      await loadIdentity();
      let api: GoogleIdApi;
      try { api = initializeGoogleIdClient(); }
      catch { return undefined; }

      return await new Promise<{ token: string; expiresAt: number } | undefined>(resolve => {
        let settled = false;
        let timeout = 0;
        const finish = (value?: { token: string; expiresAt: number }) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          credentialWaiters.delete(listener);
          if (value) acceptCredential(value.token, value.expiresAt, true);
          resolve(value);
        };
        const listener = (token: string, expiresAt: number) => finish({ token, expiresAt });
        credentialWaiters.add(listener);
        timeout = window.setTimeout(() => finish(undefined), SILENT_REFRESH_TIMEOUT_MS);
        try {
          api.prompt(notification => {
            if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
              finish(undefined);
            }
          });
        } catch {
          finish(undefined);
        }
      });
    } finally {
      silentRefreshFlight = undefined;
    }
  })();
  return silentRefreshFlight;
}

/** Return a usable ID token, attempting a silent GIS refresh when the saved one is expired or near expiry. */
export async function ensureGoogleIdToken(): Promise<string | undefined> {
  const saved = getGoogleIdTokenRecord();
  if (saved && saved.expiresAt > Date.now() + REFRESH_SKEW_MS) return saved.token;
  if (!saved && !hasGoogleIdSessionHint()) return undefined;
  const refreshed = await refreshGoogleIdTokenSilently();
  if (refreshed) return refreshed.token;
  return getGoogleIdTokenRecord()?.token;
}

function getGoogleIdTokenRecord(): { token: string; expiresAt: number } | undefined {
  if (cached && cached.expiresAt > Date.now() + USABLE_SKEW_MS) return cached;
  cached = restoreSessionToken();
  return cached;
}

export function getGoogleIdToken(): string | undefined {
  return getGoogleIdTokenRecord()?.token;
}

export function commitGoogleIdToken(token: string): void {
  const expiresAt = tokenExpiry(token);
  if (!expiresAt || expiresAt <= Date.now() + USABLE_SKEW_MS) {
    throw new Error('Google returned an expired account credential.');
  }
  acceptCredential(token, expiresAt, true);
}

export function clearGoogleIdToken(): void {
  cached = undefined;
  clearAuthRecord(SESSION_TOKEN_KEY);
  clearGoogleIdSessionHint();
  announceGoogleAuthStateChanged();
}

export function googleIdTokenReady(): boolean { return !!getGoogleIdTokenRecord(); }

if (typeof window !== 'undefined') {
  window.addEventListener(GOOGLE_AUTH_STATE_EVENT, () => {
    cached = restoreSessionToken();
  });
}
