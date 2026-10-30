import AxeBuilder from '@axe-core/playwright';
import { dismissWellbeing, expect, test } from '../support/test';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('Learn concept, checks, summary and recovery states have no serious or critical WCAG A/AA findings', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'Audit Learn states once at the 390 px reference viewport.');
  await page.setViewportSize({ width: 390, height: 844 });

  for (const view of ['concept', 'checks', 'summary', 'loading', 'unavailable', 'empty-picker', 'image-error'] as const) {
    await page.goto(`/e2e/fixtures/lesson-preview.html?view=${view}`);
    if (view === 'image-error') await expect(page.getByRole('status')).toHaveText('Sample diagram alternative text');
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    await info.attach(`phase5-axe-${view}`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? '')), `${view} should not have serious or critical automated accessibility findings`).toEqual([]);
  }

  await page.goto('/e2e/fixtures/lesson-connected-preview.html');
  await dismissWellbeing(page);
  const learnMenu = page.getByRole('button', { name: 'Exercise menu' });
  await learnMenu.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  const lessonsItem = page.getByRole('menuitem', { name: 'Lessons' });
  for (let item = 0; item < 10 && !(await lessonsItem.evaluate(element => element === document.activeElement)); item++) await page.keyboard.press('ArrowDown');
  await expect(lessonsItem).toBeFocused();
  await page.keyboard.press('Enter');
  const picker = page.getByRole('dialog', { name: 'Lessons' });
  const lessonOption = picker.getByRole('button', { name: /Sample lesson.*Not started/ });
  await expect(lessonOption).toBeFocused();
  await page.keyboard.press('Enter');
  const conceptHeading = page.getByRole('heading', { name: 'First sample concept' });
  await expect(conceptHeading).toBeFocused();
  const ring = await conceptHeading.evaluate(element => ({ style: getComputedStyle(element).outlineStyle, color: getComputedStyle(element).outlineColor }));
  expect(ring).toMatchObject({ style: 'solid', color: 'rgb(140, 191, 255)' });
  const learnA11y = await new AxeBuilder({ page }).include('.lesson-screen').withTags(tags).analyze();
  expect(learnA11y.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);

  await page.setViewportSize({ width: 390, height: 640 });
  await page.getByRole('radio', { name: 'Option A' }).click();
  await page.getByRole('button', { name: 'Next concept →' }).click();
  const editor = page.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
  const activeCaret = editor.locator('.lesson-answer-step.current-step .token-active');
  await activeCaret.scrollIntoViewIfNeeded();
  await expect(activeCaret).toBeInViewport();
  await expect(page.getByRole('group', { name: 'Question expression' })).toBeInViewport();
  const editorA11y = await new AxeBuilder({ page }).include('.lesson-math-editor').withTags(tags).analyze();
  expect(editorA11y.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
});

test('the empty lesson bank hides the Lessons menu entry while regular practice remains visible', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'Check empty-bank behavior once at the mobile reference viewport.');
  await page.goto('/e2e/fixtures/lesson-connected-preview.html?empty=1');
  await dismissWellbeing(page);
  await expect(page.getByText('Sample practice 1.')).toBeVisible();
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Lessons' })).toHaveCount(0);
});
