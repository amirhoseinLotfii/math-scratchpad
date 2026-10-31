import { expect, test, type Locator } from '../support/test';
import { openConfidence, startBatch } from '../support/mobile-journey';
async function expectUnobscured(control: Locator) {
 await control.scrollIntoViewIfNeeded();
 expect(await control.evaluate(el => {
  const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y); return !!top && (el === top || el.contains(top));
 })).toBe(true);
}
test('A11Y-KEY-01: focused form and footer controls are not obscured', async ({ page }) => {
 await startBatch(page);
 for (const control of [page.getByRole('button', { name: 'Add step', exact: true }), page.getByRole('button', { name: /Next question/i })]) {
  await control.focus(); await expectUnobscured(control); await expect(control).toBeFocused();
 }
});
test('A11Y-KEY-02: background actions cannot be activated through a modal', async ({ page }) => {
 await openConfidence(page);
 const add = page.getByRole('button', { name: 'Add step', exact: true, includeHidden: true });
 expect(await add.evaluate(el => !!el.closest('[inert]') || getComputedStyle(el).pointerEvents === 'none')).toBe(true);
});
test('A11Y-KEY-03: keyboard focus has a visible indicator', async ({ page }) => {
 await page.goto('/'); await page.keyboard.press('Tab');
 const add = page.getByRole('button', { name: 'Add step', exact: true }); await add.focus();
 expect(await add.evaluate(el => {
  const style = getComputedStyle(el); return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
 })).toBe(true);
});
test('A11Y-KEY-04: Enter on a focused symbol inserts exactly once', async ({ page }) => {
 await startBatch(page);
 const button = page.getByRole('group', { name: 'Quick math tools' }).getByRole('button', { name: 'Insert fraction' });
 await button.focus(); await page.keyboard.press('Enter');
 const field = page.locator('math-field[aria-label="Step 1 expression"]');
 await expect.poll(() => field.evaluate(element => ((element as HTMLElement & { value: string }).value.match(/\\frac/g) ?? []).length)).toBe(1);
});
test('A11Y-KEY-05: disabled first-step delete is excluded from keyboard tab sequence', async ({ page }) => {
 await page.goto('/'); const deletion = page.getByRole('button', { name: 'Delete Step 1' });
 await expect(deletion).toBeDisabled();
 const reset = page.getByRole('button', { name: 'Reset Step 1' }); await reset.focus(); await page.keyboard.press('Tab');
 await expect(deletion).not.toBeFocused();
});
test('A11Y-VIS-01: forced colors preserve controls and focus', async ({ page }) => {
 await page.emulateMedia({ forcedColors: 'active' }); await page.goto('/');
 const add = page.getByRole('button', { name: 'Add step', exact: true }); await expect(add).toBeVisible();
 await add.focus(); await expectUnobscured(add);
 expect(await add.evaluate(el => getComputedStyle(el).forcedColorAdjust)).not.toBe('none');
});
test('A11Y-VIS-02: reduced motion removes long nonessential control transitions', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
 const times = await page.locator('button').evaluateAll(nodes => nodes.map(el => {
  const s = getComputedStyle(el); return [...s.animationDuration.split(','), ...s.transitionDuration.split(',')].map(v => parseFloat(v) * (v.trim().endsWith('ms') ? 1 : 1000));
 }).flat());
 expect(times.every(ms => ms <= 10)).toBe(true);
});
test('A11Y-VIS-03: WCAG text spacing preserves labels and localizes overflow', async ({ page }) => {
 await page.goto('/');
 await page.addStyleTag({ content: '#math-scratchpad-redux * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important } #math-scratchpad-redux p { margin-bottom: 2em !important }' });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 for (const name of ['Add step','Reset Step 1']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});
test('A11Y-VIS-04: popup content fits a short landscape viewport', async ({ page }) => {
 await page.setViewportSize({ width: 844, height: 390 }); const dialog = await openConfidence(page);
 const cancel = dialog.getByRole('button', { name: /Cancel/i }); await cancel.scrollIntoViewIfNeeded(); await expectUnobscured(cancel);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('A11Y-STAT-01: time ticks do not repeatedly announce to a live region', async ({ page }) => {
 await page.goto('/'); const output = page.getByLabel('Question elapsed time');
 expect(await output.evaluate(el => !!el.closest('[aria-live="assertive"], [role="alert"]'))).toBe(false);
});
test('A11Y-STAT-02: copy success is announced without unexpectedly moving focus', async ({ page, context }) => {
 await context.grantPermissions(['clipboard-read','clipboard-write']); await startBatch(page);
 const trigger = page.getByRole('button', { name: 'Exercise menu' }); await trigger.click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await page.getByRole('menuitem', { name: /Copy full session JSON/i }).click();
 await expect(page.getByRole('status').filter({ hasText: /copied/i })).toBeVisible();
 await expect(trigger).toBeFocused();
});
test('A11Y-ERR-01: confidence has no default; continuing empty shows an error, choosing one continues', async ({ page }) => {
 const dialog = await openConfidence(page);
 await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
 await dialog.getByRole('button', { name: /Continue/i }).click();
 await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog).toBeVisible();
 await dialog.getByRole('radio', { name: 'High' }).check(); await dialog.getByRole('button', { name: /Continue/i }).click();
 await expect(dialog).toBeHidden(); await expect(page.getByRole('alert')).toHaveCount(0);
});
test('A11Y-POINTER-01: cancelling a press does not reset the answer', async ({ page }) => {
 await startBatch(page);
 const expression = page.locator('math-field[aria-label="Step 1 expression"]');
 const keys = page.getByRole('group', { name: 'Numeric keys' });
 for (const digit of ['1', '2', '3']) await keys.getByRole('button', { name: digit, exact: true }).click();
 const readValue = () => expression.evaluate(element => (element as HTMLElement & { value: string }).value);
 await expect.poll(readValue).toBe('123');
 const before = await readValue();
 const reset = await page.getByRole('button', { name: 'Reset Step 1' }).boundingBox();
 await page.mouse.move(reset!.x + reset!.width / 2, reset!.y + reset!.height / 2); await page.mouse.down();
 await page.mouse.move(1, 1); await page.mouse.up();
 await expect.poll(readValue).toBe(before);
});
test('A11Y-FOCUS-CHANGE-01: focusing navigation does not advance or open a dialog', async ({ page }) => {
 await startBatch(page); const selector = page.getByRole('combobox', { name: 'Select question' }); const before = await selector.inputValue();
 await page.getByRole('button', { name: /Next question/i }).focus();
 await expect(selector).toHaveValue(before); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('A11Y-NAME-REL-01: dialog naming and description references resolve to actual nodes', async ({ page }) => {
 const dialog = await openConfidence(page);
 const broken = await dialog.evaluate(el => [...el.querySelectorAll('[aria-labelledby], [aria-describedby]'), el].flatMap(node =>
  ['aria-labelledby','aria-describedby'].flatMap(attribute => (node.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean).filter(id => !document.getElementById(id)))
 ));
 expect(broken).toEqual([]);
});
