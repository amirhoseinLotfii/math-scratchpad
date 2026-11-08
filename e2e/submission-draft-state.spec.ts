import { expect, test } from './support/test';

test.use({ autoDismissWellbeing: false });

test('editing a submitted math answer returns it to Draft until confidence is confirmed again', { tag: '@only-mobile-390' }, async ({ page }) => {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Show more' }).click();
    await page.getByRole('menuitem', { name: 'Practice', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Start Round 1 · 20 fraction questions' }).click();
    await page.getByRole('button', { name: 'Start 20 Questions' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    const show = page.getByRole('button', { name: 'Show Keyboard' });
    if (await show.count()) await show.click();
    const keys = page.getByRole('group', { name: 'Numeric keys' });
    await keys.getByRole('button', { name: '7', exact: true }).click();
    await page.getByRole('button', { name: /Next question/i }).click();
    const confidence = page.getByRole('dialog', { name: 'Answer confidence' });
    await confidence.getByRole('radio', { name: 'Medium' }).click();
    await confidence.getByRole('button', { name: 'Continue' }).click();
    const nav = page.getByRole('combobox', { name: 'Select question' });
    await expect(nav.locator('option').first()).toContainText('Answered');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Select question' }).locator('option').first()).toContainText('Answered');
    await nav.selectOption({ index: 0 });
    await keys.getByRole('button', { name: '8', exact: true }).click();
    await expect(nav.locator('option').first()).toContainText('Draft');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Select question' }).locator('option').first()).toContainText('Draft');
    await page.getByRole('button', { name: /Next question/i }).click();
    const updatedConfidence = page.getByRole('dialog', { name: 'Answer confidence' });
    await updatedConfidence.getByRole('radio', { name: 'High' }).click();
    await updatedConfidence.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('combobox', { name: 'Select question' }).locator('option').first()).toContainText('Answered');
  }
});
