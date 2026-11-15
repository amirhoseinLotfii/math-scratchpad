import { expect, test } from '@playwright/test';

test('status chip stays compact at 320px, tracks offline state, and preserves editor focus', async ({ context, page }) => {
  const projectViewport = page.viewportSize();
  await context.route('https://**/*', (route) => route.abort());
  await page.goto('./');

  const chip = page.getByRole('button', { name: /وضعیت اتصال و آفلاین/ });
  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect(field).toBeVisible();
  await expect(chip).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const dialog = page.getByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' });
  await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 320, height: 844 });
  const compactGeometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    page: document.documentElement.scrollWidth,
    chip: document.querySelector('.pwa-status-chip')?.getBoundingClientRect().toJSON(),
  }));
  expect(compactGeometry.viewport).toBe(320);
  expect(compactGeometry.page).toBeLessThanOrEqual(compactGeometry.viewport);
  expect(compactGeometry.chip?.height).toBeGreaterThanOrEqual(48);
  expect(compactGeometry.chip?.width).toBeGreaterThanOrEqual(44);
  if (projectViewport) await page.setViewportSize(projectViewport);

  await field.evaluate((element) => (element as HTMLElement).focus());
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Step 1 expression');

  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(chip).toContainText('در صف:');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Step 1 expression');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 320, height: 844 });
  await chip.click();
  await expect(dialog).toBeVisible();
  const dialogWidth = await dialog.evaluate((element) => element.getBoundingClientRect().width);
  expect(dialogWidth).toBeLessThanOrEqual(288);
  await expect(dialog.getByText(/تغییرات محلی در صف هستند/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'دانلود همه برای آفلاین' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'بررسی نسخهٔ جدید' })).toBeVisible();
});
