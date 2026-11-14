import { expect, test } from '@playwright/test';

/** WCAG 2.2 (2.5.7): the split pane must resize without a drag gesture. */
test.describe('split pane resize controls', () => {
  test('widens and narrows the lesson pane with pointer-operable buttons', { tag: '@only-laptop-1440' }, async ({ page }) => {
    await page.goto('/e2e/fixtures/lesson-connected-preview.html?sections=1&no-wellbeing=1');
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Lessons' }).click();
    await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson.*Not started/ }).click();

    const separator = page.getByRole('separator', { name: 'Resize lesson panel' });
    await expect(separator).toBeVisible();
    await expect(separator).toHaveAttribute('aria-valuenow', '50');

    const wider = page.getByRole('button', { name: 'Wider lesson panel' });
    const narrower = page.getByRole('button', { name: 'Narrower lesson panel' });
    await expect(wider).toBeVisible();
    await expect(narrower).toBeVisible();

    await wider.click();
    await expect(separator).toHaveAttribute('aria-valuenow', '55');
    await narrower.click();
    await expect(separator).toHaveAttribute('aria-valuenow', '50');

    // 50 → 55 → 60 → 65 → 70, where the wider control reaches its maximum.
    for (let step = 0; step < 4; step += 1) await wider.click();
    await expect(separator).toHaveAttribute('aria-valuenow', '70');
    await expect(wider).toBeDisabled();
    await expect(narrower).toBeEnabled();
  });
});
