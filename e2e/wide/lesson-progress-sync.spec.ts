import { expect, test } from '@playwright/test';

test('lesson answers and the active page synchronize between desktop tabs', async ({ page, context }) => {
  const otherTab = await context.newPage();
  const route = '/e2e/fixtures/lesson-connected-preview.html?no-wellbeing=1';
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto(route);
  await otherTab.goto(route);

  const openLesson = async (target: typeof page) => {
    const batchStart = target.getByRole('dialog', { name: 'Before you start this batch' });
    if (await batchStart.isVisible().catch(() => false)) await batchStart.getByRole('button', { name: 'Skip for now' }).click();
    await target.getByRole('button', { name: 'Exercise menu' }).click();
    await target.getByRole('menuitem', { name: 'Lessons' }).click();
    await target.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson/ }).click();
    return target.getByRole('region', { name: 'Lesson notes' });
  };

  const firstLesson = await openLesson(page);
  const secondLesson = await openLesson(otherTab);
  await expect(firstLesson.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
  await expect(secondLesson.getByRole('heading', { name: 'First sample concept' })).toBeVisible();

  await firstLesson.getByRole('radio', { name: 'Option A' }).check();
  await firstLesson.getByRole('radio', { name: 'Confidence 4' }).check();
  await firstLesson.getByRole('button', { name: 'Next section →' }).click();
  await expect(secondLesson.getByRole('heading', { name: 'Another sample concept' })).toBeVisible();
  await expect.poll(() => otherTab.evaluate(() => JSON.parse(localStorage.getItem('math-scratchpad-lesson-progress-v1:sample-lessons:sample-v1-browser-preview') ?? '{}').lessons?.['SAMPLE-1.1']?.currentSectionIndex)).toBe(1);
  const saved = await otherTab.evaluate(() => JSON.parse(localStorage.getItem('math-scratchpad-lesson-progress-v1:sample-lessons:sample-v1-browser-preview') ?? '{}').lessons?.['SAMPLE-1.1']);
  expect(saved).toMatchObject({ currentSectionIndex: 1, answeredCheckIds: ['SAMPLE-1.1-L01'], checkAnswers: { 'SAMPLE-1.1-L01': { type: 'choice', value: 'Option A' } }, confidenceByCheckId: { 'SAMPLE-1.1-L01': 4 } });

  // Verify the same saved location and answer after a fresh app load.
  await page.close();
  await otherTab.reload();
  const restoredLesson = await openLesson(otherTab);
  await expect(restoredLesson.getByRole('heading', { name: 'Another sample concept' })).toBeVisible();
  await restoredLesson.getByRole('button', { name: '← Previous section' }).click();
  await expect(restoredLesson.getByRole('radio', { name: 'Option A' })).toBeChecked();
  await expect(restoredLesson.getByRole('radio', { name: 'Confidence 4' })).toBeChecked();
});
