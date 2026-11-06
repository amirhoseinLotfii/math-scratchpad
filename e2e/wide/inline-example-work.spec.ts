import { expect, test } from '../support/test';

test('desktop example action selects the same example in the split work editor', { tag: '@only-laptop-1440' }, async ({ page }) => {
  for (const width of [1100, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
    await page.locator('.lesson-example-with-work').first().getByRole('button', { name: 'Solve in Your work' }).click();
    const selected = page.getByRole('combobox', { name: 'What are you working on?' });
    await expect(selected).toBeFocused();
    await expect(selected.locator('option:checked')).toContainText('Worked example');
    await expect(page.locator('.lesson-split-work math-field').first()).toBeVisible();
  }
});
