import { expect, test } from '@playwright/test';

const viewports = [
  { width: 320, height: 740 },
  { width: 360, height: 800 },
  { width: 390, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 844 },
];
const persianTitle = 'توابع و تابع‌نما';
const mixedText = 'در این توضیح، عبارت انگلیسی (Functions and Function Notation) و (domain and range) با ترتیب درست نمایش داده می‌شوند.';

test('Persian lesson content stays RTL and long titles wrap in Learn and the read-only reference', async ({ page }, info) => {
  test.setTimeout(90_000);
  test.skip(info.project.name !== 'mobile-390', 'Resize through the narrow-mobile QA viewport set once.');

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/fixtures/lesson-connected-preview.html?no-wellbeing=1&bidi=1');

    await page.getByRole('button', { name: 'Lesson' }).click();
    const reference = page.getByRole('dialog', { name: persianTitle });
    await expect(reference).toBeVisible();
    const referenceTitle = reference.locator('> h2');
    await expect(referenceTitle).toHaveAttribute('dir', 'rtl');
    await expect(referenceTitle).toHaveCSS('text-align', 'start');
    await expect(referenceTitle).toHaveText(persianTitle);
    await expect(referenceTitle.locator('bdi[lang="en"]')).toHaveCount(0);
    const referenceConceptTitle = reference.locator('h2[id^="reference-concept-"]').first();
    await expect(referenceConceptTitle).toHaveText('تعریف تابع');
    await expect(referenceConceptTitle.locator('bdi[lang="en"]')).toHaveCount(0);
    const referenceSize = await referenceTitle.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(referenceSize.scroll).toBeLessThanOrEqual(referenceSize.client + 1);
    const referenceParagraph = reference.locator('.lesson-block-paragraph[lang="fa"]').filter({ hasText: mixedText });
    await expect(referenceParagraph).toHaveAttribute('dir', 'rtl');
    await expect(referenceParagraph).toHaveCSS('text-align', 'start');
    const proseRuns = referenceParagraph.locator('bdi:not(.lesson-inline-math)');
    await expect(proseRuns).toHaveCount(2);
    expect(await proseRuns.allTextContents()).toEqual(['(Functions and Function Notation)', '(domain and range)']);
    for (const run of await proseRuns.all()) await expect(run).toHaveCSS('display', 'inline-block');
    const referenceDimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(referenceDimensions.document).toBeLessThanOrEqual(referenceDimensions.viewport);
    await page.screenshot({ path: `/tmp/math-scratchpad-bidi-reference-${viewport.width}x${viewport.height}.png`, fullPage: true });

    await reference.getByRole('button', { name: 'بازگشت به سؤال' }).click();
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Lessons' }).click();
    await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /توابع و تابع‌نما/ }).click();

    const lessonTitle = page.locator('.lesson-header h1');
    await expect(lessonTitle).toHaveText(persianTitle);
    await expect(lessonTitle).toHaveAttribute('dir', 'rtl');
    await expect(lessonTitle).toHaveCSS('text-align', 'start');
    await expect(lessonTitle.locator('bdi[lang="en"]')).toHaveCount(0);
    const lessonConceptTitle = page.locator('#lesson-concept-title');
    await expect(lessonConceptTitle).toHaveText('تعریف تابع');
    await expect(lessonConceptTitle.locator('bdi[lang="en"]')).toHaveCount(0);
    const lessonSize = await lessonTitle.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(lessonSize.scroll).toBeLessThanOrEqual(lessonSize.client + 1);
    const lessonParagraph = page.locator('.lesson-screen .lesson-block-paragraph[lang="fa"]').filter({ hasText: mixedText });
    await expect(lessonParagraph).toHaveAttribute('dir', 'rtl');
    const lessonRuns = lessonParagraph.locator('bdi:not(.lesson-inline-math)');
    await expect(lessonRuns).toHaveCount(2);
    expect(await lessonRuns.allTextContents()).toEqual(['(Functions and Function Notation)', '(domain and range)']);
    for (const run of await lessonRuns.all()) await expect(run).toHaveCSS('display', 'inline-block');
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await page.screenshot({ path: `/tmp/math-scratchpad-bidi-learn-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
});
