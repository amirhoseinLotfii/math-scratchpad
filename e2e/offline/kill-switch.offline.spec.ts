import { expect, test, type Page } from '@playwright/test';

const base = 'http://127.0.0.1:4173';

async function waitForController(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function seedSentinel(page: Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.setItem('pwa-safety-sentinel', 'keep-this-byte-for-byte');
    const request = indexedDB.open('pwa-safety-sentinel-db', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sentinel');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('sentinel', 'readwrite');
      transaction.objectStore('sentinel').put({ value: 'keep-this-record' }, 'primary');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
}

async function snapshotSentinel(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const request = indexedDB.open('pwa-safety-sentinel-db');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<{ value: string }>((resolve, reject) => {
      const get = db.transaction('sentinel', 'readonly').objectStore('sentinel').get('primary');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return JSON.stringify({ local: localStorage.getItem('pwa-safety-sentinel'), value });
  });
}

async function assertOfflineDataUnchanged(page: Page, before: string) {
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).includes('pwa-safety-sentinel'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('pwa-safety-sentinel'))).toBe('keep-this-byte-for-byte');
  expect(await snapshotSentinel(page)).toBe(before);
}

test.afterEach(async ({ request }) => {
  await request.post(`${base}/__switch?to=a`);
  await request.post(`${base}/__control`);
});

test('remote control flag unregisters the worker and removes app caches without changing user data', async ({ context, page }) => {
  await context.route('https://**/*', (route) => route.abort());
  await page.goto('./');
  await waitForController(page);
  await seedSentinel(page);
  const before = await snapshotSentinel(page);
  await page.evaluate(() => fetch(`${location.origin}/__control?enabled=false`, { method: 'POST' }));
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  await page.reload();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).every((name) => !name.startsWith('ms-')))).toBe(true);
  await assertOfflineDataUnchanged(page, before);
  const navigationCount = navigations.length;
  await page.waitForTimeout(500);
  expect(navigations).toHaveLength(navigationCount);
});

test('the local ?no-sw=1 escape hatch unregisters the worker and preserves browser data', async ({ context, page }) => {
  await context.route('https://**/*', (route) => route.abort());
  await page.goto('./');
  await waitForController(page);
  await seedSentinel(page);
  const before = await snapshotSentinel(page);

  await page.goto('./?no-sw=1');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).every((name) => !name.startsWith('ms-')))).toBe(true);
  await assertOfflineDataUnchanged(page, before);
});

test('an emergency KILL=1 worker removes app caches and leaves data unchanged', async ({ context, page }) => {
  await context.route('https://**/*', (route) => route.abort());
  await page.goto('./');
  await waitForController(page);
  await seedSentinel(page);
  const before = await snapshotSentinel(page);
  await page.evaluate(() => fetch(`${location.origin}/__switch?to=kill`, { method: 'POST' }));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration?.update()));

  await expect.poll(() => new URL(page.url()).searchParams.get('no-sw'), { timeout: 15_000 }).toBe('1');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).every((name) => !name.startsWith('ms-')))).toBe(true);
  await assertOfflineDataUnchanged(page, before);
});
