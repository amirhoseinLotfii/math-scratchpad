import { expect, mathValue, test } from '../support/test';

test('slash opens the shared math picker in a lesson answer step and restores MathLive focus', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=math');

  const field = page.locator('.lesson-math-editor .current-step math-field');
  await field.scrollIntoViewIfNeeded();
  await field.focus();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);
  await page.keyboard.press('/');

  const dialog = page.getByRole('dialog', { name: 'Insert Math Element' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fraction', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('button', { name: 'Number', exact: true })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);

  await page.keyboard.press('/');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Fraction', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => mathValue(field)).toContain('\\frac');
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);
});
