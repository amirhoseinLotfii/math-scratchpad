import { expect, test } from '@playwright/test';

test('cumulative mixed review hides tags until an answer and saves the attempt at desktop and mobile sizes', async ({ page }, info) => {
  const sizes: Record<string, { width: number; height: number }> = {
    'mobile-390': { width: 390, height: 844 },
    'desktop-1280-active': { width: 1280, height: 900 },
    'laptop-1440': { width: 1440, height: 900 },
  };
  const size = sizes[info.project.name];
  if (!size) test.skip();
  await page.setViewportSize(size);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/e2e/fixtures/enhanced-bank-preview.html');
  await expect(page.locator('.problem .lesson-extra-source-badge')).toHaveText('⭐ غیرکتابی (هم‌سطح کتاب)');

  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  const picker = page.getByRole('dialog', { name: 'درس‌ها' });
  const lessonGroup = picker.locator('.lesson-picker-group').filter({ hasText: '1.4' });
  await lessonGroup.getByRole('button').click();

  await expect(page.getByRole('heading', { name: 'جمع‌بندی فصل' })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`mixed-review-summary-${info.project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: /شروع مرور ترکیبی/ }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.locator('.problem')).toBeVisible();
  await expect(page.locator('.mixed-review-reveal')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lesson' })).toHaveCount(0);
  await expect(page.locator('.problem .lesson-extra-source-badge')).toBeVisible();
  const mixedLessons = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('math-scratchpad-drive-bank-cache-v1:e2e-chapter-one-v23')!);
    const progressKey = Object.keys(localStorage).find(key => key.startsWith('math-scratchpad-lesson-progress-v1:'))!;
    const progress = JSON.parse(localStorage.getItem(progressKey)!);
    const run = progress.lessons['PC-1.4'].mixedReviewRuns[0];
    const lessonByQuestion = new Map(cache.bank.questions.map((question: { id: string; tags?: { lesson?: string } }) => [question.id, question.tags?.lesson]));
    return new Set(run.questionIds.map((id: string) => lessonByQuestion.get(id))).size;
  });
  expect(mixedLessons).toBeGreaterThan(1);
  await expect(page.locator('.question-statement')).not.toContainText(/PC-1\.[1-7]|پیش‌حسابان\s+[۰-۹\d]+\s*·/u);
  await expect(page.locator('.question-statement')).not.toContainText(/پیوند با کتاب|تمرین کتاب\s*·\s*بخش\s+[۰-۹\d.٫]+\s*·\s*شماره/u);

  const textAnswer = page.locator('.work-pane textarea');
  if (await textAnswer.count()) {
    await textAnswer.first().fill('پاسخ خودم برای مرور ترکیبی');
  } else {
    const mathField = page.locator('.work-pane math-field[aria-label="Step 1 expression"]');
    await expect(mathField).toBeVisible();
    await mathField.pressSequentially('2');
  }
  await expect(page.locator('.mixed-review-reveal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lesson' })).toBeVisible();
  await expect(page.getByText('بدون کلید؛ برای بررسی خروجی را بفرست')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`mixed-review-answer-${info.project.name}.png`), fullPage: true });

  const progressKey = await page.evaluate(() => Object.keys(localStorage).find(key => key.startsWith('math-scratchpad-lesson-progress-v1:')));
  expect(progressKey).toBeTruthy();
  await expect.poll(async () => {
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key!)!), progressKey);
    const run = saved.lessons['PC-1.4'].mixedReviewRuns[0];
    return Object.values(run.results as Record<string, { status: string; answer?: string; steps?: { latex: string }[] }>).some(result =>
      result.status === 'draft' && (!!result.answer?.trim() || result.steps?.some(step => step.latex.trim())));
  }).toBe(true);
});
