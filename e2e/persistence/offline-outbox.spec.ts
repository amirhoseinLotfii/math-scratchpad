import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readOutboxCount, readOutboxEvents } from '../support/indexeddb';
import { GOOGLE_AUTH_BUTTON_NAME, installFakeGoogleAuth, openSyncPanel } from '../support/sync-panel';
import { LEARNING_RESET_EPOCH } from '../../src/sync/learning-reset-epoch';

const API = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';

async function installSyncWorker(page: Page, getOnline: () => boolean, posted: Array<Record<string, unknown>>) {
  const server: Array<{ seq: number; event: Record<string, unknown> }> = [];
  await page.route(`${API}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/reset/status' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'idle', epoch: LEARNING_RESET_EPOCH }),
      });
      return;
    }
    if (url.pathname === '/session' && request.method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ sessionToken: `mss1.${'S'.repeat(43)}`, expiresAt: Date.now() + 7 * 24 * 60 * 60_000 }) });
      return;
    }
    if (!getOnline()) { await route.abort('internetdisconnected'); return; }
    if (url.pathname === '/events' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { events?: Array<Record<string, unknown>> };
      const acknowledgements = (body.events ?? []).map(event => {
        posted.push(event);
        const previous = server.find(item => item.event.id === event.id);
        if (previous) return { id: event.id, seq: previous.seq, duplicate: true };
        const seq = server.length + 1; server.push({ seq, event });
        return { id: event.id, seq, duplicate: false };
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: acknowledgements, cursor: server.length }) });
      return;
    }
    if (url.pathname === '/snapshot' || url.pathname === '/sync') {
      const cursor = Number(url.searchParams.get('cursor') ?? 0), through = server.length;
      const events = server.filter(item => item.seq > cursor && item.seq <= through).slice(0, Number(url.searchParams.get('limit') ?? 100));
      const next = events.at(-1)?.seq ?? cursor;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events, cursor: next, through, snapshotCursor: through, hasMore: next < through }) });
      return;
    }
    if (url.pathname === '/drive/status' || url.pathname === '/notion/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'not_configured', pendingCount: server.length, lastSyncedAt: null, lastError: null,
      }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
}

async function runOfflineAnswerJourney(page: Page, testInfo: TestInfo) {
  let online = false;
  const posted: Array<Record<string, unknown>> = [];
  await installFakeGoogleAuth(page);
  await installSyncWorker(page, () => online, posted);
  const syncPanel = await openSyncPanel(page);
  const accessibility = await new AxeBuilder({ page }).include('section[aria-labelledby="sync-panel-title"]').analyze();
  expect(accessibility.violations.filter(issue => issue.impact === 'critical' || issue.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: GOOGLE_AUTH_BUTTON_NAME }).click();
  await expect.poll(() => page.getByText(/اتصال برقرار نیست|تلاش دوباره/).count()).toBeGreaterThan(0);
  await expect.poll(() => readOutboxCount(page)).toBeGreaterThan(0);

  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  // Replace the seeded expression and emit MathLive's real input event. The
  // editor interaction itself is covered in mathlive.spec; this test focuses on
  // the persistence → outbox → acknowledgement path while the API is offline.
  await field.evaluate(element => {
    const mathfield = element as HTMLElement & { value: string };
    mathfield.value = '5';
    mathfield.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe('5');
  await expect.poll(async () => (await readOutboxEvents(page)).some(event => event.type === 'step_edited' && event.steps?.includes('5'))).toBe(true);

  await testInfo.attach(`p0-3-sync-${testInfo.project.name}.png`, { body: await syncPanel.screenshot(), contentType: 'image/png' });
  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => readOutboxCount(page), { timeout: 10_000 }).toBe(0);
  expect(posted.some(event => event.type === 'step_edited' && String(event.steps ?? '').includes('5'))).toBe(true);
  await expect(syncPanel.getByText(/همگام‌شده با سرور/)).toBeVisible();
}

test('offline math answer is durably queued and appears in the server event log after reconnect', { tag: '@only-mobile-390' }, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await runOfflineAnswerJourney(page, testInfo);
});

test('desktop offline math answer is queued, acknowledged, and rendered in the sync status', { tag: '@only-laptop-1440' }, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await runOfflineAnswerJourney(page, testInfo);
});

test('1280px desktop keeps the offline sync panel usable and readable', { tag: '@only-laptop-1440' }, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await runOfflineAnswerJourney(page, testInfo);
});
