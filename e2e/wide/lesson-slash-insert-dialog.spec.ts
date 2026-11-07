import { expect, mathValue, test } from '../support/test';

test('wide lesson answer editor opens the shared extended math picker with slash', { tag: '@only-laptop-1440' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=math');

  const field = page.locator('.lesson-math-editor .current-step math-field');
  await field.focus();
  await page.keyboard.press('/');

  const dialog = page.getByRole('dialog', { name: 'Insert Math Element' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fraction', exact: true })).toBeFocused();
  const showMore = dialog.getByRole('button', { name: /Show more/ });
  await expect(showMore).toBeVisible();
  await showMore.click();
  await expect(dialog.getByRole('button', { name: 'Integral', exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Fraction', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => mathValue(field)).toContain('\\frac');
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);
});
