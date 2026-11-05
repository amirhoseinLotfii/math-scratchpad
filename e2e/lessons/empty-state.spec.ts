import { expect, test } from '@playwright/test';

test('the no-bank Learn entry opens a usable Drive action on short mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.google = {};' }));
  await page.route('https://apis.google.com/js/api.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.gapi = {};' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  const picker = page.getByRole('dialog', { name: 'Lessons' });
  await expect(picker.getByRole('status')).toHaveText('No question bank is loaded. Load a bank from Google Drive to browse lessons.');
  const notebookTopBefore = await page.locator('.editor-layout').evaluate(element => element.getBoundingClientRect().top);
  await picker.getByRole('button', { name: 'Load bank' }).click();
  const drive = page.getByRole('dialog', { name: 'Google Drive question bank' });
  await expect(drive).toBeVisible();
  await expect(drive.getByRole('heading', { name: 'Google Drive question bank' })).toBeVisible();
  await expect(drive).toHaveCSS('position', 'fixed');
  const notebookTopAfter = await page.locator('.editor-layout').evaluate(element => element.getBoundingClientRect().top);
  expect(Math.abs(notebookTopAfter - notebookTopBefore)).toBeLessThan(2);
  await expect(drive.getByRole('button', { name: 'Close' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(drive).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.drive-bank-backdrop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drive).toBeHidden();
});

test('loads the project favicon without the previous implicit 404', async ({ page }) => {
  const missing: string[] = [];
  page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
  await page.goto('/');
  await expect.poll(() => page.locator('link[rel="icon"]').getAttribute('href')).toBe('./favicon.svg');
  await expect.poll(() => page.evaluate(() => fetch('./favicon.svg').then(response => response.status))).toBe(200);
  expect(missing.filter(url => url.endsWith('/favicon.ico'))).toEqual([]);
});
