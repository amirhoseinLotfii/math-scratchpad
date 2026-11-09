import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openMenuSubmenu } from '../support/menu';
import { readLegacyMigration, readOutboxCount } from '../support/indexeddb';
import { seedMockGoogleSession } from '../support/mock-google-session';

const API = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';
const LEGACY_KEY = 'math-scratchpad-lesson-progress-v1:bank%2F1:v21';
const LEGACY_VALUE = JSON.stringify({
  schemaVersion: 1,
  bankId: 'bank/1',
  bankVersion: 'v21',
  lessons: { '1.1': { status: 'learning', checkAnswers: { 'PC-1.1-C01-Q01': 'تابع' } } },
});

async function installWorker(page: Page) {
  const events: Array<{ seq: number; event: Record<string, any> }> = [];
  await page.route(`${API}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/events' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { events?: Array<Record<string, any>> };
      const acknowledgements = (body.events ?? []).map(event => {
        const existing = events.find(row => row.event.id === event.id);
        if (existing) return { id: event.id, seq: existing.seq, duplicate: true };
        const seq = events.length + 1; events.push({ seq, event });
        return { id: event.id, seq, duplicate: false };
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: acknowledgements, cursor: events.length }) });
      return;
    }
    if (url.pathname === '/snapshot' || url.pathname === '/sync') {
      const cursor = Number(url.searchParams.get('cursor') ?? 0), through = events.length;
      const rows = events.filter(row => row.seq > cursor && row.seq <= through).slice(0, Number(url.searchParams.get('limit') ?? 100));
      const next = rows.at(-1)?.seq ?? cursor;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: rows, cursor: next, through, snapshotCursor: through, hasMore: next < through }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
  return events;
}

test('legacy lesson progress stays intact until server chunks are verified and Drive backup is still required', { tag: '@only-laptop-1440' }, async ({ page }, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: LEGACY_KEY, value: LEGACY_VALUE });
  await seedMockGoogleSession(page);
  const serverEvents = await installWorker(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  await openMenuSubmenu(page, 'Data');
  await page.getByRole('menuitem', { name: /Cloud sync and migration/i }).press('Enter');

  const syncPanel = page.locator('section[aria-labelledby="sync-panel-title"]');
  await expect(syncPanel).toBeVisible();
  await expect(syncPanel).toHaveAttribute('lang', 'fa');
  await page.getByRole('button', { name: 'ارسال و راستی‌آزمایی داده‌های قدیمی' }).click();

  await expect(syncPanel.getByText(/تعداد بخش‌ها و هش هر داده با نسخهٔ سرور تطبیق داده شد/)).toBeVisible({ timeout: 15_000 });
  await expect(syncPanel.getByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' })).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), LEGACY_KEY)).toBe(LEGACY_VALUE);
  await expect.poll(() => readOutboxCount(page)).toBe(0);

  await testInfo.attach(`p0-3-migration-${testInfo.project.name}.png`, { body: await syncPanel.screenshot(), contentType: 'image/png' });

  const migrationEvents = serverEvents.filter(row => row.event.type === 'legacy_state_migration');
  expect(migrationEvents.length).toBeGreaterThan(0);
  expect(migrationEvents.every(row => row.event.migrationChunk.id && row.event.migrationChunk.sha256)).toBe(true);
  expect(migrationEvents.map(row => row.event.itemId)).toContain(LEGACY_KEY);
  expect(await readLegacyMigration(page)).toMatchObject({ status: 'server-verified', entries: [{ key: LEGACY_KEY, value: LEGACY_VALUE }] });
  expect(serverEvents.filter(row => row.event.migrationChunk).every(row => row.event.type === 'legacy_state_migration')).toBe(true);
});
