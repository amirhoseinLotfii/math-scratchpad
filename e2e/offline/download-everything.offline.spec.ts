import { expect, test } from '@playwright/test';
import { snapshotVersion, validateBank } from '../../src/features/drive-bank/drive-bank';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5qUAAAAASUVORK5CYII=', 'base64');

test('download everything caches the shell and available images, reports failures, and requests persistent storage', async ({
  context,
  page,
}) => {
  const bank = validateBank({
    schema_version: 'math-scratchpad.bank/1.0',
    bank_id: 'offline-download-synthetic',
    version: 'v1',
    questions: [{ id: 'Q01', mode: 'math', source: '1+1' }],
    lessons: [
      {
        id: 'L1',
        book: 'Synthetic offline test',
        section: '1',
        title: 'Offline images',
        concepts: [
          {
            id: 'C1',
            title: 'Image fixtures',
            checkQuestionIds: [],
            blocks: [
              { type: 'image', src: './offline-fixtures/same-origin.png', alt: 'Same-origin fixture' },
              { type: 'image', src: './offline-fixtures/same-origin.png?v=2', alt: 'Second same-origin fixture' },
              { type: 'image', src: 'https://offline-fixture.invalid/diagram.png', alt: 'Unavailable fixture' },
            ],
          },
        ],
      },
    ],
  });
  const contentVersion = await snapshotVersion(bank);
  const record = {
    schemaVersion: 1,
    fileId: 'synthetic-offline-download-file',
    bankId: bank.bank_id,
    declaredVersion: bank.version,
    contentVersion,
    fingerprint: 'synthetic-offline-download-fingerprint',
    bank,
    savedAt: new Date().toISOString(),
    sizeChars: JSON.stringify(bank).length,
  };

  await context.route('https://**/*', (route) => route.abort());
  await page.addInitScript((seed) => {
    if (sessionStorage.getItem('offline-download-seeded')) return;
    Object.defineProperty(navigator.storage, 'persist', {
      configurable: true,
      value: async () => {
        localStorage.setItem(
          '__offline_test_persist_calls',
          String(Number(localStorage.getItem('__offline_test_persist_calls') ?? '0') + 1),
        );
        return true;
      },
    });
    Object.defineProperty(navigator.storage, 'estimate', {
      configurable: true,
      value: async () => ({ usage: 0, quota: 1_000_000_000 }),
    });
    const request = indexedDB.open('math-scratchpad-offline-v1', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('banks')) request.result.createObjectStore('banks', { keyPath: 'fileId' });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('banks', 'readwrite');
      transaction.objectStore('banks').put(seed);
      transaction.oncomplete = () => database.close();
    };
    sessionStorage.setItem('offline-download-seeded', 'true');
  }, record);

  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const statusDialog = page.getByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' });
  if (await statusDialog.isVisible().catch(() => false)) await statusDialog.getByRole('button', { name: 'بستن' }).click();
  await page.getByRole('button', { name: /وضعیت اتصال و آفلاین/ }).click();

  const dialog = page.getByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' });
  const downloadButton = dialog.getByRole('button', { name: 'دانلود همه برای آفلاین' });
  await downloadButton.click();
  await expect(dialog.getByText(/پوستهٔ برنامه آماده است/)).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText(/۲ بانک|۱ بانک/)).toBeVisible();
  await expect(dialog.getByText(/۲ تصویر ذخیره شد/)).toBeVisible();
  await expect(dialog.getByText(/۱ مورد ناموفق/)).toBeVisible();
  await expect(dialog.getByText(/ذخیره‌سازی پایدار فعال شد/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('__offline_test_persist_calls'))).toBe('1');

  const cached = await page.evaluate(async () => {
    const cache = await caches.open('ms-images-v1');
    const urls = [
      new URL('./offline-fixtures/same-origin.png', document.baseURI).href,
      new URL('./offline-fixtures/same-origin.png?v=2', document.baseURI).href,
      'https://offline-fixture.invalid/diagram.png',
    ];
    return Promise.all(urls.map(async (url) => Boolean(await cache.match(url))));
  });
  expect(cached).toEqual([true, true, false]);

  await dialog.getByText(/نمایش موارد ناموفق/).click();
  await expect(dialog.getByText('خطای شبکه')).toBeVisible();
  await expect(dialog.getByText('https://offline-fixture.invalid/diagram.png')).toBeVisible();
});
