import type { BrowserContext } from '@playwright/test';
import { expect, test, type Page } from '../support/test';

const AUTH_ID_TOKEN_KEY = 'math-scratchpad-google-id-token-v1';
const AUTH_ID_HINT_KEY = 'math-scratchpad-google-id-session-v1';
const AUTH_DRIVE_TOKEN_KEY = 'math-scratchpad-drive-token-v1';

/** Same GIS + Drive fixture as server-first, installed on the browser context so a second tab inherits it. */
async function installGoogleAuthFixture(context: BrowserContext) {
  await context.addInitScript(() => {
    const handlers: { signIn?: (credential: { credential: string }) => void } = {};
    const testEmail = 'qa-fixture@example.test';
    const encoded = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, email: testEmail }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const fakeToken = 'head.' + encoded + '.signature';
    const expectedAccountHash = '5722e9ceb3077a549643b3e349b6b44058f422818edfddec115e9703a07fc024';
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'digest', {
      configurable: true,
      value: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        if (algorithm === 'SHA-256' && new TextDecoder().decode(data) === testEmail) {
          return Promise.resolve(Uint8Array.from(expectedAccountHash.match(/../g)!, byte => Number.parseInt(byte, 16)).buffer);
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
            initialize: (args: { callback: typeof handlers.signIn }) => { handlers.signIn = args.callback; },
            prompt: () => handlers.signIn?.({ credential: fakeToken }),
          },
        },
      },
    });
  });

  await context.route('https://math-scratchpad-sync.math-scratchpad-redux.workers.dev/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/state' && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: [], revision: 0 }),
      });
    }
    if (pathname === '/state' && request.method() === 'POST') {
      const input = request.postDataJSON() as { key: string; value: string | null; revision: number };
      const updatedAt = new Date().toISOString();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: input.key, revision: (input.revision ?? 0) + 1, updatedAt }),
      });
    }
    if (pathname === '/snapshot' || pathname === '/sync') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"events":[],"cursor":0,"through":0,"snapshotCursor":0,"hasMore":false}',
      });
    }
    if (pathname === '/events') {
      const events = (request.postDataJSON() as { events: Array<{ id: string }> }).events;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })),
          cursor: events.length,
        }),
      });
    }
    if (pathname === '/drive/status' || pathname === '/notion/status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"status":"synced","pendingCount":0,"lastSyncedAt":null,"lastError":null}',
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });

  await context.route('https://www.googleapis.com/oauth2/v3/userinfo', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ email: 'qa-fixture@example.test', email_verified: true }),
  }));
}

async function signInCombined(page: Page) {
  const connectionCard = page.locator('aside[aria-label="وضعیت همگام‌سازی"]');
  await connectionCard.getByRole('button', { name: 'ورود یکپارچهٔ Google و Drive' }).click();
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online');
}

async function readAuthKeys(page: Page) {
  return page.evaluate(keys => ({
    idToken: localStorage.getItem(keys.id),
    idHint: localStorage.getItem(keys.hint),
    driveToken: localStorage.getItem(keys.drive),
  }), { id: AUTH_ID_TOKEN_KEY, hint: AUTH_ID_HINT_KEY, drive: AUTH_DRIVE_TOKEN_KEY });
}

test('Google and Drive login persists in a new tab without signing in again', async ({ page, context }) => {
  await installGoogleAuthFixture(context);

  await page.goto('/?serverMode=1');
  await expect(page.getByText('Math Scratchpad', { exact: true })).toBeVisible();
  await signInCombined(page);

  const firstTabAuth = await readAuthKeys(page);
  expect(firstTabAuth.idToken).toBeTruthy();
  expect(firstTabAuth.idHint).toBe('1');
  expect(firstTabAuth.driveToken).toBeTruthy();

  // A second tab on the same origin must restore shared localStorage auth without another click.
  const other = await context.newPage();
  await other.goto('/?serverMode=1');
  await expect(other.getByText('Math Scratchpad', { exact: true })).toBeVisible();
  await expect(other.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online');
  await expect(other.getByRole('button', { name: 'ورود یکپارچهٔ Google و Drive' })).toHaveCount(0);

  const secondTabAuth = await readAuthKeys(other);
  expect(secondTabAuth.idToken).toBe(firstTabAuth.idToken);
  expect(secondTabAuth.idHint).toBe('1');
  expect(secondTabAuth.driveToken).toBe(firstTabAuth.driveToken);

  await other.close();
});
