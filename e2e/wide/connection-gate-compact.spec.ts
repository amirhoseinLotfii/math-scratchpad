import { expect, test } from '../support/test';
import { LEARNING_RESET_EPOCH } from '../../src/sync/learning-reset-epoch';

test('desktop connection notice retains sign-in and never blocks backup controls', { tag: '@only-laptop-1440' }, async ({ page }) => {
  // The retry control is available only after the public reset guard has been
  // verified. Keep the endpoint synthetic so this test never depends on a live Worker.
  await page.route('**/reset/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'idle', epoch: LEARNING_RESET_EPOCH }),
  }));
  await page.goto('/?serverMode');
  const notice = page.locator('aside[aria-label="وضعیت همگام‌سازی"]');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: 'بررسی دوباره اتصال' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Data', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Cloud sync and migration' }).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'همگام‌سازی و حفظ داده‌ها' });
  await expect(dialog).toBeVisible();
  await expect(notice).toBeHidden();
  await dialog.getByRole('button', { name: 'دانلود پشتیبان کامل JSON' }).click();
  await dialog.getByRole('button', { name: 'بستن تنظیم همگام‌سازی' }).click();
  await expect(notice).toBeVisible();
});
