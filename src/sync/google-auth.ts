import { clearDriveSessionToken, ensureDriveSessionToken, getConfig, requestToken, saveDriveSessionToken, type Token } from '../features/drive-bank/google';
import { permittedAccount } from '../features/drive-bank/identity';
import { clearGoogleIdToken, commitGoogleIdToken, getGoogleIdToken, requestGoogleIdCredential } from './google-id-token';
import { revokeWorkerSession } from './worker-session';

export type GoogleAuthCredentials = { idToken: string; driveToken: Token };

function requestDriveToken(): Promise<Token> {
  return ensureDriveSessionToken().then(saved => {
    if (saved) return saved;
    return new Promise((resolve, reject) => {
      requestToken(getConfig().clientId, {}, result => {
        if (result.token) resolve(result.token);
        else reject(new Error(result.error ?? 'Google Drive authorization failed.'));
      });
    });
  });
}

async function verifyDriveAccount(token: Token): Promise<{ token: Token; email: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: 'no-store',
  });
  const profile: unknown = response.ok ? await response.json() : null;
  if (!await permittedAccount(profile)) {
    throw new Error('The selected Google Drive account is not authorized for this project.');
  }
  if (!profile || typeof profile !== 'object' || !('email' in profile) || typeof profile.email !== 'string') {
    throw new Error('Google did not return the authorized Drive account email.');
  }
  return { token, email: profile.email.trim().toLowerCase() };
}

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

function failureMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Google authorization failed.';
}

/** Starts both Google authorization flows synchronously from one user gesture. */
export async function requestCombinedGoogleAuth(): Promise<GoogleAuthCredentials> {
  const identity = requestGoogleIdCredential();
  const drive = requestDriveToken().then(verifyDriveAccount);
  const [identityResult, driveResult] = await Promise.allSettled([identity, drive]);
  if (identityResult.status === 'rejected' || driveResult.status === 'rejected') {
    const failures = [
      identityResult.status === 'rejected' ? `Google account: ${failureMessage(identityResult.reason)}` : '',
      driveResult.status === 'rejected' ? `Google Drive: ${failureMessage(driveResult.reason)}` : '',
    ].filter(Boolean);
    throw new Error(failures.join(' '));
  }
  const idToken = getGoogleIdToken() ?? identityResult.value.token;
  const accountEmail = idTokenEmail(idToken);
  if (!accountEmail || accountEmail !== driveResult.value.email) {
    throw new Error('Google account and Drive authorized different accounts. Choose the same Google account in both prompts.');
  }
  saveDriveSessionToken(driveResult.value.token);
  commitGoogleIdToken(idToken);
  return { idToken, driveToken: driveResult.value.token };
}

/** Logout on this device: revoke the Worker session server-side and drop every saved Google credential. */
export async function signOutGoogle(): Promise<void> {
  try { await revokeWorkerSession(); }
  finally {
    clearGoogleIdToken();
    clearDriveSessionToken();
  }
}
