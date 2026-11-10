import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../support/test';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function verifyThemeJourney(page: Page) {
  await page.goto('/');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Switch to light theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  const lightTokens = await page.evaluate(() => ({
    background: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(),
    foreground: getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim(),
    colorScheme: getComputedStyle(document.querySelector('#math-scratchpad-redux')!).colorScheme,
  }));
  expect(lightTokens).toEqual({ background: '#f5f7f5', foreground: '#17211b', colorScheme: 'light' });

  const accessibility = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Switch to dark theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
}

test('mobile light and dark theme choices persist and retain accessible contrast', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyThemeJourney(page);
});

test('desktop light and dark theme choices persist and retain accessible contrast', { tag: '@only-laptop-1440' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await verifyThemeJourney(page);
});
