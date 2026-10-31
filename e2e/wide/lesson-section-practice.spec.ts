import { expect, test } from '@playwright/test';

test('desktop starts the practice set assigned to the current lesson section', async ({ page }) => {
  await page.goto('/e2e/fixtures/lesson-connected-preview.html?sections=1&no-wellbeing=1');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson/ }).click();

  const lesson = page.getByRole('region', { name: 'Lesson notes' });
  await expect(lesson.getByRole('heading', { name: 'First short section' })).toBeVisible();
  await expect(lesson.getByRole('region', { name: 'Practice for this section' }).getByText('2 questions: 1 textbook and 1 extra. Textbook questions come first.')).toBeVisible();
  await lesson.getByRole('radio', { name: 'Option B' }).check();
  await lesson.getByRole('radio', { name: 'Confidence 4' }).check();
  await lesson.getByRole('button', { name: 'Practice this section · 2 questions' }).click();
  const batchStart = page.getByRole('dialog', { name: 'Before you start this batch' });
  if (await batchStart.isVisible().catch(() => false)) await batchStart.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page.getByRole('heading', { name: 'Question 1' })).toBeVisible();
  await expect(page.getByText('Sample practice 2.')).toBeVisible();
  await page.getByRole('button', { name: 'Next question →' }).click();
  const confidence = page.getByRole('dialog', { name: 'Answer confidence' });
  await confidence.getByRole('radio', { name: 'Medium' }).check();
  await confidence.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Question 2' })).toBeVisible();
  await expect(page.getByText('Sample practice 1.')).toBeVisible();
  await expect(page.getByRole('status', { name: '0 of 2 practice questions answered' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
