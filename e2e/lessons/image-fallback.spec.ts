import { expect, test } from '@playwright/test';

test('a failed lesson image stays concise and exposes its description on demand', { tag: '@only-mobile-390' }, async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 640 }, { width: 390, height: 844 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/fixtures/lesson-preview.html?view=image-error');
    const fallback = page.locator('.lesson-image-fallback');
    await expect(fallback.getByRole('status')).toHaveText('Image unavailable.');
    await expect(fallback.locator('details')).not.toHaveAttribute('open', '');
    await expect(fallback.getByText('Sample diagram alternative text', { exact: true })).not.toBeVisible();
    const summary = fallback.getByText('Show image description');
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(fallback.getByText('Sample diagram alternative text', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
