import { GOOGLE_CLIENT_ID } from '../features/drive-bank/drive-config';
import { loadIdentity } from '../features/drive-bank/google';

type GoogleCredential = { credential?: string };
type GoogleIdApi = {
  initialize(options: { client_id: string; callback: (response: GoogleCredential) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void;
  renderButton(element: HTMLElement, options: Record<string, string | boolean>): void;
};

let initializedFor = '';
let tokenListener: ((token: string, expiresAt: number) => void) | undefined;
let cached: { token: string; expiresAt: number } | undefined;

function tokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof decoded.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp * 1_000 : 0;
  } catch { return 0; }
}

export async function mountGoogleIdButton(element: HTMLElement, listener: (token: string, expiresAt: number) => void): Promise<void> {
  await loadIdentity();
  const api = (window as Window & { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id;
  if (!api) throw new Error('ورود امن گوگل در این مرورگر بارگیری نشد.');
  tokenListener = listener;
  if (initializedFor !== GOOGLE_CLIENT_ID) {
    api.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response: GoogleCredential) => {
        const token = response.credential;
        if (!token) return;
        const expiresAt = tokenExpiry(token);
        if (!expiresAt || expiresAt <= Date.now()) return;
        cached = { token, expiresAt };
        tokenListener?.(token, expiresAt);
      },
    });
    initializedFor = GOOGLE_CLIENT_ID;
  }
  api.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'fa', logo_alignment: 'left' });
  if (cached && cached.expiresAt > Date.now() + 60_000) listener(cached.token, cached.expiresAt);
}

export function clearGoogleIdToken(): void { cached = undefined; }

export function googleIdTokenReady(): boolean { return !!cached && cached.expiresAt > Date.now() + 60_000; }
