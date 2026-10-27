import { test, expect, type Page } from '@playwright/test';
async function startBatch(page: Page) {
 await page.goto('/');
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: /Start Round 1/ }).click();
 await page.getByRole('button', { name: 'Start 20 Questions', exact: true }).click();
}
test('confidence dialog traps Tab and Shift+Tab and restores focus', async ({ page }) => {
 await startBatch(page);
 const next = page.getByRole('button', { name: /Next question/i }); await next.click();
 const dialog = page.getByRole('dialog', { name: /confidence/i });
 for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
 }
 await page.keyboard.press('Shift+Tab');
 expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape'); await expect(next).toBeFocused();
});
test('batch completion requires confidence and offers explicit export actions', async ({ page }) => {
 await startBatch(page);
 const selector = page.getByRole('combobox', { name: 'Current exercise' });
 const last = await selector.locator('option').last().getAttribute('value');
 await selector.selectOption(last!);
 await page.getByRole('button', { name: /Finish session/i }).click();
 const confidence = page.getByRole('dialog', { name: /confidence/i });
 await expect(confidence.getByRole('radio', { checked: true })).toHaveCount(1);
 await expect(confidence.getByRole('radio', { name: 'High' })).toBeChecked();
 await confidence.getByRole('radio', { name: 'High' }).check();
 await confidence.getByRole('button', { name: /Continue/i }).click();
 const complete = page.getByRole('dialog', { name: /Session complete/i });
 await expect(complete.getByRole('button', { name: 'Copy full session JSON' })).toBeVisible();
 await expect(complete.getByRole('button', { name: 'Check · Copy for Review' })).toBeVisible();
});
test('menu stays within viewport and does not push the page horizontally', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button', { name: 'Exercise menu' }).click();
 const exportButton = page.getByRole('menuitem', { name: /^Copy full session JSON/ });
 await expect(exportButton).toBeInViewport();
 const box = await exportButton.boundingBox();
 expect(box!.x).toBeGreaterThanOrEqual(0);
 expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
test('200 percent text size preserves controls and avoids page overflow', async ({ page }) => {
 await page.goto('/'); await page.addStyleTag({ content: '#math-scratchpad-redux { font-size: 200% !important } #math-scratchpad-redux button { font-size: 2rem !important }' });
 await expect(page.getByRole('button', { name: 'Add step', exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('long formula uses local scrolling without page overflow', async ({ page }) => {
 await page.goto('/'); await page.locator('main').focus(); await page.keyboard.type('123456789012345678901234567890123456789012345678901234567890');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await expect(page.getByLabel('Step 1 expression')).toBeVisible();
});
test('reset and Undo preserve editable expression in a real browser', async ({ page }) => {
 await page.goto('/'); const main = page.locator('main'); await main.focus(); await page.keyboard.type('9');
 const before = await page.getByLabel('Step 1 expression').textContent();
 await page.getByRole('button', { name: 'Reset Step 1' }).click();
 await main.focus(); await page.keyboard.press('Control+z');
 await expect(page.getByLabel('Step 1 expression')).toHaveText(before!);
});
test('rotation preserves the current answer and keeps next-question control reachable', async ({ page }) => {
 await startBatch(page); await page.locator('main').focus(); await page.keyboard.type('123');
 const before = await page.getByLabel('Step 1 expression').textContent();
 await page.setViewportSize({ width: 844, height: 390 });
 await expect(page.getByLabel('Step 1 expression')).toHaveText(before!);
 await page.getByRole('button', { name: /Next question/i }).scrollIntoViewIfNeeded();
 await expect(page.getByRole('button', { name: /Next question/i })).toBeInViewport();
});
test('tapping a number never moves to a different question', async ({ page }) => {
 await startBatch(page);
 const selector = page.getByRole('combobox', { name: 'Current exercise' }); const before = await selector.inputValue();
 const keys = page.locator('[aria-label="Numeric keys"]');
 for (const name of ['1','2','3']) await keys.getByRole('button', { name, exact: true }).tap();
 await expect(page.getByLabel('Step 1 expression')).toContainText('123');
 await expect(selector).toHaveValue(before);
});
test('clipboard export contains the whole batch rather than only the visible question', async ({ page, context }) => {
 await context.grantPermissions(['clipboard-read', 'clipboard-write']);
 await startBatch(page); await page.locator('main').focus(); await page.keyboard.type('123');
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: /^Copy full session JSON/ }).click();
 const text = await page.evaluate(() => navigator.clipboard.readText());
 const data = JSON.parse(text);
 expect(data.doc.exercises).toHaveLength(20);
 expect(JSON.stringify(data.doc.exercises[0].steps)).toContain('123');
 expect(data.doc.exercises.every((x: Record<string, unknown>) => !('expected' in x))).toBe(true);
});
test('Add step and tool cards follow the approved vertical reading order', async ({ page }) => {
 await page.goto('/');
 const step = await page.locator('[data-step-id]').last().boundingBox();
 const add = await page.getByRole('button', { name: 'Add step', exact: true }).boundingBox();
 const tools = await page.getByRole('group', { name: 'Quick math tools' }).boundingBox();
 expect(add!.y).toBeGreaterThanOrEqual(step!.y + step!.height);
 expect(tools!.y).toBeGreaterThanOrEqual(add!.y + add!.height);
 expect(add!.height).toBeGreaterThanOrEqual(44);
});
test('batch editing hides the primary review footer but keeps navigation reachable', async ({ page }) => {
 await startBatch(page);
 await expect(page.getByRole('button', { name: 'Check · Copy for Review' })).toHaveCount(0);
 const previous = page.getByRole('button', { name: /Previous/i });
 await expect(previous).toBeDisabled();
 await page.getByRole('button', { name: /Next question/i }).scrollIntoViewIfNeeded();
 await expect(page.getByRole('button', { name: /Next question/i })).toBeInViewport();
});
test('icon-only reset and delete have readable accessible names and touch areas', async ({ page }) => {
 await page.goto('/');
 for (const name of ['Reset Step 1','Delete Step 1']) {
  const control = page.getByRole('button', { name }); const box = await control.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
 }
});
test('copy denial exposes a manual JSON fallback without leaving the question', async ({ page }) => {
 await page.addInitScript(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('Denied'); } } });
  document.execCommand = () => false;
 });
 await startBatch(page);
 const before = await page.getByRole('combobox', { name: 'Current exercise' }).inputValue();
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: /^Copy full session JSON/ }).click();
 const fallback = page.getByRole('textbox', { name: /session JSON/i });
 await expect(fallback).toBeVisible(); expect(JSON.parse(await fallback.inputValue()).doc.exercises).toHaveLength(20);
 await expect(page.getByRole('combobox', { name: 'Current exercise' })).toHaveValue(before);
});
test('larger available height does not leave unused space below the keypad actions', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 1500 }); await startBatch(page);
 const next = await page.getByRole('button', { name: /Next question/i }).boundingBox();
 const pageHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, innerHeight));
 expect(pageHeight - (next!.y + next!.height)).toBeLessThanOrEqual(48);
});
