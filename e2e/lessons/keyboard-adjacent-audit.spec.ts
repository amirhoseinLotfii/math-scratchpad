import { expect, test, type Locator, type Page } from '../support/test';

/** Evidence is from synthetic lesson fixtures only; never capture actual learner answers. */
async function capture(page: Page, testInfo: import('@playwright/test').TestInfo, id: string) {
  const path = testInfo.outputPath(`${id}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(id, { path, contentType: 'image/png' });
}

async function expectKeyboardBelowActiveStep(editor: Locator, activeIndex: number) {
  const positions = await editor.evaluate((root, index) => {
    const region = root.querySelector('.lesson-answer-steps');
    const children = [...(region?.children ?? [])];
    const steps = children.filter(node => node.classList.contains('lesson-answer-step'));
    const keyboard = children.find(node => node.classList.contains('lesson-active-step-keyboard'));
    const step = steps[index];
    const firstKey = keyboard?.querySelector('.key-grid button');
    const keyBounds = firstKey?.getBoundingClientRect();
    const stepBounds = step?.getBoundingClientRect();
    return {
      steps: steps.length,
      keypads: root.querySelectorAll('.math-keyboard').length,
      followsActive: !!step && !!keyboard && children.indexOf(keyboard) === children.indexOf(step) + 1,
      verticalOrder: !!keyBounds && !!stepBounds && keyBounds.top >= stepBounds.bottom - 2,
      keyWidth: keyBounds?.width ?? 0,
      keyHeight: keyBounds?.height ?? 0,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, activeIndex);
  expect(positions.keypads).toBe(1);
  expect(positions.followsActive).toBe(true);
  expect(positions.verticalOrder).toBe(true);
  expect(positions.keyWidth).toBeGreaterThanOrEqual(44);
  expect(positions.keyHeight).toBeGreaterThanOrEqual(48);
  expect(positions.pageOverflow).toBe(false);
}

test('QA-LESSON-MOBILE-01: each inline check keeps a single keyboard immediately after its active step', { tag: '@only-mobile-390' }, async ({ page }, testInfo) => {
  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 390, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
  ]) {
    const size = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/fixtures/lesson-preview.html?view=stacked');
    const checks = page.locator('.lesson-check');
    await expect(checks).toHaveCount(4);
    await capture(page, testInfo, `check-${size}-before-expand`);

    const check = checks.nth(1);
    await check.getByRole('button', { name: 'Solve this check' }).click();
    const editor = check.locator('.lesson-math-editor');
    await expect(editor).toBeVisible();
    await capture(page, testInfo, `check-${size}-after-expand`);
    const toggle = check.getByRole('button', { name: 'Show Keyboard' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(check.locator('.math-keyboard')).toBeVisible();
    await expectKeyboardBelowActiveStep(editor, 0);
    await capture(page, testInfo, `check-${size}-keyboard-open`);

    const firstField = check.locator('.lesson-answer-step').first().locator('math-field');
    await firstField.click();
    await page.keyboard.type('7');
    await expect.poll(() => firstField.evaluate(el => (el as HTMLElement & { value: string }).value)).toContain('7');
    const initialValue = await firstField.evaluate(el => (el as HTMLElement & { value: string }).value);
    await check.getByRole('button', { name: 'Add step' }).click();
    await expect(check.locator('.lesson-answer-step')).toHaveCount(2);
    await expectKeyboardBelowActiveStep(editor, 1);
    await capture(page, testInfo, `check-${size}-second-step-active`);

    await check.getByRole('button', { name: 'Step 1', exact: true }).click();
    await expectKeyboardBelowActiveStep(editor, 0);
    expect(await firstField.evaluate(el => (el as HTMLElement & { value: string }).value)).toBe(initialValue);
    await capture(page, testInfo, `check-${size}-first-step-reactivated`);
    await check.getByRole('button', { name: 'Hide Keyboard' }).click();
    await expect(check.locator('.math-keyboard')).toHaveCount(0);
    await capture(page, testInfo, `check-${size}-keyboard-closed`);

    await checks.nth(2).getByRole('button', { name: 'Solve this check' }).click();
    await checks.nth(2).getByRole('button', { name: 'Show Keyboard' }).click();
    await expect(check.locator('.math-keyboard')).toHaveCount(0);
    await expect(page.locator('.lesson-check .math-keyboard')).toHaveCount(1);
    await capture(page, testInfo, `check-${size}-switched-check`);
  }
});

test('QA-LESSON-MOBILE-02: example editing uses the same step-adjacent keyboard without losing work', { tag: '@only-mobile-390' }, async ({ page }, testInfo) => {
  for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    const size = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
    const example = page.locator('.lesson-example-with-work').first();
    await capture(page, testInfo, `example-${size}-before`);
    await example.getByRole('button', { name: 'Solve this example here' }).click();
    const editor = example.locator('.lesson-math-editor');
    await expect(editor).toBeVisible();
    await example.getByRole('button', { name: 'Show Keyboard' }).click();
    await expectKeyboardBelowActiveStep(editor, 0);
    await capture(page, testInfo, `example-${size}-keyboard-open`);
    const first = editor.locator('math-field').first();
    await first.click();
    await page.keyboard.type('8');
    const value = await first.evaluate(el => (el as HTMLElement & { value: string }).value);
    expect(value).toContain('8');
    await editor.getByRole('button', { name: 'Add step' }).click();
    await expectKeyboardBelowActiveStep(editor, 1);
    await capture(page, testInfo, `example-${size}-new-step`);
    await example.getByRole('button', { name: 'Close example editor' }).click();
    await example.getByRole('button', { name: 'Solve this example here' }).click();
    await expect.poll(() => example.locator('math-field').first().evaluate(el => (el as HTMLElement & { value: string }).value)).toBe(value);
    await capture(page, testInfo, `example-${size}-reopened-with-work`);
  }
});
