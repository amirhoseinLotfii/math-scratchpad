import { expect, test } from '@playwright/test';

test('standalone.loads-editor.with-external-network-blocked', async ({ page }) => {
  const externalResponses: string[] = [], pageErrors: string[] = [];
  page.on('response', response => { if (new URL(response.url()).hostname !== '127.0.0.1') externalResponses.push(response.url()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/standalone.html');
  await expect(page.getByRole('button', { name: 'Exercise menu' })).toBeVisible();
  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await field.evaluate(element => { const input = element as HTMLElement & { value: string }; input.value = '2468'; input.dispatchEvent(new Event('input', { bubbles: true, composed: true })); });
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe('2468');
  await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('math-scratchpad-pending-draft-v1:') && value.includes('2468')))).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exercise menu' })).toBeVisible();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe('2468');
  expect(pageErrors).toEqual([]);
  expect(externalResponses).toEqual([]);
});
