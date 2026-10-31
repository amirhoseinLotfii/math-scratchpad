import { expect, test } from '@playwright/test';

const viewports = [
  { width: 320, height: 740 },
  { width: 390, height: 640 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test('Practice text and choice answers remain usable across narrow, tablet and desktop layouts', async ({ page }, info) => {
  test.setTimeout(60_000);
  test.skip(info.project.name !== 'mobile-390', 'Resize through the QA viewport set once.');

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/fixtures/practice-answer-types-preview.html');
    const prompt = page.getByText('آیا این رابطه تابع است؟ اگر نه، کدام ورودی مشکل دارد؟');
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveAttribute('dir', 'rtl');
    await expect(prompt).toHaveCSS('text-align', 'right');
    await expect(page.getByRole('math', { name: 'Original question expression' })).toBeVisible();
    const header = page.locator('.app-header');
    const titleBox = await header.locator('h1').boundingBox();
    const progressBox = await header.locator('.header-progress-copy').boundingBox();
    expect(titleBox && progressBox && (titleBox.y + titleBox.height <= progressBox.y || progressBox.x >= titleBox.x + titleBox.width)).toBeTruthy();
    const answer = page.getByRole('textbox', { name: 'Answer' });
    await expect(answer).toBeVisible();
    await answer.fill('A typed practice response');
    await expect(page.getByRole('button', { name: 'Add step' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark Step 1 as final' })).toHaveCount(0);
    await page.screenshot({ path: `/tmp/math-scratchpad-practice-text-${viewport.width}x${viewport.height}.png`, fullPage: true });

    if (viewport.width < 900) {
      await page.getByRole('combobox', { name: 'Select question' }).selectOption({ label: 'Question 2 · Not started' });
    } else {
      await page.getByRole('button', { name: /Question 2 Not started/ }).click();
    }
    const greater = page.getByRole('radio', { name: '>' });
    await expect(greater).toBeVisible();
    await greater.check();
    await expect(greater).toBeChecked();
    await expect(page.getByRole('button', { name: 'Add step' })).toHaveCount(0);
    await page.screenshot({ path: `/tmp/math-scratchpad-practice-choice-${viewport.width}x${viewport.height}.png`, fullPage: true });

    if (viewport.width < 900) {
      await page.getByRole('combobox', { name: 'Select question' }).selectOption({ label: 'Question 3 · Not started' });
    } else {
      await page.getByRole('button', { name: /Question 3 Not started/ }).click();
    }
    await expect(page.getByRole('button', { name: 'Add step' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark Step 1 as final' })).toBeVisible();
    const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    await page.screenshot({ path: `/tmp/math-scratchpad-practice-answer-types-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
});
