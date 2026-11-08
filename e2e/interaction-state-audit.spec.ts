import { expect, test, type Page, mathField, mathValue } from './support/test';
import { startBatch } from './support/mobile-journey';

async function evidence(page: Page, testInfo: import('@playwright/test').TestInfo, label: string) {
  const path = testInfo.outputPath(`${label}.png`);
  await page.screenshot({ path, animations: 'disabled', fullPage: false });
  await testInfo.attach(label, { path, contentType: 'image/png' });
}

test('QA-WORKSPACE-01: menu, sync overlay, new exercise and math picker preserve layout and focus across viewports', { tag: '@only-mobile-390' }, async ({ page }, testInfo) => {
  for (const { width, height } of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 430, height: 932 }, { width: 820, height: 1180 },
    { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  ]) {
    const size = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.goto('/?serverMode');
    const editor = page.locator('.scratchpad');
    await expect(editor).toBeVisible();
    const base = await editor.boundingBox();
    await evidence(page, testInfo, `workspace-${size}-idle`);

    const menu = page.getByRole('button', { name: 'Exercise menu' });
    await menu.click();
    await evidence(page, testInfo, `workspace-${size}-menu-open`);
    await page.getByRole('menuitem', { name: 'Show more' }).click();
    await page.getByRole('menuitem', { name: 'Data', exact: true }).hover();
    await page.getByRole('menuitem', { name: 'Cloud sync and migration' }).press('Enter');
    const sync = page.getByRole('dialog', { name: 'همگام‌سازی و حفظ داده‌ها' });
    await expect(sync).toBeVisible();
    await evidence(page, testInfo, `workspace-${size}-sync-open`);
    const during = await editor.boundingBox();
    expect(Math.abs((during?.x ?? NaN) - (base?.x ?? NaN)), 'opening sync must not shift horizontal editor position').toBeLessThanOrEqual(2);
    expect(Math.abs((during?.y ?? NaN) - (base?.y ?? NaN)), 'opening sync must not push editor down').toBeLessThanOrEqual(2);
    await sync.getByRole('button', { name: 'بستن تنظیم همگام‌سازی' }).click();
    await expect(sync).toHaveCount(0);
    await evidence(page, testInfo, `workspace-${size}-sync-closed`);

    await menu.click();
    await page.getByRole('menuitem', { name: 'New Problem' }).click();
    const setup = page.getByRole('region', { name: 'New exercise' });
    const field = setup.getByRole('textbox', { name: 'Problem' });
    await expect(field).toBeFocused();
    await evidence(page, testInfo, `workspace-${size}-new-exercise-empty`);
    await field.fill(String.raw`\frac{3}{4}+\frac{1}{8}`);
    await evidence(page, testInfo, `workspace-${size}-new-exercise-filled`);
    await setup.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('math-div[aria-label="Original question expression"]')).toBeVisible();
    await evidence(page, testInfo, `workspace-${size}-new-exercise-started`);

    const more = page.getByRole('button', { name: 'More math tools' });
    await more.click();
    const insertDialog = page.getByRole('dialog', { name: 'Insert Math Element' });
    await expect(insertDialog).toBeVisible();
    await evidence(page, testInfo, `workspace-${size}-insert-open`);
    await page.keyboard.press('Escape');
    await expect(insertDialog).toBeHidden();
    await expect(more).toBeFocused();
    await evidence(page, testInfo, `workspace-${size}-insert-closed`);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const computed = await editor.evaluate(root => {
      const card = root.querySelector('.step');
      const button = root.querySelector('button');
      const select = (element: Element | null) => {
        if (!element) return null;
        const s = getComputedStyle(element);
        return { background: s.backgroundColor, color: s.color, border: s.borderColor, radius: s.borderRadius, padding: s.padding, font: s.fontFamily, minHeight: s.minHeight };
      };
      return { viewport: { width: innerWidth, height: innerHeight }, shell: select(root), step: select(card), button: select(button) };
    });
    await testInfo.attach(`computed-design-${size}`, { body: Buffer.from(JSON.stringify(computed, null, 2)), contentType: 'application/json' });
  }
});

test('QA-WORKSPACE-02: batch next/previous, confidence, refresh preserve the original math answer', { tag: '@only-mobile-390' }, async ({ page }, testInfo) => {
  for (const { width, height } of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize({ width, height });
    await startBatch(page);
    const label = `batch-${width}`;
    await evidence(page, testInfo, `${label}-before-edit`);
    const step = mathField(page);
    await step.click();
    await page.keyboard.type('7');
    await expect.poll(() => mathValue(step)).toContain('7');
    const preserved = await mathValue(step);
    await evidence(page, testInfo, `${label}-after-edit`);

    await page.getByRole('button', { name: /Next question/i }).click();
    const confidence = page.getByRole('dialog', { name: 'Answer confidence' });
    await expect(confidence).toBeVisible();
    await evidence(page, testInfo, `${label}-confidence-open`);
    await confidence.getByRole('radio', { name: 'Medium' }).check();
    await confidence.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Question 2' })).toBeVisible();
    await evidence(page, testInfo, `${label}-second-question`);

    await page.getByRole('button', { name: /Previous/i }).click();
    await expect(page.getByRole('heading', { name: 'Question 1' })).toBeVisible();
    await expect.poll(() => mathValue(mathField(page))).toBe(preserved);
    await evidence(page, testInfo, `${label}-restored-before-reload`);
    await page.reload();
    await expect.poll(() => mathValue(mathField(page))).toBe(preserved);
    await evidence(page, testInfo, `${label}-restored-after-reload`);
  }
});
