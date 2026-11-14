import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/drive-bank/identity', () => ({ permittedAccount: vi.fn(async () => true) }));

import { permittedAccount } from '../../src/features/drive-bank/identity';
import { clearDriveSessionToken, ensureDriveSessionToken, readDriveSessionToken, refreshDriveSessionTokenSilently } from '../../src/features/drive-bank/google';
import { establishGoogleIdentitySession, requestDriveAccessTokenFromGesture } from '../../src/sync/google-auth';
import { clearGoogleIdToken, commitGoogleIdToken, getGoogleIdToken } from '../../src/sync/google-id-token';
import { resetWorkerSessionForTests } from '../../src/sync/worker-session';

const SESSION = `mss1.${'S'.repeat(43)}`;
const SESSION_EXPIRY = () => Date.now() + 7 * 24 * 60 * 60_000;

function credential(exp: number, email = 'owner@example.test'): string {
  const payload = btoa(JSON.stringify({ exp, email })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

function installDriveOauth(accessToken = 'drive-access-token') {
  let tokenClientConfig: {
    callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
    error_callback?: (error: { type?: string }) => void;
  };
  const tokenClient = {
    requestAccessToken: vi.fn((opts?: { prompt?: string }) => {
      tokenClientConfig.callback({ access_token: accessToken, expires_in: 3600 });
      return opts;
    }),
  };
  const oauth2 = {
    initTokenClient: vi.fn((config: typeof tokenClientConfig) => {
      tokenClientConfig = config;
      return tokenClient;
    }),
    hasGrantedAllScopes: vi.fn(() => true),
  };
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: { accounts: { oauth2, id: { initialize: vi.fn(), prompt: vi.fn(), renderButton: vi.fn() } } },
  });
  return { oauth2, tokenClient };
}

afterEach(async () => {
  clearGoogleIdToken();
  clearDriveSessionToken();
  await resetWorkerSessionForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { google?: unknown }).google;
  localStorage.clear();
  sessionStorage.clear();
});

describe('split Google identity and Drive authorization', () => {
  it('creates the Worker session from the ID token and requires HTTP 201', async () => {
    const idToken = credential(Math.floor(Date.now() / 1000) + 3600);
    const fetcher = vi.fn(async () => Response.json({ sessionToken: SESSION, expiresAt: SESSION_EXPIRY() }, { status: 201 })) as unknown as typeof fetch;
    await resetWorkerSessionForTests({ fetcher });
    commitGoogleIdToken(idToken);

    const result = await establishGoogleIdentitySession(idToken);

    expect(result.idToken).toBe(idToken);
    expect(result.workerSession.token).toBe(SESSION);
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/session$/), expect.objectContaining({
      method: 'POST', headers: { Authorization: `Bearer ${idToken}` },
    }));
    expect(getGoogleIdToken()).toBe(idToken);
  });

  it('surfaces a rejected session status instead of opening Drive authorization', async () => {
    const idToken = credential(Math.floor(Date.now() / 1000) + 3600);
    const fetcher = vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 403 })) as unknown as typeof fetch;
    await resetWorkerSessionForTests({ fetcher });
    commitGoogleIdToken(idToken);

    await expect(establishGoogleIdentitySession(idToken)).rejects.toMatchObject({
      code: 'session_rejected', status: 403,
    });
    expect(readDriveSessionToken()).toBeUndefined();
  });

  it('starts the Drive token request synchronously after a verified Worker session', async () => {
    const idToken = credential(Math.floor(Date.now() / 1000) + 3600);
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/session')) return Response.json({ sessionToken: SESSION, expiresAt: SESSION_EXPIRY() }, { status: 201 });
      return Response.json({ email: 'owner@example.test', email_verified: true }, { status: 200 });
    }) as unknown as typeof fetch;
    await resetWorkerSessionForTests({ fetcher });
    vi.stubGlobal('fetch', fetcher);
    commitGoogleIdToken(idToken);
    const { oauth2, tokenClient } = installDriveOauth();
    await establishGoogleIdentitySession(idToken);

    const request = requestDriveAccessTokenFromGesture();
    expect(oauth2.initTokenClient).toHaveBeenCalledTimes(1);
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1);
    expect(tokenClient.requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
    await expect(request).resolves.toMatchObject({ accessToken: 'drive-access-token' });
    expect(calls.map(url => url.endsWith('/session') ? 'session' : 'userinfo')).toEqual(['session', 'userinfo']);
    expect(readDriveSessionToken()?.accessToken).toBe('drive-access-token');
    expect(localStorage.getItem('math-scratchpad-drive-consent-v1')).toBe('1');
    expect(permittedAccount).toHaveBeenCalledWith({ email: 'owner@example.test', email_verified: true });
  });

  it('rejects a Drive account that differs from the identity session', async () => {
    const idToken = credential(Math.floor(Date.now() / 1000) + 3600, 'other@example.test');
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/session')
      ? Response.json({ sessionToken: SESSION, expiresAt: SESSION_EXPIRY() }, { status: 201 })
      : Response.json({ email: 'owner@example.test', email_verified: true }, { status: 200 })) as unknown as typeof fetch;
    await resetWorkerSessionForTests({ fetcher });
    vi.stubGlobal('fetch', fetcher);
    commitGoogleIdToken(idToken);
    installDriveOauth();
    await establishGoogleIdentitySession(idToken);

    await expect(requestDriveAccessTokenFromGesture()).rejects.toMatchObject({ code: 'account_mismatch' });
    expect(readDriveSessionToken()).toBeUndefined();
  });
});

describe('Drive access-token silent refresh', () => {
  it('silently mints a Drive token with prompt: \'\' after prior consent when the saved token expired', async () => {
    localStorage.setItem('math-scratchpad-drive-token-v1', JSON.stringify({
      accessToken: 'stale-drive-token',
      expiresAt: Date.now() - 1_000,
    }));
    const { tokenClient } = installDriveOauth('rotated-drive-token');

    expect(readDriveSessionToken()).toBeUndefined();
    expect(localStorage.getItem('math-scratchpad-drive-consent-v1')).toBe('1');

    const refreshed = await ensureDriveSessionToken();
    expect(refreshed?.accessToken).toBe('rotated-drive-token');
    expect(readDriveSessionToken()?.accessToken).toBe('rotated-drive-token');
    expect(tokenClient.requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('does not request a Drive token when consent was never granted', async () => {
    const { tokenClient } = installDriveOauth();
    await expect(refreshDriveSessionTokenSilently()).resolves.toBeUndefined();
    expect(tokenClient.requestAccessToken).not.toHaveBeenCalled();
    await expect(ensureDriveSessionToken()).resolves.toBeUndefined();
  });
});
