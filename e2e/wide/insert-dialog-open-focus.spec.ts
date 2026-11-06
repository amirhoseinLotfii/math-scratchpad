import { expect, test } from '../support/test';

test('wide layouts focus first math tool synchronously after repeated opens', async ({ page }) => {
 await page.goto('/');
 const trigger = page.getByRole('button', { name: 'More math tools' });
 const dialog = page.getByRole('dialog', { name: 'Insert Math Element' });
 for (let index = 0; index < 4; index++) {
  await trigger.click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-insert-kind'))).toBe('fraction');
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('[data-insert-kind]').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
 }
});
