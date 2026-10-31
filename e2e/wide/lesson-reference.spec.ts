import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('desktop lesson reference keeps section navigation clear, collapsible and keyboard accessible', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/e2e/fixtures/lesson-connected-preview.html?no-wellbeing=1');
  await expect(page.getByText('Sample practice 1.')).toBeVisible();
  await page.getByRole('button', { name: 'Lesson' }).click();

  const reference = page.getByRole('dialog', { name: 'Sample lesson' });
  const infoToggle = reference.getByRole('button', { name: 'Lesson information' });
  const metadata = reference.locator('.lesson-reference-metadata');
  await expect(reference).toBeVisible();
  await expect(infoToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(metadata).toBeHidden();
  await expect(reference.locator('.lesson-reference-navigation p')).toContainText('Section 1 of 2');
  await infoToggle.focus();
  await page.keyboard.press('Enter');
  await expect(infoToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(metadata).toBeVisible();
  const expandedA11y = await new AxeBuilder({ page }).include('.lesson-reference-dialog').analyze();
  expect(expandedA11y.violations.filter(item => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  await reference.getByRole('button', { name: 'Hide lesson information' }).click();
  await expect(metadata).toBeHidden();

  const content = reference.locator('.lesson-reference-content');
  await content.evaluate(element => { element.style.flex = 'none'; element.style.height = '80px'; element.scrollTop = element.scrollHeight; });
  await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await reference.getByRole('button', { name: 'Next section →' }).click();
  await expect(reference.getByRole('heading', { name: 'Another sample concept' })).toBeVisible();
  await expect.poll(() => content.evaluate(element => element.scrollTop)).toBe(0);
  await content.evaluate(element => { element.style.removeProperty('flex'); element.style.removeProperty('height'); });

  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  const panel = await reference.boundingBox();
  expect(panel?.width).toBeGreaterThan(550);
  expect(panel?.width).toBeLessThanOrEqual(840);
  await reference.getByRole('button', { name: 'Open this section in the interactive lesson' }).click();
  await expect(page.locator('.lesson-screen').getByRole('heading', { name: 'Another sample concept' })).toBeVisible();
});
