import { expect, test } from '../support/test';

const fixture = '/e2e/fixtures/lesson-preview.html?view=stacked';

test('four inline lesson checks keep only one keypad open, visible below its active step', { tag: '@only-mobile-390' }, async ({ page }) => {
  for (const size of [
    { width: 320, height: 568 }, { width: 390, height: 640 },
    { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(fixture);
    const cards = page.locator('.lesson-check');
    await expect(cards).toHaveCount(4);
    await cards.nth(1).getByRole('button', { name: 'Solve this check' }).click();
    await expect.poll(() => cards.nth(1).evaluate(article => article.contains(document.activeElement) || !!article.querySelector('math-field')?.shadowRoot?.activeElement)).toBe(true);
    await cards.nth(1).getByRole('button', { name: 'Show Keyboard' }).click();
    const second = cards.nth(1);
    await expect(second.locator('.math-keyboard')).toBeVisible();
    await expect(page.locator('.lesson-check .math-keyboard')).toHaveCount(1);
    // First actual digit key must be available without another manual scroll.
    const key = second.locator('.math-keyboard .key-grid button').first();
    await expect(key).toBeInViewport({ ratio: 0.6 });
    const layout = await second.evaluate(element => {
      const field = element.querySelector('.lesson-answer-steps')!.getBoundingClientRect();
      const keyboard = element.querySelector('.math-keyboard')!.getBoundingClientRect();
      return { fieldBottom: field.bottom, keyboardTop: keyboard.top };
    });
    expect(layout.keyboardTop).toBeGreaterThanOrEqual(layout.fieldBottom - 2);
    const activeMath = cards.nth(1).locator('math-field').first();
    await activeMath.click();
    await page.keyboard.type('7');
    const written = await activeMath.evaluate(element => (element as HTMLElement & { value: string }).value);
    expect(written).toContain('7');
    await cards.nth(2).getByRole('button', { name: 'Solve this check' }).click();
    await cards.nth(2).getByRole('button', { name: 'Show Keyboard' }).click();
    await expect(cards.nth(1).locator('.math-keyboard')).toHaveCount(0);
    await expect(cards.nth(2).locator('.math-keyboard')).toBeVisible();
    // Switching editors must preserve the first math expression.
    await cards.nth(1).getByRole('button', { name: /Continue this check|Solve this check/ }).click();
    await cards.nth(1).getByRole('button', { name: 'Show Keyboard' }).click();
    await expect(cards.nth(2).locator('.math-keyboard')).toHaveCount(0);
    expect(await activeMath.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(written);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
