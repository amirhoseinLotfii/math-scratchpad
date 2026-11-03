import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGoogleIdToken, googleIdTokenReady, mountGoogleIdButton } from '../../src/sync/google-id-token';

let credentialCallback: ((response: { credential?: string }) => void) | undefined;
const identityApi = {
  initialize: vi.fn((options: { callback: (response: { credential?: string }) => void }) => { credentialCallback = options.callback; }),
  renderButton: vi.fn((element: HTMLElement) => { element.textContent = 'Google sign-in'; }),
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
  document.body.replaceChildren();
});

describe('Google Identity Services ID-token session', () => {
  it('renders the Persian sign-in control, accepts only an unexpired credential, and reuses it in memory', async () => {
    installGoogleApi(google);
    const firstButton = document.createElement('div');
    const firstListener = vi.fn();
    await mountGoogleIdButton(firstButton, firstListener);
    expect(firstButton.textContent).toBe('Google sign-in');
    expect(identityApi.renderButton).toHaveBeenCalledWith(firstButton, expect.objectContaining({ locale: 'fa', text: 'signin_with' }));
    expect(identityApi.initialize).toHaveBeenCalledTimes(1);

    credentialCallback?.({ credential: 'not-a-jwt' });
    credentialCallback?.({ credential: encodedCredential(Math.floor(Date.now() / 1000) - 1) });
    expect(firstListener).not.toHaveBeenCalled();
    expect(googleIdTokenReady()).toBe(false);

    const token = encodedCredential(Math.floor(Date.now() / 1000) + 3600);
    credentialCallback?.({ credential: token });
    expect(firstListener).toHaveBeenCalledWith(token, expect.any(Number));
    expect(googleIdTokenReady()).toBe(true);

    const secondButton = document.createElement('div');
    const secondListener = vi.fn();
    await mountGoogleIdButton(secondButton, secondListener);
    expect(identityApi.initialize).toHaveBeenCalledTimes(1);
    expect(identityApi.renderButton).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenCalledWith(token, expect.any(Number));
    clearGoogleIdToken();
    expect(googleIdTokenReady()).toBe(false);
  });

  it('reports when the identity script loaded without the ID-token button API', async () => {
    installGoogleApi({ accounts: { oauth2: {} } });
    await expect(mountGoogleIdButton(document.createElement('div'), vi.fn())).rejects.toThrow(/ورود امن گوگل/);
  });
});
