import { expect, test } from './support/test';

test.use({ autoDismissWellbeing: false });

test('new diagnostic question accepts the first physical keystroke immediately after onboarding', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: 'Start 30-question diagnostic' }).click();
  await page.getByRole('button', { name: 'Start 30 Questions' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  const field = page.locator('math-field[aria-label="Step 1 expression"]').first();
  await field.click();
  // Deliberately type without waiting for MathLive to finish its lazy focus.
  await page.keyboard.type('7139');
  await expect(field).toBeFocused();
  await expect.poll(() => field.evaluate(el => el.shadowRoot?.querySelector('.ML__base')?.textContent)).toContain('7139');
  await page.reload();
  await expect.poll(() => field.evaluate(el => el.shadowRoot?.querySelector('.ML__base')?.textContent)).toContain('7139');
});
