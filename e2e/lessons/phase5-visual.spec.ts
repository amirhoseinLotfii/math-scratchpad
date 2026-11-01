import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { dismissWellbeing, expect, test } from '../support/test';

const sizes = [
  { suffix: 'desktop-1280x900', width: 1280, height: 900 },
];

async function capture(page: import('@playwright/test').Page, name: string, fullPage: boolean) {
  const path = resolve(`artifacts/lessons/phase5-${name}.png`);
  mkdirSync(resolve('artifacts/lessons'), { recursive: true });
  await page.screenshot({ path, fullPage });
}

async function openLesson(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson/ }).click();
  await expect(page.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
}

test('captures Phase 5 Learn and connected Practice views at desktop width', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1440', 'Generate the Phase 5 desktop screenshots once with a desktop browser context.');
  test.setTimeout(120_000);

  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
    await expect(page.getByText('1 of 2 steps shown')).toBeVisible();
    await expect(page.getByText('First sample teaching step.')).toBeVisible();
    await expect(page.getByText('Second sample teaching step.')).toHaveCount(0);
    await capture(page, `concept-example-${size.suffix}`, true);

    await page.goto('/e2e/fixtures/lesson-preview.html?view=checks');
    // Split view (>=1100px): checks are listed as links and solved one at a time in the work pane.
    const checkLinks = page.locator('.lesson-check-link');
    if (await checkLinks.count()) {
      await checkLinks.filter({ hasText: 'SAMPLE-1.1-L01' }).click();
      await expect(page.getByRole('radio', { name: 'Option A' })).toBeVisible();
      await checkLinks.filter({ hasText: 'SAMPLE-1.1-L02' }).click();
    } else {
      await expect(page.getByRole('radio', { name: 'Option A' })).toBeVisible();
    }
    await expect(page.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' })).toBeVisible();
    await capture(page, `inline-checks-${size.suffix}`, true);

    await page.goto('/e2e/fixtures/lesson-preview.html?view=summary');
    await expect(page.getByRole('heading', { name: 'Lesson summary' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start practice' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review lesson' })).toBeVisible();
    await capture(page, `summary-${size.suffix}`, true);

    await page.goto('/e2e/fixtures/lesson-connected-preview.html');
    await dismissWellbeing(page);
    await expect(page.getByText('Sample practice 1.')).toBeVisible();
    await page.getByRole('button', { name: 'Lesson' }).click();
    const reference = page.getByRole('dialog', { name: 'Sample lesson' });
    await expect(reference).toBeVisible();
    await expect(reference.getByText('Another sample concept')).toHaveCount(0);
    await reference.getByRole('button', { name: 'Next section →' }).click();
    await expect(reference.getByRole('heading', { name: 'Another sample concept' })).toBeVisible();
    await capture(page, `practice-lesson-panel-${size.suffix}`, false);

    await page.goto('/e2e/fixtures/lesson-connected-preview.html');
    await dismissWellbeing(page);
    await openLesson(page);
    await page.getByRole('button', { name: 'Back to question' }).click();
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Lessons' }).click();
    const picker = page.getByRole('dialog', { name: 'Lessons' });
    await expect(picker.getByRole('button', { name: /Sample lesson.*Learning/ })).toBeVisible();
    await capture(page, `lesson-picker-status-${size.suffix}`, false);
  }
});
