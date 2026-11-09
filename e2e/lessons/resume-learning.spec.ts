import { expect, test } from '@playwright/test';

/**
 * Continue-learning contract: the saved lesson section is offered on the main
 * screen and restored when the learner asks for it, without opening an editor.
 */
test.describe('continue learning', () => {
  test('offers the saved lesson section and resumes it without focusing an editor', async ({ page }) => {
    await page.goto('/e2e/fixtures/lesson-connected-preview.html?sections=1&no-wellbeing=1');
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Lessons' }).click();
    const picker = page.getByRole('dialog', { name: 'Lessons' });
    await picker.getByRole('button', { name: /Sample lesson.*Not started/ }).click();

    await expect(page.locator('.lesson-screen')).toBeVisible();
    await expect(page.locator('.lesson-section-label').first()).toHaveText('Section 1 of 2');

    await page.getByRole('button', { name: 'Back to question' }).click();
    const card = page.locator('.continue-learning');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Sample lesson' })).toBeVisible();
    await expect(card).toContainText('First short section');
    await expect(card).toContainText('Section 1 of 2');

    await card.getByRole('button', { name: 'Resume lesson' }).click();
    await expect(page.locator('.lesson-screen')).toBeVisible();
    await expect(page.locator('.lesson-section-label').first()).toHaveText('Section 1 of 2');
    await expect(page.getByRole('heading', { name: 'First short section' })).toBeVisible();

    // Restoration scrolls only; it must not focus a math field or open the keyboard.
    await expect(page.locator('math-field:focus')).toHaveCount(0);
    await expect(page.locator('.keyboard')).toHaveCount(0);
  });

  test('keeps one tab stop and moves between lesson tabs with arrow keys', async ({ page }) => {
    await page.goto('/e2e/fixtures/lesson-connected-preview.html?sections=1&no-wellbeing=1');
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Lessons' }).click();
    await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson.*Not started/ }).click();

    const lessonTab = page.getByRole('tab', { name: 'Lesson' });
    const workTab = page.getByRole('tab', { name: /Your work/ });
    await expect(lessonTab).toHaveAttribute('tabindex', '0');
    await expect(workTab).toHaveAttribute('tabindex', '-1');

    await lessonTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(workTab).toBeFocused();
    await expect(workTab).toHaveAttribute('aria-selected', 'true');
    await expect(workTab).toHaveAttribute('tabindex', '0');

    await page.keyboard.press('Home');
    await expect(lessonTab).toBeFocused();
    await expect(lessonTab).toHaveAttribute('aria-selected', 'true');
  });
});
