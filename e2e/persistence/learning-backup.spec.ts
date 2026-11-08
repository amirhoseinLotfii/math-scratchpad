import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const CACHE_KEY = 'math-scratchpad-lesson-progress-v1:backup-bank:v21';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

async function openSyncPanel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: 'Data', exact: true }).click();
  await page.getByRole('menuitem', { name: /Cloud sync and migration/i }).click();
  const panel = page.locator('section[aria-labelledby="sync-panel-title"]');
  await expect(panel).toBeVisible();
  return panel;
}

async function seedLearningRecords(page: Page) {
  await page.evaluate(async ({ cacheKey, eventId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('math-scratchpad-sync-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['cache', 'outbox', 'serverEvents', 'meta'], 'readwrite');
    tx.objectStore('cache').put({
      key: cacheKey,
      value: JSON.stringify({ schemaVersion: 1, bankId: 'backup-bank', bankVersion: 'v21', lessons: {}, lessonPanelEvents: [] }),
      updatedAt: '2026-11-02T09:00:00.000Z',
    });
    const event = {
      id: eventId, schema: 1, ts: '2026-11-02T09:00:00.000Z', deviceId: '11111111-1111-4111-8111-111111111111',
      bankVersion: 'v21', session: 'backup-e2e', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations',
      type: 'check_answer', itemId: 'q-1', userAnswer: '{(1,2),(2,4)}', verdict: 'submitted', verdictSource: 'none',
    };
    tx.objectStore('outbox').put({ id: eventId, event, queuedAt: event.ts });
    tx.objectStore('meta').put({ key: 'server-cursor', value: 0 });
    tx.objectStore('meta').put({ key: 'snapshot-initialized', value: true });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    db.close();
  }, { cacheKey: CACHE_KEY, eventId: EVENT_ID });
}

async function clearLearningRecords(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('math-scratchpad-sync-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['cache', 'outbox', 'serverEvents', 'meta'], 'readwrite');
    for (const name of ['cache', 'outbox', 'serverEvents', 'meta']) tx.objectStore(name).clear();
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    db.close();
  });
}

async function inspectRestoredRecords(page: Page) {
  return page.evaluate(async cacheKey => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('math-scratchpad-sync-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['cache', 'outbox'], 'readonly');
    const [cache, outbox] = await Promise.all([
      new Promise<Array<{ key: string; value: string }>>((resolve, reject) => { const request = tx.objectStore('cache').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
      new Promise<Array<{ id: string; event: { userAnswer?: string } }>>((resolve, reject) => { const request = tx.objectStore('outbox').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
    ]);
    db.close();
    return { cache: cache.find(item => item.key === cacheKey), outbox };
  }, CACHE_KEY);
}

async function runBackupRestoreJourney(page: Page, testInfo: TestInfo) {
  const panel = await openSyncPanel(page);
  await seedLearningRecords(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود پشتیبان کامل JSON' }).click();
  const download = await downloadPromise;
  const localPath = await download.path();
  expect(localPath).toBeTruthy();
  const contents = await readFile(localPath!, 'utf8');
  const backup = JSON.parse(contents) as { format: string; stores: { cache: unknown[]; outbox: unknown[] } };
  expect(backup.format).toBe('math-scratchpad-full-backup/v1');
  expect(backup.stores.cache.some(item => JSON.stringify(item).includes(CACHE_KEY))).toBe(true);
  expect(backup.stores.outbox.some(item => JSON.stringify(item).includes(EVENT_ID))).toBe(true);

  await clearLearningRecords(page);
  await page.locator('input[aria-label="انتخاب فایل پشتیبان JSON"]').setInputFiles({
    name: 'math-scratchpad-backup.json', mimeType: 'application/json', buffer: Buffer.from(contents),
  });
  await expect(panel.getByText(/پیش‌نمایش را بازبینی کن/)).toBeVisible();
  await expect(panel.getByText(/برای افزودن:/)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('section[aria-labelledby="sync-panel-title"]').analyze();
  expect(accessibility.violations.filter(issue => issue.impact === 'critical' || issue.impact === 'serious')).toEqual([]);

  await page.getByRole('button', { name: 'ادغام امن پشتیبان' }).click();
  await expect(panel.getByRole('button', { name: 'بارگذاری دوبارهٔ برنامه' })).toBeVisible();
  await testInfo.attach(`p0-7-backup-preview-${testInfo.project.name}.png`, { body: await panel.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'بارگذاری دوبارهٔ برنامه' }).click();
  await expect(page.locator('#math-scratchpad-redux')).toBeVisible();
  await expect.poll(async () => (await inspectRestoredRecords(page)).cache?.value ?? null).toContain('"bankId":"backup-bank"');
  const restored = await inspectRestoredRecords(page);
  expect(restored.outbox).toEqual(expect.arrayContaining([expect.objectContaining({ id: EVENT_ID, event: expect.objectContaining({ userAnswer: '{(1,2),(2,4)}' }) })]));
}

test('mobile 390 downloads a full backup, wipes IndexedDB, and restores through the validated preview', { tag: '@only-mobile-390' }, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await runBackupRestoreJourney(page, testInfo);
});

test('1280px desktop downloads and restores a complete backup through preview and merge', { tag: '@only-laptop-1440' }, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await runBackupRestoreJourney(page, testInfo);
});
