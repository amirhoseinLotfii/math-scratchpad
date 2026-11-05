import { expect, test } from '../support/test';

test('UI-AUDIT-WIDE: sync status, popovers, and editor controls do not collide on desktop', async ({ page }) => {
 await page.goto('/?serverMode');
 const editor = page.locator('.scratchpad');
 const before = await editor.boundingBox();
 const status = page.getByRole('status', { name: 'وضعیت همگام‌سازی' });
 await expect(status).toBeVisible();
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 for (const name of ['New Problem', 'Google Drive · Question bank']) {
  const item = page.getByRole('menuitem', { name });
  await expect(item).toBeVisible();
  expect(await item.evaluate(element => {
   const r = element.getBoundingClientRect();
   const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
   return element === hit || (!!hit && element.contains(hit));
  })).toBe(true);
 }
 await page.keyboard.press('Escape');
 await page.getByRole('button', { name: 'More math tools' }).click();
 await expect(page.getByRole('dialog', { name: 'Insert Math Element' })).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button', { name: 'More math tools' })).toBeFocused();
 const after = await editor.boundingBox();
 expect(after?.x).toBe(before?.x);
 expect(after?.y).toBe(before?.y);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
