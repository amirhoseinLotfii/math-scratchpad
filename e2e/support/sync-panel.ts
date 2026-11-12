import { expect, type Page } from '@playwright/test';

export const GOOGLE_AUTH_BUTTON_NAME = 'Sign in with Google';

export async function installFakeGoogleAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const handlers: { signIn?: (credential: { credential: string }) => void } = {};
    const testEmail = 'qa-fixture@example.test';
    const encoded = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, email: testEmail }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const fakeToken = `head.${encoded}.signature`;
    const allowlistedTestHash = '5722e9ceb3077a549643b3e349b6b44058f422818edfddec115e9703a07fc024';
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'digest', {
      configurable: true,
      value: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        if (algorithm === 'SHA-256' && new TextDecoder().decode(data) === testEmail) {
          return Promise.resolve(Uint8Array.from(allowlistedTestHash.match(/../g)!, byte => Number.parseInt(byte, 16)).buffer);
        }
        return originalDigest(algorithm, data);
      },
    });
    Object.defineProperty(window, 'google', {
      configurable: true,
      value: {
        accounts: {
          oauth2: {
            initTokenClient: (options: { callback: (response: { access_token: string; expires_in: number }) => void }) => ({
              requestAccessToken: () => options.callback({ access_token: 'test-drive-token', expires_in: 3600 }),
            }),
            hasGrantedAllScopes: () => true,
          },
          id: {
            initialize: (options: { callback: typeof handlers.signIn }) => { handlers.signIn = options.callback; },
            prompt: () => handlers.signIn?.({ credential: fakeToken }),
            renderButton: (element: HTMLElement) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = 'Sign in with Google';
              button.setAttribute('aria-label', 'Sign in with Google');
              button.addEventListener('click', () => handlers.signIn?.({ credential: fakeToken }));
              element.replaceChildren(button);
            },
          },
        },
      },
    });
  });
  await page.route('https://www.googleapis.com/oauth2/v3/userinfo', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ email: 'qa-fixture@example.test', email_verified: true }),
  }));
}

export async function openSyncPanel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  const dataMenu = page.getByRole('menuitem', { name: 'Data', exact: true });
  const cloudSync = page.getByRole('menuitem', { name: /Cloud sync and migration/i });
  if ((page.viewportSize()?.width ?? 1280) < 600) {
    await dataMenu.tap();
    await cloudSync.tap();
  } else {
    await dataMenu.hover();
    await cloudSync.press('Enter');
  }
  const panel = page.locator('section[aria-labelledby="sync-panel-title"]');
  await expect(panel).toBeVisible();
  return panel;
}
