import { expect, test } from '@playwright/test';

test('standalone.loads-editor.with-external-network-blocked', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/standalone.html');
  await expect(page.getByRole('button', { name: 'Exercise menu' })).toBeVisible();
});
