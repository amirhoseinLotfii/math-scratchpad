import { GOOGLE_CLIENT_ID } from '../features/drive-bank/drive-config';
import { loadIdentity } from '../features/drive-bank/google';

type GoogleCredential = { credential?: string };
type GoogleIdApi = {
  initialize(options: { client_id: string; callback: (response: GoogleCredential) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void;
  renderButton(element: HTMLElement, options: Record<string, string | boolean>): void;
};

let initializedFor = '';
const tokenListeners = new Set<(token: string, expiresAt: number) => void>();
let cached: { token: string; expiresAt: number } | undefined;
const SESSION_TOKEN_KEY = 'math-scratchpad-google-id-token-v1';

function restoreSessionToken(): { token: string; expiresAt: number } | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('invalid session token');
    const record = value as { token?: unknown; expiresAt?: unknown };
    if (typeof record.token !== 'string' || typeof record.expiresAt !== 'number') throw new Error('invalid session token');
    const expiresAt = Math.min(record.expiresAt, tokenExpiry(record.token));
    if (!expiresAt || expiresAt <= Date.now() + 60_000) {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      return undefined;
    }
    return { token: record.token, expiresAt };
  } catch {
    try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* Storage may be blocked. */ }
    return undefined;
  }
}

function persistSessionToken(value: { token: string; expiresAt: number }): void {
  try { sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(value)); }
  catch { /* The in-memory credential still works for this page. */ }
}

function tokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof decoded.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp * 1_000 : 0;
  } catch { return 0; }
}

export async function mountGoogleIdButton(element: HTMLElement, listener: (token: string, expiresAt: number) => void): Promise<() => void> {
  await loadIdentity();
  const api = (window as Window & { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id;
  if (!api) throw new Error('ورود امن گوگل در این مرورگر بارگیری نشد.');
  if (initializedFor !== GOOGLE_CLIENT_ID) {
    api.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: true,
      cancel_on_tap_outside: true,
      callback: (response: GoogleCredential) => {
        const token = response.credential;
        if (!token) return;
        const expiresAt = tokenExpiry(token);
        if (!expiresAt || expiresAt <= Date.now()) return;
        cached = { token, expiresAt };
        persistSessionToken(cached);
        for (const tokenListener of [...tokenListeners]) tokenListener(token, expiresAt);
      },
    });
    initializedFor = GOOGLE_CLIENT_ID;
  }
  api.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'fa', logo_alignment: 'left' });
  tokenListeners.add(listener);
  const saved = getGoogleIdTokenRecord();
  if (saved) listener(saved.token, saved.expiresAt);
  return () => { tokenListeners.delete(listener); };
}

function getGoogleIdTokenRecord(): { token: string; expiresAt: number } | undefined {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;
  cached = restoreSessionToken();
  return cached;
}

export function getGoogleIdToken(): string | undefined {
  return getGoogleIdTokenRecord()?.token;
}

export function clearGoogleIdToken(): void {
  cached = undefined;
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* Storage may be blocked. */ }
}

export function googleIdTokenReady(): boolean { return !!getGoogleIdTokenRecord(); }
