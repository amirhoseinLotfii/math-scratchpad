import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const views = [
  { width: 320, height: 740 },
  { width: 390, height: 640 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test('connected Learn flow, reference panel and responsive layouts', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  if (testInfo.project.name !== 'mobile-390') test.skip();
  await page.addInitScript(() => localStorage.removeItem('math-scratchpad-lesson-progress-v1:sample-lessons:sample-v1-browser-preview'));

  for (const viewport of views) {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/fixtures/lesson-connected-preview.html');
    const batchStart = page.getByRole('dialog', { name: 'Before you start this batch' });
    if (await batchStart.isVisible().catch(() => false)) await batchStart.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByText('Sample practice 1.')).toBeVisible();
    await expect(page.locator('.step.current-step')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

    const lessonButton = page.getByRole('button', { name: 'Lesson' });
    await expect(lessonButton).toBeVisible();
    await lessonButton.click();
    const reference = page.getByRole('dialog', { name: 'Sample lesson' });
    await expect(reference).toBeVisible();
    await expect(reference.locator('.lesson-reference-content .lesson-block-paragraph[lang="fa"][dir="rtl"]')).toContainText('این متن فارسیِ آزمایشی');
    await expect(reference.getByText('Another sample concept')).toBeVisible();
    await expect(reference.getByRole('radio')).toHaveCount(0);
    if (viewport.width === 390 && viewport.height === 844) {
      const referenceA11y = await new AxeBuilder({ page }).include('.lesson-reference-dialog').analyze();
      expect(referenceA11y.violations.filter(item => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
      await expect.poll(() => reference.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
      for (let tab = 0; tab < 5; tab++) {
        await page.keyboard.press('Tab');
        await expect.poll(() => reference.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
      }
    }
    await page.screenshot({ path: `/tmp/math-scratchpad-phase3-reference-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(reference).toBeHidden();
    await expect(lessonButton).toBeFocused();

    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Lessons' }).click();
    await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson.*Not started/ }).click();
    await expect(page.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
    const learnDimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(learnDimensions.document).toBeLessThanOrEqual(learnDimensions.viewport);
    await page.screenshot({ path: `/tmp/math-scratchpad-phase4-learn-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Back to question' }).click();
    await expect(page.getByText('Sample practice 1.')).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/e2e/fixtures/lesson-connected-preview.html');
  const batchStart = page.getByRole('dialog', { name: 'Before you start this batch' });
  if (await batchStart.isVisible().catch(() => false)) await batchStart.getByRole('button', { name: 'Skip for now' }).click();
  const exerciseMenu = page.getByRole('button', { name: 'Exercise menu' });
  await exerciseMenu.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  const lessonsMenuItem = page.getByRole('menuitem', { name: 'Lessons' });
  for (let item = 0; item < 10 && !(await lessonsMenuItem.evaluate(element => element === document.activeElement)); item++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(lessonsMenuItem).toBeFocused();
  await page.keyboard.press('Enter');
  const picker = page.getByRole('dialog', { name: 'Lessons' });
  await expect(picker.getByText('Sample book · 1.1')).toBeVisible();
  const lessonOption = picker.getByRole('button', { name: /Sample lesson.*Not started/ });
  await expect(lessonOption).toBeFocused();
  await page.keyboard.press('Enter');
  const learn = page.locator('.lesson-screen');
  await expect(learn.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
  await expect(learn.locator('.lesson-block-paragraph[lang="fa"][dir="rtl"]')).toContainText('این متن فارسیِ آزمایشی');
  const learnA11y = await new AxeBuilder({ page }).include('.lesson-screen').analyze();
  expect(learnA11y.violations.filter(item => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  await page.screenshot({ path: '/tmp/math-scratchpad-phase3-learn-mobile-390x640.png', fullPage: true });

  await learn.getByRole('radio', { name: 'Option A' }).click();
  await learn.getByRole('button', { name: 'Next concept →' }).click();
  const mathEditor = learn.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
  await mathEditor.getByRole('button', { name: '8', exact: true }).click();
  await expect(mathEditor.locator('.lesson-answer-step.current-step .token-active')).toBeInViewport();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  const pinnedExpression = learn.getByRole('group', { name: 'Question expression' });
  await expect(pinnedExpression).toHaveCSS('position', 'sticky');
  await expect(pinnedExpression).toBeInViewport();
  await page.screenshot({ path: '/tmp/math-scratchpad-phase3-learn-math-mobile-390x640.png', fullPage: true });

  await learn.getByRole('button', { name: 'Skip to practice' }).click();
  const skipDialog = page.getByRole('dialog', { name: 'Skip to practice?' });
  await expect(skipDialog).toBeVisible();
  await skipDialog.getByRole('button', { name: 'Skip to practice' }).click();
  await expect(page.getByText('Sample practice 1.')).toBeVisible();
  await expect(page.getByText('Sample practice 2.')).toHaveCount(0);
  const practiceStart = page.getByRole('dialog', { name: 'Before you start this batch' });
  if (await practiceStart.isVisible().catch(() => false)) await practiceStart.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Lesson' }).click();
  await expect(page.getByRole('dialog', { name: 'Sample lesson' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  await expect(page.getByRole('dialog', { name: 'Lessons' }).getByText('Practising')).toBeVisible();
});
