import { expect, test, type Page } from '@playwright/test';
import { bankCacheStorageKey, validateBank, snapshotVersion } from '../../src/features/drive-bank/drive-bank';
import type { DriveBank } from '../../src/features/drive-bank/bank-types';
import { readLearningCache } from '../support/indexeddb';

const SESSION_KEY = 'math-scratchpad-session-v3';
const DATABASE = 'math-scratchpad-offline-v1';

async function userContent(page: Page) {
  const raw = await readLearningCache(page, SESSION_KEY);
  if (!raw) return null;
  const doc = (JSON.parse(raw) as { state: { session: { doc: { exercises: Array<Record<string, unknown>> } } } }).state.session.doc;
  return doc.exercises.map((exercise) => ({
    source: exercise.source,
    answerText: exercise.answerText,
    hintNote: exercise.hintNote,
    steps: exercise.steps,
  }));
}

function offlineBank(bankId: string, textQuestion: string, mathQuestion: string): DriveBank {
  return validateBank({
    schema_version: 'math-scratchpad.bank/1.0',
    bank_id: bankId,
    version: 'v1',
    questions: [
      { id: `${bankId}-text`, mode: 'text', source: textQuestion, answerType: 'text' },
      { id: `${bankId}-math`, mode: 'math', source: '1+2', answerType: 'math' },
    ],
  });
}

test('verified offline banks reopen and switch offline while answer and steps survive reload', async ({ context, page }) => {
  await context.route('https://**/*', (route) => route.abort());
  const banks = [
    { fileId: 'synthetic-file-a', bank: offlineBank('offline-bank-a', 'سؤال بانک آفلاین الف', '1+2'), fingerprint: 'synthetic-a' },
    { fileId: 'synthetic-file-b', bank: offlineBank('offline-bank-b', 'یادداشت تمرین بانک ب', '1+2'), fingerprint: 'synthetic-b' },
  ];
  const records = await Promise.all(
    banks.map(async ({ fileId, bank, fingerprint }, index) => ({
      fileId,
      bankId: bank.bank_id,
      schemaVersion: 1,
      declaredVersion: bank.version,
      contentVersion: await snapshotVersion(bank),
      fingerprint,
      savedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      sizeChars: JSON.stringify(bank).length,
      bank,
    })),
  );
  const legacyCacheRecords = await Promise.all(
    banks.map(async ({ fileId, bank, fingerprint }, index) => ({
      key: bankCacheStorageKey(fileId),
      value: JSON.stringify({
        schemaVersion: 1,
        fileId,
        bank,
        version: await snapshotVersion(bank),
        fingerprint,
        savedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }),
    })),
  );
  await page.addInitScript((items) => {
    if (sessionStorage.getItem('synthetic-bank-cache-seeded')) return;
    items.forEach(({ key, value }) => localStorage.setItem(key, value));
    sessionStorage.setItem('synthetic-bank-cache-seeded', 'true');
  }, legacyCacheRecords);
  const failedSameOrigin: string[] = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://127.0.0.1:4173') failedSameOrigin.push(request.url());
  });

  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' })).toBeHidden();

  const legacyKeys = legacyCacheRecords.map(({ key }) => key);
  await expect
    .poll(() => Promise.all(legacyKeys.map((key) => readLearningCache(page, key))))
    .toEqual(legacyCacheRecords.map(({ value }) => value));
  await page.evaluate(
    async ({ database, records }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('banks')) request.result.createObjectStore('banks', { keyPath: 'fileId' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('banks', 'readwrite');
        const store = transaction.objectStore('banks');
        for (const record of records) store.put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    },
    { database: DATABASE, records },
  );

  const openBankPanel = async () => {
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: /Google Drive/ }).click();
    return page.getByRole('dialog', { name: 'Google Drive question bank' });
  };
  let panel = await openBankPanel();
  await expect(panel.getByRole('heading', { name: 'Cached offline banks (2)' })).toBeVisible();
  await panel.getByRole('button', { name: 'Open offline bank offline-bank-b' }).click();
  await page.getByRole('dialog', { name: 'Open a cached offline bank?' }).getByRole('button', { name: 'Open bank' }).click();
  const wellbeing = page.getByRole('dialog', { name: 'Before you start this batch' });
  await expect(wellbeing).toBeVisible();
  await wellbeing.getByRole('button', { name: 'Skip for now' }).click();

  const persianAnswer = 'یادداشت فارسی برای بازیابی آفلاین';
  await page.getByRole('textbox', { name: 'Answer' }).fill(persianAnswer);
  if (await page.getByRole('combobox', { name: 'Select question' }).count()) {
    await page.getByRole('combobox', { name: 'Select question' }).selectOption({ label: 'Question 2 · Not started' });
  } else {
    await page.getByRole('button', { name: /Question 2/ }).click();
  }
  const firstStep = page.locator('math-field[aria-label="Step 1 expression"]');
  await firstStep.evaluate((element) => {
    const field = element as HTMLElement & { value: string };
    field.value = '2+3';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await page.getByRole('button', { name: 'Add step' }).click();
  const secondStep = page.locator('math-field[aria-label="Step 2 expression"]');
  await secondStep.evaluate((element) => {
    const field = element as HTMLElement & { value: string };
    field.value = '5';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await expect.poll(() => userContent(page)).toMatchObject([{ answerText: persianAnswer }, { steps: expect.any(Array) }]);
  const before = await userContent(page);
  const beforeBytes = await readLearningCache(page, SESSION_KEY);
  expect(beforeBytes).not.toBeNull();

  await context.setOffline(true);
  failedSameOrigin.length = 0;
  await page.reload();
  await expect.poll(() => userContent(page)).toEqual(before);
  await expect.poll(() => readLearningCache(page, SESSION_KEY)).toBe(beforeBytes);

  panel = await openBankPanel();
  await expect(panel.getByRole('heading', { name: 'Cached offline banks (2)' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open offline bank offline-bank-b' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Close' }).click();
  if (await page.getByRole('combobox', { name: 'Select question' }).count()) {
    await page.getByRole('combobox', { name: 'Select question' }).selectOption({ index: 0 });
  } else {
    await page.getByRole('button', { name: /Question 1/ }).click();
  }
  await expect(page.getByText('یادداشت تمرین بانک ب')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Answer' })).toHaveValue(persianAnswer);

  panel = await openBankPanel();
  await panel.getByRole('button', { name: 'Open offline bank offline-bank-a' }).click();
  await page.getByRole('dialog', { name: 'Open a cached offline bank?' }).getByRole('button', { name: 'Open bank' }).click();
  const secondWellbeing = page.getByRole('dialog', { name: 'Before you start this batch' });
  await expect(secondWellbeing).toBeVisible();
  await secondWellbeing.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText('سؤال بانک آفلاین الف')).toBeVisible();
  await expect
    .poll(() => Promise.all(legacyKeys.map((key) => readLearningCache(page, key))))
    .toEqual(legacyCacheRecords.map(({ value }) => value));
  expect(failedSameOrigin).toEqual([]);
});
