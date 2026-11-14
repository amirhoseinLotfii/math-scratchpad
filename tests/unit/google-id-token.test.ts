import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGoogleIdToken, ensureGoogleIdToken, getGoogleIdToken, googleIdTokenReady, mountGoogleIdButton, refreshGoogleIdTokenSilently } from '../../src/sync/google-id-token';

let credentialCallback: ((response: { credential?: string }) => void) | undefined;
let promptCredential = '';
let promptNotification = { isNotDisplayed: () => false, isSkippedMoment: () => false, isDismissedMoment: () => false };
const identityApi = {
  initialize: vi.fn((options: { callback: (response: { credential?: string }) => void }) => { credentialCallback = options.callback; }),
  renderButton: vi.fn((element: HTMLElement) => { element.textContent = 'Google sign-in'; }),
  prompt: vi.fn((callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean }) => void) => {
    callback?.(promptNotification);
    if (promptCredential) credentialCallback?.({ credential: promptCredential });
  }),
};
const google = { accounts: { oauth2: {}, id: identityApi } };

function encodedCredential(exp: number): string {
  const payload = btoa(JSON.stringify({ exp })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

function installGoogleApi(value: unknown) {
  Object.defineProperty(window, 'google', { configurable: true, value });
}

afterEach(() => {
  clearGoogleIdToken();
  vi.clearAllMocks();
  delete (window as Window & { google?: unknown }).google;
  credentialCallback = undefined;
  promptCredential = '';
  promptNotification = { isNotDisplayed: () => false, isSkippedMoment: () => false, isDismissedMoment: () => false };
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
});

describe('Google Identity Services ID-token session', () => {
  it('renders the Persian sign-in control, accepts only an unexpired credential, and reuses it in memory', async () => {
    installGoogleApi(google);
    const firstButton = document.createElement('div');
    const firstListener = vi.fn();
    const unregisterFirst = await mountGoogleIdButton(firstButton, firstListener);
    expect(firstButton.textContent).toBe('Google sign-in');
    expect(identityApi.renderButton).toHaveBeenCalledWith(firstButton, expect.objectContaining({ locale: 'fa', text: 'signin_with' }));
    expect(identityApi.initialize).toHaveBeenCalledTimes(1);
    expect(identityApi.initialize).toHaveBeenCalledWith(expect.objectContaining({ auto_select: true }));

    credentialCallback?.({ credential: 'not-a-jwt' });
    credentialCallback?.({ credential: encodedCredential(Math.floor(Date.now() / 1000) - 1) });
    expect(firstListener).not.toHaveBeenCalled();
    expect(googleIdTokenReady()).toBe(false);

    const token = encodedCredential(Math.floor(Date.now() / 1000) + 3600);
    credentialCallback?.({ credential: token });
    expect(identityApi.prompt).not.toHaveBeenCalled();
    expect(firstListener).toHaveBeenCalledWith(token, expect.any(Number));
    expect(googleIdTokenReady()).toBe(true);
    expect(getGoogleIdToken()).toBe(token);
    expect(localStorage.getItem('math-scratchpad-google-id-token-v1')).toBeTruthy();
    expect(localStorage.getItem('math-scratchpad-google-id-session-v1')).toBe('1');

    const secondButton = document.createElement('div');
    const secondListener = vi.fn();
    const unregisterSecond = await mountGoogleIdButton(secondButton, secondListener);
    expect(identityApi.initialize).toHaveBeenCalledTimes(1);
    expect(identityApi.renderButton).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenCalledWith(token, expect.any(Number));

    // Multiple visible Google buttons must all complete their owning connection flow.
    const refreshed = encodedCredential(Math.floor(Date.now() / 1000) + 4200);
    credentialCallback?.({ credential: refreshed });
    expect(firstListener).toHaveBeenLastCalledWith(refreshed, expect.any(Number));
    expect(secondListener).toHaveBeenLastCalledWith(refreshed, expect.any(Number));
    unregisterFirst();
    const refreshedAgain = encodedCredential(Math.floor(Date.now() / 1000) + 4800);
    credentialCallback?.({ credential: refreshedAgain });
    expect(firstListener).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenLastCalledWith(refreshedAgain, expect.any(Number));
    unregisterSecond();

    // A fresh module instance simulates a page reload; the tab session restores
    // the short-lived credential without asking the user to sign in again.
    vi.resetModules();
    const reloaded = await import('../../src/sync/google-id-token');
    expect(reloaded.getGoogleIdToken()).toBe(refreshedAgain);

    clearGoogleIdToken();
    expect(googleIdTokenReady()).toBe(false);
    expect(localStorage.getItem('math-scratchpad-google-id-token-v1')).toBeNull();
    expect(localStorage.getItem('math-scratchpad-google-id-session-v1')).toBeNull();
  });

  it('reports when the identity script loaded without the ID-token button API', async () => {
    installGoogleApi({ accounts: { oauth2: {} } });
    await expect(mountGoogleIdButton(document.createElement('div'), vi.fn())).rejects.toThrow(/ورود امن گوگل/);
  });

  it('restores a saved credential in a new tab from shared browser storage', async () => {
    const token = encodedCredential(Math.floor(Date.now() / 1000) + 3600);
    localStorage.setItem('math-scratchpad-google-id-token-v1', JSON.stringify({
      token,
      expiresAt: Date.now() + 3_600_000,
    }));
    sessionStorage.removeItem('math-scratchpad-google-id-token-v1');
    vi.resetModules();
    const otherTab = await import('../../src/sync/google-id-token');
    expect(otherTab.getGoogleIdToken()).toBe(token);
    expect(otherTab.googleIdTokenReady()).toBe(true);
    otherTab.clearGoogleIdToken();
    expect(localStorage.getItem('math-scratchpad-google-id-token-v1')).toBeNull();
    expect(sessionStorage.getItem('math-scratchpad-google-id-token-v1')).toBeNull();
  });

  it('migrates an older tab-only session into shared browser storage', async () => {
    const token = encodedCredential(Math.floor(Date.now() / 1000) + 3600);
    sessionStorage.setItem('math-scratchpad-google-id-token-v1', JSON.stringify({
      token,
      expiresAt: Date.now() + 3_600_000,
    }));
    localStorage.removeItem('math-scratchpad-google-id-token-v1');
    vi.resetModules();
    const migrated = await import('../../src/sync/google-id-token');
    expect(migrated.getGoogleIdToken()).toBe(token);
    expect(localStorage.getItem('math-scratchpad-google-id-token-v1')).toBeTruthy();
    expect(sessionStorage.getItem('math-scratchpad-google-id-token-v1')).toBeNull();
    migrated.clearGoogleIdToken();
  });

  it('silently refreshes an expired ID token when a prior session hint remains', async () => {
    const expired = encodedCredential(Math.floor(Date.now() / 1000) - 10);
    localStorage.setItem('math-scratchpad-google-id-token-v1', JSON.stringify({
      token: expired,
      expiresAt: Date.now() - 10_000,
    }));
    vi.resetModules();
    const identity = await import('../../src/sync/google-id-token');
    installGoogleApi(google);
    expect(identity.getGoogleIdToken()).toBeUndefined();
    expect(localStorage.getItem('math-scratchpad-google-id-session-v1')).toBe('1');

    promptCredential = encodedCredential(Math.floor(Date.now() / 1000) + 3600);
    await expect(identity.ensureGoogleIdToken()).resolves.toBe(promptCredential);
    expect(identityApi.prompt).toHaveBeenCalled();
    expect(identity.getGoogleIdToken()).toBe(promptCredential);
    expect(localStorage.getItem('math-scratchpad-google-id-token-v1')).toBeTruthy();
  });

  it('does not attempt a silent ID refresh when the user never signed in', async () => {
    vi.resetModules();
    const identity = await import('../../src/sync/google-id-token');
    installGoogleApi(google);
    await expect(identity.refreshGoogleIdTokenSilently()).resolves.toBeUndefined();
    expect(identityApi.prompt).not.toHaveBeenCalled();
    await expect(identity.ensureGoogleIdToken()).resolves.toBeUndefined();
  });

  it('treats a skipped One Tap moment as a failed silent refresh without throwing', async () => {
    localStorage.setItem('math-scratchpad-google-id-session-v1', '1');
    vi.resetModules();
    const identity = await import('../../src/sync/google-id-token');
    installGoogleApi(google);
    promptNotification = { isNotDisplayed: () => true, isSkippedMoment: () => false, isDismissedMoment: () => false };
    promptCredential = '';
    await expect(identity.refreshGoogleIdTokenSilently()).resolves.toBeUndefined();
    expect(identity.getGoogleIdToken()).toBeUndefined();
  });
});
