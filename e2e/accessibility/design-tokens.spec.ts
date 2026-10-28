import { expect, test } from '../support/test';
test('DS-01: shared semantic theme tokens exist for surfaces, text, focus and errors', async ({ page }) => {
 await page.goto('/');
 const values = await page.getByRole('main').evaluate(el => {
  const style = getComputedStyle(el);
  return Object.fromEntries(['--background','--foreground','--primary','--primary-foreground','--muted','--muted-foreground','--border','--ring','--destructive','--radius'].map(key => [key, style.getPropertyValue(key).trim()]));
 });
 for (const [key, value] of Object.entries(values)) expect(value, `${key} is required by the theme contract`).not.toBe('');
});
test('DS-02: comfortable touch-key sizing survives increased text scale', async ({ page }) => {
 await page.goto('/'); await page.addStyleTag({ content: 'html { font-size: 200% !important }' });
 const keys = page.locator('[aria-label="Numeric keys"]');
 if (!(await keys.isVisible())) await page.getByRole('button', { name: /Show Keyboard/ }).click();
 for (const key of await keys.getByRole('button').all()) {
  const box = await key.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(48); expect(box!.width).toBeGreaterThanOrEqual(44);
 }
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
