import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const API = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';

async function installFakeGoogle(page: Page) {
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `window.google = { accounts: { oauth2: {}, id: {
      initialize(options) { window.__testGoogleCallback = options.callback; },
      renderButton(element) {
        const button = document.createElement('button'); button.type='button'; button.textContent='Sign in with Google'; button.setAttribute('aria-label','Sign in with Google');
        button.addEventListener('click', () => { const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).replace(/=/g,''); window.__testGoogleCallback({ credential: 'header.'+payload+'.signature' }); });
        element.replaceChildren(button);
      }
    } } };`,
  }));
}

async function runMirrorStatusJourney(page: Page, testInfo: TestInfo) {
  const calls: string[] = [];
  let drive = { status: 'pending', pendingCount: 2, lastSyncedAt: '2026-11-02T01:00:00.000Z', lastError: null as string | null };
  let notion = { status: 'error', pendingCount: 1, lastSyncedAt: '2026-11-02T00:45:00.000Z', lastError: 'database_not_shared' as string | null };

  await installFakeGoogle(page);
  await page.route(`${API}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    calls.push(`${method} ${url.pathname}`);
    if (url.pathname === '/events' && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { events?: Array<{ id: string }> };
      const events = (body.events ?? []).map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false }));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events, cursor: events.length }) });
      return;
    }
    if (url.pathname === '/snapshot' || url.pathname === '/sync') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false }) });
      return;
    }
    if (url.pathname === '/drive/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(drive) });
      return;
    }
    if (url.pathname === '/notion/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notion) });
      return;
    }
    if (url.pathname === '/drive/sync' && method === 'POST') {
      drive = { status: 'synced', pendingCount: 0, lastSyncedAt: '2026-11-02T01:15:00.000Z', lastError: null };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ drive }) });
      return;
    }
    if (url.pathname === '/notion/sync' && method === 'POST') {
      notion = { status: 'error', pendingCount: 1, lastSyncedAt: '2026-11-02T00:45:00.000Z', lastError: 'schema_mismatch' };
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ notion }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Data', exact: true }).hover();
  await page.getByRole('menuitem', { name: /Cloud sync and migration/i }).press('Enter');
  const panel = page.locator('section[aria-labelledby="sync-panel-title"]');
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();

  const driveGroup = page.getByRole('group', { name: 'وضعیت Google Drive' });
  const notionGroup = page.getByRole('group', { name: 'وضعیت Notion' });
  await expect(driveGroup.getByText('در صف ارسال')).toBeVisible();
  await expect(driveGroup.getByText('2 رویداد در صف')).toBeVisible();
  await expect(notionGroup.getByText('ارسال ناموفق')).toBeVisible();
  await expect(notionGroup.getByText('1 رویداد در صف')).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include('section[aria-labelledby="sync-panel-title"]').analyze();
  expect(accessibility.violations.filter(issue => issue.impact === 'critical' || issue.impact === 'serious')).toEqual([]);

  await page.getByText('جزئیات آخرین همگام‌سازی و خطاها').click();
  await expect(panel.getByText('دیتابیس‌های لازم با Integration به‌اشتراک گذاشته نشده‌اند.')).toBeVisible();
  await page.getByRole('button', { name: 'همگام‌سازی الان' }).click();
  await expect(driveGroup.getByText('همگام‌شده')).toBeVisible();
  await expect(panel.getByText('ساختار یکی از دیتابیس‌های Notion با داده سازگار نیست.')).toBeVisible();
  expect(calls).toContain('POST /drive/sync');
  expect(calls).toContain('POST /notion/sync');
  expect(await panel.innerText()).not.toContain('NOTION_API_KEY');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await testInfo.attach(`p0-6-sync-status-${testInfo.project.name}.png`, { body: await panel.screenshot(), contentType: 'image/png' });
}

test('mobile 390 shows separate mirror states and allows safe manual sync', { tag: '@only-mobile-390' }, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await runMirrorStatusJourney(page, testInfo);
});

test('1280px desktop shows separate mirror states and allows safe manual sync', { tag: '@only-laptop-1440' }, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await runMirrorStatusJourney(page, testInfo);
});
