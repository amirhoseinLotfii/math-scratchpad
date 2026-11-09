import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/drive-bank/identity', () => ({ permittedAccount: vi.fn(async () => true) }));

import { permittedAccount } from '../../src/features/drive-bank/identity';
import { clearDriveSessionToken, ensureDriveSessionToken, readDriveSessionToken, refreshDriveSessionTokenSilently } from '../../src/features/drive-bank/google';
import { requestCombinedGoogleAuth } from '../../src/sync/google-auth';
import { clearGoogleIdToken, getGoogleIdToken, subscribeGoogleIdToken } from '../../src/sync/google-id-token';

let credentialCallback: ((response: { credential?: string }) => void) | undefined;

function credential(exp: number): string {
  const payload = btoa(JSON.stringify({ exp, email: 'owner@example.test' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

afterEach(() => {
  clearGoogleIdToken();
  clearDriveSessionToken();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { google?: unknown }).google;
  credentialCallback = undefined;
  localStorage.clear();
  sessionStorage.clear();
});

describe('combined Google authorization', () => {
  it('obtains and persists the server ID token and scoped Drive token from one request', async () => {
    const idToken = credential(Math.floor(Date.now() / 1000) + 3600);
    const tokenClient = {
      requestAccessToken: vi.fn(() => {
        tokenClientConfig.callback({ access_token: 'drive-access-token', expires_in: 3600 });
      }),
    };
    let tokenClientConfig: { callback: (response: { access_token?: string; expires_in?: number }) => void };
    const oauth2 = {
      initTokenClient: vi.fn((config: typeof tokenClientConfig) => {
        tokenClientConfig = config;
        return tokenClient;
      }),
      hasGrantedAllScopes: vi.fn(() => true),
    };
    const identity = {
      initialize: vi.fn((options: { callback: (response: { credential?: string }) => void }) => { credentialCallback = options.callback; }),
      renderButton: vi.fn(),
      prompt: vi.fn((callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean }) => void) => {
        callback?.({ isNotDisplayed: () => false, isSkippedMoment: () => false, isDismissedMoment: () => false });
        credentialCallback?.({ credential: idToken });
      }),
    };
    Object.defineProperty(window, 'google', { configurable: true, value: { accounts: { oauth2, id: identity } } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ email: 'owner@example.test', email_verified: true }), { status: 200 })));
    const tokenListener = vi.fn();
    const unsubscribe = await subscribeGoogleIdToken(tokenListener);

    const result = await requestCombinedGoogleAuth();

    expect(result.idToken).toBe(idToken);
    expect(result.driveToken.accessToken).toBe('drive-access-token');
    expect(getGoogleIdToken()).toBe(idToken);
    expect(readDriveSessionToken()?.accessToken).toBe('drive-access-token');
    expect(localStorage.getItem('math-scratchpad-drive-consent-v1')).toBe('1');
    expect(tokenListener).toHaveBeenCalledWith(idToken, expect.any(Number));
    unsubscribe();
    expect(permittedAccount).toHaveBeenCalledWith({ email: 'owner@example.test', email_verified: true });
    expect(oauth2.initTokenClient).toHaveBeenCalledWith(expect.objectContaining({ scope: expect.stringContaining('https://www.googleapis.com/auth/drive.file') }));
    expect(tokenClient.requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('rejects credentials from different Google accounts without persisting the Drive token', async () => {
    const idToken = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, email: 'another@example.test' }))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    let tokenCallback: ((response: { credential?: string }) => void) | undefined;
    let driveCallback: ((response: { access_token?: string; expires_in?: number }) => void) | undefined;
    const identity = {
      initialize: vi.fn((options: { callback: (response: { credential?: string }) => void }) => { tokenCallback = options.callback; }),
      prompt: vi.fn(() => tokenCallback?.({ credential: `header.${idToken}.signature` })),
    };
    const oauth2 = {
      initTokenClient: vi.fn((options: { callback: (response: { access_token?: string; expires_in?: number }) => void }) => {
        driveCallback = options.callback;
        return { requestAccessToken: () => driveCallback?.({ access_token: 'drive-access-token', expires_in: 3600 }) };
      }),
      hasGrantedAllScopes: vi.fn(() => true),
    };
    Object.defineProperty(window, 'google', { configurable: true, value: { accounts: { oauth2, id: identity } } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ email: 'owner@example.test', email_verified: true }), { status: 200 })));
    const tokenListener = vi.fn();
    const unsubscribe = await subscribeGoogleIdToken(tokenListener);

    await expect(requestCombinedGoogleAuth()).rejects.toThrow(/different accounts/);
    expect(readDriveSessionToken()).toBeUndefined();
    expect(getGoogleIdToken()).toBeUndefined();
    expect(tokenListener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('Drive access-token silent refresh', () => {
  function installDriveOauth(accessToken = 'fresh-drive-token') {
    let tokenClientConfig: {
      callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
      error_callback?: (error: { type?: string }) => void;
    };
    const tokenClient = {
      requestAccessToken: vi.fn((opts?: { prompt?: string }) => {
        expect(opts).toEqual({ prompt: '' });
        tokenClientConfig.callback({ access_token: accessToken, expires_in: 3600 });
      }),
    };
    const oauth2 = {
      initTokenClient: vi.fn((config: typeof tokenClientConfig) => {
        tokenClientConfig = config;
        return tokenClient;
      }),
      hasGrantedAllScopes: vi.fn(() => true),
    };
    Object.defineProperty(window, 'google', { configurable: true, value: { accounts: { oauth2, id: { initialize: vi.fn(), prompt: vi.fn(), renderButton: vi.fn() } } } });
    return { oauth2, tokenClient };
  }

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
