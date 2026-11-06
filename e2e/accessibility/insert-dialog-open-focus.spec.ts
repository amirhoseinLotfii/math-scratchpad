import { expect, test } from '../support/test';

test('math tools focus Fraction at open and restore opener on each close', async ({ page }) => {
 await page.goto('/');
 const trigger = page.getByRole('button', { name: 'More math tools' });
 const dialog = page.getByRole('dialog', { name: 'Insert Math Element' });
 for (let i = 0; i < 5; i++) {
  await trigger.click();
  await expect(dialog).toBeVisible();
  // An active keyboard user must not stay on the background opener.
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-insert-kind'));
  expect(focused, `opening #${i + 1}`).toBe('fraction');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
 }
});
