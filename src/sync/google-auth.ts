import { getConfig, readDriveSessionToken, requestToken, saveDriveSessionToken, type Token } from '../features/drive-bank/google';
import { GOOGLE_CLIENT_ID } from '../features/drive-bank/drive-config';
import { permittedAccount } from '../features/drive-bank/identity';
import { clearGoogleIdToken, getGoogleIdToken } from './google-id-token';
import { exchangeIdTokenForWorkerSessionOrThrow, getWorkerSession, type WorkerSession } from './worker-session';
import { clearDriveSessionToken } from '../features/drive-bank/google';
import { revokeWorkerSession } from './worker-session';
import { GoogleAuthError } from './google-auth-errors';
import { recordGoogleAuthDiagnostic } from './google-auth-diagnostics';

export type GoogleAuthCredentials = { idToken: string; workerSession: WorkerSession };

function idTokenEmail(token: string): string | undefined {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return undefined;
    const payload: unknown = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload || typeof payload !== 'object' || !('email' in payload) || typeof payload.email !== 'string') return undefined;
    return payload.email.trim().toLowerCase();
  } catch {
    return undefined;
  }
}

/** A visible GIS credential is accepted only after the Worker returns HTTP 201. */
export async function establishGoogleIdentitySession(idToken: string): Promise<GoogleAuthCredentials> {
  const workerSession = await exchangeIdTokenForWorkerSessionOrThrow(idToken);
  return { idToken, workerSession };
}

async function verifyDriveAccount(token: Token): Promise<{ token: Token; email: string }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new GoogleAuthError('network_error', response.status);
    const profile: unknown = await response.json();
    if (!await permittedAccount(profile)) throw new GoogleAuthError('account_mismatch');
    if (!profile || typeof profile !== 'object' || !('email' in profile) || typeof profile.email !== 'string') {
      throw new GoogleAuthError('account_mismatch');
    }
    return { token, email: profile.email.trim().toLowerCase() };
  } catch (problem) {
    if (problem instanceof GoogleAuthError) throw problem;
    if (controller.signal.aborted) throw new GoogleAuthError('network_timeout');
    throw new GoogleAuthError('network_error');
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Start the Drive OAuth popup synchronously from its own user click. Callers
 * must not await anything before invoking this function.
 */
export function requestDriveAccessTokenFromGesture(): Promise<Token> {
  const session = getWorkerSession();
  const idToken = getGoogleIdToken();
  const expectedEmail = idToken ? idTokenEmail(idToken) : undefined;
  if (!session || !idToken || !expectedEmail) {
    throw new GoogleAuthError('session_rejected', undefined, 'ابتدا با دکمهٔ رسمی Google وارد شو و منتظر تأیید نشست سرور بمان؛ سپس دسترسی Drive را جداگانه بده.');
  }
  const saved = readDriveSessionToken();
  if (saved && saved.expiresAt > Date.now() + 60_000) return Promise.resolve(saved);
  if (!getConfig().clientId) throw new GoogleAuthError('prompt_unavailable');

  const tokenRequest = new Promise<Token>((resolve, reject) => {
    requestToken(GOOGLE_CLIENT_ID, { prompt: '', hint: expectedEmail }, result => {
      if (!result.token) {
        const code = result.errorCode ?? 'network_error';
        recordGoogleAuthDiagnostic(code);
        reject(new GoogleAuthError(code));
        return;
      }
      void verifyDriveAccount(result.token).then(profile => {
        if (profile.email !== expectedEmail) {
          recordGoogleAuthDiagnostic('account_mismatch');
          reject(new GoogleAuthError('account_mismatch'));
          return;
        }
        saveDriveSessionToken(result.token!);
        recordGoogleAuthDiagnostic('drive_authorized');
        resolve(result.token!);
      }).catch(reject);
    });
  });
  return tokenRequest;
}

/** Logout on this device: revoke the Worker session server-side and drop every saved Google credential. */
export async function signOutGoogle(): Promise<void> {
  try { await revokeWorkerSession(); }
  finally {
    clearGoogleIdToken();
    clearDriveSessionToken();
  }
}
