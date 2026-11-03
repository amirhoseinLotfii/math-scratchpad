import { test, expect } from '@playwright/test';

test('server-first editor requires owner sign-in, writes snapshots to Worker, and never opens IndexedDB', async ({ page }) => {
  const records = new Map<string, { value: string | null; revision: number }>();
  const calls: string[] = [];
  let stateReachable = true;
  let databaseOpens = 0;
  await page.addInitScript(() => {
    // Emulate only the public Google Identity Services API, not Google account authentication.
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
    // All attempts to persist to browser databases are errors in this mode.
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<typeof indexedDB.open>) => {
      (window as unknown as { __dbOpens: number }).__dbOpens
        = ((window as unknown as { __dbOpens: number }).__dbOpens ?? 0) + 1;
      return originalOpen(...args);
    };
    localStorage.setItem = () => { throw new Error('localStorage writes must not be used in server mode'); };
  });
  await page.route('https://math-scratchpad-sync.math-scratchpad-redux.workers.dev/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    calls.push(request.method() + ' ' + pathname);
    if (pathname === '/state' && request.method() === 'GET') {
      if (!stateReachable) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ records: [...records].map(([key, value]) => ({ key, ...value })), revision: records.size }) });
    }
    if (pathname === '/state' && request.method() === 'POST') {
      const input = request.postDataJSON() as { key: string; value: string | null; revision: number };
      const revision = records.get(input.key)?.revision ?? 0;
      if (revision !== input.revision) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'state_conflict', revision }) });
      }
      records.set(input.key, { value: input.value, revision: revision + 1 });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: input.key, revision: revision + 1 }) });
    }
    if (pathname === '/snapshot' || pathname === '/sync') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false }) });
    }
    if (pathname === '/events') {
      const events = (request.postDataJSON() as { events: Array<{ id: string }> }).events;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ events: events.map((x, i) => ({ id: x.id, seq: i + 1, duplicate: false })), cursor: events.length }) });
    }
    if (pathname === '/drive/status' || pathname === '/notion/status') {
      if (pathname === '/drive/status' && !stateReachable) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'synced', pendingCount: 0, lastSyncedAt: new Date().toISOString(), lastError: null }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });

  await page.goto('/?serverMode=1');
  await expect(page.getByText('Math Scratchpad', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test owner login' })).toBeVisible();
  await expect(page.getByText('Step 1')).toHaveCount(0);
  await page.getByRole('button', { name: 'Test owner login' }).click();
  await expect(page.getByText('Step 1', { exact: true }).first()).toBeVisible();
  await expect.poll(() => records.has('math-scratchpad-session-v3')).toBeTruthy();
  expect(calls).toContain('GET /state');
  expect(calls).toContain('POST /state');
  databaseOpens = await page.evaluate(() => (window as unknown as { __dbOpens?: number }).__dbOpens ?? 0);
  expect(databaseOpens).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: 'Test owner login' }).click();
  await expect(page.getByText('Step 1', { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online');
  expect(await page.evaluate(() => (window as unknown as { __dbOpens?: number }).__dbOpens ?? 0)).toBe(0);

  // A network disconnection must make every underlying edit control inert.
  await page.context().setOffline(true);
  const warning = page.getByRole('alertdialog', { name: 'ویرایش به‌دلیل قطع ارتباط با سرور متوقف شده' });
  await expect(warning).toBeVisible();
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('inert', '');
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'blocked');
  await page.context().setOffline(false);
  await expect(warning).toBeHidden({ timeout: 15000 });
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online');
  // Browser online alone is insufficient; a failing authenticated Worker must block edits too.
  stateReachable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(warning).toBeVisible();
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('inert', '');
  stateReachable = true;
  await warning.getByRole('button', { name: 'بررسی دوباره اتصال' }).click();
  await expect(warning).toBeHidden({ timeout: 15000 });
});
