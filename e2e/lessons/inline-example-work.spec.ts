import { expect, test } from '../support/test';

test('worked example opens its real saved math editor immediately below the example', { tag: '@only-mobile-390' }, async ({ page }) => {
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
    const example = page.locator('.lesson-example-with-work').first();
    await expect(example.getByRole('button', { name: 'Solve this example here' })).toBeVisible();
    await example.getByRole('button', { name: 'Solve this example here' }).click();
    const work = example.locator('.lesson-example-work');
    const math = work.locator('math-field').first();
    await expect.poll(() => math.evaluate(element => element === document.activeElement || !!element.shadowRoot?.activeElement)).toBe(true);
    await expect(math).toBeVisible();
    await math.click();
    await page.keyboard.type('7');
    const written = await math.evaluate(element => (element as HTMLElement & { value: string }).value);
    expect(written).toContain('7');
    await work.getByRole('button', { name: 'Show Keyboard' }).click();
    await expect(work.locator('.math-keyboard')).toBeVisible();
    await example.getByRole('button', { name: 'Close example editor' }).click();
    await example.getByRole('button', { name: 'Solve this example here' }).click();
    expect(await example.locator('math-field').first().evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(written);
    await page.getByRole('tab', { name: /Your work/ }).click();
    await expect(page.locator('.lesson-work-pane math-field').first()).toBeVisible();
    expect(await page.locator('.lesson-work-pane math-field').first().evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(written);
  }
});
