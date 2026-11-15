import { expect, test } from '@playwright/test';

test('Google and Worker features stay quiet offline and retry Google scripts after reconnection', async ({ context, page }) => {
  const externalGoogleRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['accounts.google.com', 'apis.google.com', 'www.googleapis.com'].includes(url.hostname)) externalGoogleRequests.push(url.href);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.route('https://**/*', (route) => route.abort());
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const statusDialog = page.getByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' });
  if (await statusDialog.isVisible().catch(() => false)) await statusDialog.getByRole('button', { name: 'بستن' }).click();

  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: /Google Drive · Question bank/ }).click();
  const bankPanel = page.getByRole('dialog', { name: 'Google Drive question bank' });
  await expect(bankPanel.getByText(/برای ورود Google، دریافت بانک/)).toBeVisible();
  await expect(bankPanel.getByRole('button', { name: 'Grant Google Drive access' })).toBeDisabled();
  expect(externalGoogleRequests).toEqual([]);
  await bankPanel.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  const dataMenu = page.getByRole('menuitem', { name: 'Data' });
  if ((page.viewportSize()?.width ?? 0) <= 700) await dataMenu.click();
  else {
    await dataMenu.focus();
    await page.keyboard.press('ArrowRight');
  }
  const syncItem = page.getByRole('menuitem', { name: 'Cloud sync and migration' });
  await expect(syncItem).toBeVisible();
  await syncItem.focus();
  await page.keyboard.press('Enter');
  const syncPanel = page.getByRole('dialog', { name: 'همگام‌سازی و حفظ داده‌ها' });
  await expect(syncPanel.getByText(/برای ورود Google، همگام‌سازی سرور/)).toBeVisible();
  await expect(syncPanel.getByRole('button', { name: 'همگام‌سازی الان' })).toBeDisabled();
  expect(externalGoogleRequests).toEqual([]);

  await context.setOffline(false);
  await expect.poll(() => externalGoogleRequests.length).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
