import { test, expect, mathField, mathValue, clickMathKeys } from '../support/test';
import { readLearningCache } from '../support/indexeddb';
import { storageKey } from '../support/mobile-journey';
import { stepLatex } from '../../src/model';

const bankCacheKey = 'math-scratchpad-drive-bank-cache-v1:test';
const bankCacheValue = 'x'.repeat(260_000);

test('local-first editor keeps work editable offline, mirrors after sign-in, and restores Google auth after refresh', async ({ page }) => {
  const records = new Map<string, { value: string | null; revision: number; updatedAt: string }>();
  const calls: string[] = [];
  let bankCachePosts = 0;

  await page.addInitScript(({ key, value }) => {
    // Emulate Google Identity Services without authenticating a real account.
    const handlers: { signIn?: (credential: { credential: string }) => void } = {};
    const encoded = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const fakeToken = 'head.' + encoded + '.signature';
    Object.defineProperty(window, 'google', {
      configurable: true,
      value: {
        accounts: {
          oauth2: {},
          id: {
            initialize: (args: { callback: typeof handlers.signIn }) => { handlers.signIn = args.callback; },
            renderButton: (node: HTMLElement) => {
              const button = document.createElement('button');
              button.textContent = 'Test owner login';
              button.onclick = () => handlers.signIn?.({ credential: fakeToken });
              node.appendChild(button);
            },
          },
        },
      },
    });
    // Legacy cache is migrated into IndexedDB; it must never be mirrored to Worker /state.
    localStorage.setItem(key, value);
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<typeof indexedDB.open>) => {
      (window as unknown as { __dbOpens: number }).__dbOpens
        = ((window as unknown as { __dbOpens: number }).__dbOpens ?? 0) + 1;
      return originalOpen(...args);
    };
  }, { key: bankCacheKey, value: bankCacheValue });

  await page.route('https://math-scratchpad-sync.math-scratchpad-redux.workers.dev/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    calls.push(request.method() + ' ' + pathname);
    if (pathname === '/state' && request.method() === 'GET') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          records: [...records].map(([key, record]) => ({ key, ...record })),
          revision: records.size,
        }),
      });
    }
    if (pathname === '/state' && request.method() === 'POST') {
      const input = request.postDataJSON() as { key: string; value: string | null; revision: number };
      if (input.key === bankCacheKey) {
        bankCachePosts += 1;
        return route.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"payload_too_large"}' });
      }
      const revision = records.get(input.key)?.revision ?? 0;
      if (revision !== input.revision) {
        return route.fulfill({
          status: 409, contentType: 'application/json',
          body: JSON.stringify({ error: 'state_conflict', revision }),
        });
      }
      const updatedAt = new Date().toISOString();
      records.set(input.key, { value: input.value, revision: revision + 1, updatedAt });
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ key: input.key, revision: revision + 1, updatedAt }),
      });
    }
    if (pathname === '/snapshot' || pathname === '/sync') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: '{"events":[],"cursor":0,"through":0,"snapshotCursor":0,"hasMore":false}',
      });
    }
    if (pathname === '/events') {
      const events = (request.postDataJSON() as { events: Array<{ id: string }> }).events;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ events: events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: events.length }),
      });
    }
    if (pathname === '/drive/status' || pathname === '/notion/status') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: '{"status":"synced","pendingCount":0,"lastSyncedAt":null,"lastError":null}',
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });

  const readFirstStep = async () => {
    const raw = await readLearningCache(page, storageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { state?: { session?: { doc?: { exercises?: Array<{ steps?: unknown[] }> } } } };
    const step = saved.state?.session?.doc?.exercises?.[0]?.steps?.[0];
    return step ? stepLatex(step as never) : null;
  };

  await page.goto('/?serverMode=1');
  await expect(page.getByText('Math Scratchpad', { exact: true })).toBeVisible();
  await expect(page.getByText('Step 1', { exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __dbOpens?: number }).__dbOpens ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => readLearningCache(page, bankCacheKey)).toBe(bankCacheValue);

  // Practice is stored locally before sign-in.
  await clickMathKeys(page, '321');
  await expect.poll(readFirstStep).toContain('321');
  await page.reload();
  await expect.poll(() => mathValue(mathField(page))).toContain('321');

  const connectionCard = page.locator('aside[aria-label="وضعیت همگام‌سازی"]');
  await connectionCard.getByRole('button', { name: 'Test owner login' }).click();
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online');
  await expect.poll(() => records.has('math-scratchpad-session-v3')).toBeTruthy();
  expect(bankCachePosts).toBe(0);
  expect(calls).toContain('GET /state');

  // A refresh in the same tab restores an unexpired GIS token without another click.
  await page.reload();
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online');
  await expect.poll(() => mathValue(mathField(page))).toContain('321');

  // Server loss changes sync status, but does not lock local editing.
  await page.context().setOffline(true);
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'blocked');
  await expect(page.locator('[data-server-editor]')).not.toHaveAttribute('inert', '');
  await clickMathKeys(page, '456');
  await expect.poll(readFirstStep).toContain('456');
  await page.context().setOffline(false);
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online', { timeout: 15_000 });
  expect(bankCachePosts).toBe(0);
});