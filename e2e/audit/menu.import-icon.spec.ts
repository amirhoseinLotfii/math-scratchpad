import { test, expect } from '@playwright/test';

test('menu.import-session.has-consistent-icon.on-mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Data', exact: true }).hover();
  const action = page.getByRole('menuitem', { name: 'Import session JSON' });
  await expect(action).toBeVisible();
  await expect(action.locator('svg[aria-hidden="true"]')).toHaveCount(1);
});
