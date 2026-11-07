import { expect, test } from '../support/test';

test('desktop connection notice retains sign-in and never blocks backup controls', { tag: '@only-laptop-1440' }, async ({ page }) => {
  await page.goto('/?serverMode');
  const notice = page.locator('aside[aria-label="وضعیت همگام‌سازی"]');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: 'بررسی دوباره اتصال' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: 'Cloud sync and migration' }).click();
  const dialog = page.getByRole('dialog', { name: 'همگام‌سازی و حفظ داده‌ها' });
  await expect(dialog).toBeVisible();
  await expect(notice).toBeHidden();
  await dialog.getByRole('button', { name: 'دانلود پشتیبان کامل JSON' }).click();
  await dialog.getByRole('button', { name: 'بستن تنظیم همگام‌سازی' }).click();
  await expect(notice).toBeVisible();
});
