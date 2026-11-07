import { expect, test, type Page } from '../support/test';

async function capture(page: Page, testInfo: import('@playwright/test').TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('QA-LESSON-WIDE-01: split work pane keeps keyboard beneath selected step across widths', { tag: '@only-laptop-1440' }, async ({ page }, testInfo) => {
  for (const width of [1100, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
    const example = page.locator('.lesson-example-with-work').first();
    await capture(page, testInfo, `example-wide-${width}-before`);
    await example.getByRole('button', { name: 'Solve in Your work' }).click();
    const work = page.locator('.lesson-split-work');
    const editor = work.locator('.lesson-math-editor');
    await expect(editor).toBeVisible();
    await capture(page, testInfo, `example-wide-${width}-selected`);
    await editor.getByRole('button', { name: 'Show Keyboard' }).click();
    await expect(editor.locator('.math-keyboard')).toBeVisible();
    const firstKey = editor.locator('.math-keyboard .key-grid button').first();
    await expect(firstKey).toBeInViewport({ ratio: 0.5 });
    await capture(page, testInfo, `example-wide-${width}-keyboard-open`);

    await editor.getByRole('button', { name: 'Add step' }).click();
    await expect(editor.locator('.lesson-answer-step')).toHaveCount(2);
    const order = await editor.evaluate(root => {
      const region = root.querySelector('.lesson-answer-steps');
      const nodes = [...(region?.children ?? [])];
      const active = root.querySelector('.lesson-answer-step.current-step');
      const keyboard = root.querySelector('.lesson-active-step-keyboard');
      const key = root.querySelector('.math-keyboard .key-grid button');
      const scrollPane = root.closest('.lesson-split-work');
      const keyBounds = key?.getBoundingClientRect();
      const paneBounds = scrollPane?.getBoundingClientRect();
      return {
        keypads: root.querySelectorAll('.math-keyboard').length,
        adjacent: !!active && !!keyboard && nodes.indexOf(keyboard) === nodes.indexOf(active) + 1,
        keyboardFitsPane: !!keyBounds && !!paneBounds && keyBounds.bottom <= paneBounds.bottom + 12,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(order.keypads).toBe(1);
    expect(order.adjacent).toBe(true);
    expect(order.keyboardFitsPane).toBe(true);
    expect(order.horizontalOverflow).toBe(false);
    await capture(page, testInfo, `example-wide-${width}-after-new-step`);
    await editor.getByRole('button', { name: 'Step 1', exact: true }).click();
    const adjacentFirst = await editor.evaluate(root => {
      const children = [...root.querySelector('.lesson-answer-steps')!.children];
      return children.indexOf(root.querySelector('.lesson-active-step-keyboard')!) === children.indexOf(root.querySelector('.lesson-answer-step.current-step')!) + 1;
    });
    expect(adjacentFirst).toBe(true);
    await capture(page, testInfo, `example-wide-${width}-first-step-active`);
  }
});
