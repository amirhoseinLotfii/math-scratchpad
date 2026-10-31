import { test, expect, dismissWellbeing, mathField } from './support/test';
test.beforeEach(async ({ page }) => { await page.goto('/'); });
test('touch controls fit the mobile container and preserve keypad order', async ({ page }) => {
 if (!(await page.locator('[aria-label="Numeric keys"]').isVisible())) await page.getByRole('button', { name: /Show Keyboard/ }).click();
 const keys = page.locator('[aria-label="Numeric keys"]');
 await expect(keys.getByRole('button').first()).toHaveText('1');
 const labels = await keys.getByRole('button').allTextContents();
 expect(labels.slice(0, 3)).toEqual(['1', '2', '3']);
 const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
 expect(overflow).toBe(false);
 for (const button of await keys.getByRole('button').all()) {
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(48);
 }
});
test('adding a step keeps the active writing area reachable and first-step deletion disabled', async ({ page }) => {
 await expect(page.getByRole('button', { name: 'Delete Step 1' })).toBeDisabled();
 await page.getByRole('button', { name: 'Add step', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Delete Step 2' })).toBeEnabled();
 const editor = mathField(page, 2);
 await expect(editor).toBeInViewport();
 await editor.click();
 await expect.poll(() => editor.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);
 await page.keyboard.type('123');
 await expect.poll(() => editor.evaluate(element => (element as HTMLElement & { value: string }).value)).toContain('123');
});
test('each phone step keeps its Final control visible and stateful', async ({ page }) => {
 const final = page.getByRole('button', { name: 'Mark Step 1 as final' });
 await expect(final).toBeVisible(); await expect(final).toHaveAttribute('aria-pressed', 'false');
 await final.click(); await expect(final).toHaveAttribute('aria-pressed', 'true');
 await expect(final).toContainText('Final ✓');
});
test('quick tools have approved order and editing never exposes inline confidence', async ({ page }) => {
 const quick = page.getByRole('group', { name: 'Quick math tools' });
 await expect(quick.getByRole('button').first()).toHaveAttribute('type', 'button');
 expect(await quick.getByRole('button').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')))).toEqual(['Insert fraction', 'Insert parentheses', 'Insert square root', 'Insert power', 'Insert equals']);
 await expect(page.getByRole('radio')).toHaveCount(0);
});
test('full session export is reachable during editing', async ({ page }) => {
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await expect(page.getByRole('menuitem', { name: /^Copy full session JSON/ })).toBeVisible();
});
test('only question prose is Persian and the app interface stays English', async ({ page }) => {
 const main = page.locator('main');
 await expect(main).toHaveAttribute('lang', 'en');
 const foreignUI = await main.locator('button, legend, label, [role="status"]').evaluateAll(nodes => nodes.filter(n => /[\u0600-\u06ff]/.test(n.textContent ?? '')).map(n => n.textContent));
 expect(foreignUI).toEqual([]);
});
test('confidence modal supports keyboard cancellation without losing focus', async ({ page }) => {
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await page.getByRole('menuitem', { name: /Start Round 1/ }).click();
 await page.getByRole('button', { name: 'Start 20 Questions', exact: true }).click();
 await dismissWellbeing(page);
 const next = page.getByRole('button', { name: /Next question/i });
 await next.click();
 const dialog = page.getByRole('dialog', { name: /confidence/i });
 await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(next).toBeFocused();
});
test('phone header keeps desktop setup buttons in the overflow menu', async ({ page }) => {
 await expect(page.getByRole('button', { name: 'New Problem', exact: true })).toBeHidden();
 await expect(page.getByRole('button', { name: 'Session JSON', exact: true })).toBeHidden();
 await expect(page.getByRole('heading', { name: 'Math Scratchpad', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Exercise menu' })).toBeVisible();
});
test('KB-13: phone keeps its keyboard open by default and remembers an explicit Hide', async ({ page }) => {
 await startKb(page); const toggle = page.locator('.keyboard-toggle');
 await expect(toggle).toHaveAttribute('aria-expanded', 'true');
 await page.getByRole('button', { name: /More tools/ }).click(); await page.getByRole('button', { name: 'Hide keys' }).click(); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
 expect(await page.evaluate(() => localStorage.getItem('math-scratchpad-ui-v1:virtual-keyboard'))).toBe('0');
 await page.reload(); await expect(page.locator('.keyboard-toggle')).toHaveAttribute('aria-expanded', 'false');
});
async function startKb(page: import('./support/test').Page) { const { startBatch } = await import('./support/mobile-journey'); await startBatch(page); }
