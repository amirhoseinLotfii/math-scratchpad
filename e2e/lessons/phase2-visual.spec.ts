import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const screenshot = async (page: import('@playwright/test').Page, file: string, fullPage = true) => {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage });
};

test('renders the lesson concept and inline checks at mobile and tablet sizes', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'mobile-390') return;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
  await expect(page.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
  await expect(page.getByText('First sample teaching step.')).toBeVisible();
  await expect(page.getByText('Second sample teaching step.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show next step' })).toHaveAttribute('aria-expanded', 'true');
  await screenshot(page, 'artifacts/lessons/phase2-concept-example-mobile-390.png');

  await page.goto('/e2e/fixtures/lesson-preview.html?view=choice');
  await expect(page.getByRole('radio', { name: 'Option A' })).toBeVisible();
  await page.getByRole('radio', { name: 'Option B' }).check();
  await expect(page.getByRole('radio', { name: 'Option B' })).toBeChecked();
  await screenshot(page, 'artifacts/lessons/phase2-choice-check-mobile-390.png');

  await page.goto('/e2e/fixtures/lesson-preview.html?view=math');
  await expect(page.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' })).toBeVisible();
  await page.locator('.lesson-math-editor').getByRole('button', { name: 'Show Keyboard' }).click();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Edit history' })).not.toBeVisible();
  await screenshot(page, 'artifacts/lessons/phase2-math-check-mobile-390.png');
  await page.setViewportSize({ width: 390, height: 640 });
  await page.evaluate(() => {
    const editor = document.querySelector('.lesson-math-editor')!;
    window.scrollTo(0, editor.getBoundingClientRect().top + window.scrollY - 160);
  });
  await expect(page.locator('.lesson-math-editor .current-step')).toBeInViewport();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await expect(page.locator('.lesson-check-source')).toHaveCSS('position', 'sticky');
  await screenshot(page, 'artifacts/lessons/phase2-math-keyboard-short-mobile-390.png', false);
  await page.getByRole('button', { name: 'Fraction', exact: true }).click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'More tools', exact: true }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  const lessonField = page.locator('.lesson-math-editor math-field[aria-label="Step 1 expression"]');
  await expect.poll(() => lessonField.evaluate(element => (element as HTMLElement & { value: string }).value)).toMatch(/\\frac\{?8\}?\{?3\}?/);
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
  await expect(page.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
  await screenshot(page, 'artifacts/lessons/phase2-concept-example-tablet-1024.png');

  for (const viewport of [{ width: 390, height: 640 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      lesson: document.querySelector('.lesson-screen')?.getBoundingClientRect().width ?? 0,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.lesson).toBeGreaterThan(0);
  }
});
