import { expect, test } from '../support/test';

test.use({ autoDismissWellbeing: false });

test('desktop diagnostic keeps immediate physical math input before focus upgrade', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Practice', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Start 30-question diagnostic' }).press('Enter');
  await page.getByRole('button', { name: 'Start 30 Questions' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  const field = page.locator('math-field[aria-label="Step 1 expression"]').first();
  await field.click();
  await page.keyboard.type('7139');
  await expect.poll(() => field.evaluate(el => el.shadowRoot?.querySelector('.ML__base')?.textContent)).toContain('7139');
});
