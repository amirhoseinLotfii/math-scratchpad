import { expect, test, type Page } from '@playwright/test';
import { readLearningCache } from '../support/indexeddb';
import { READING_POSITION_STORAGE_KEY } from '../../src/features/progress/reading-position-storage';

async function openSampleLesson(page: Page) {
  const setup = page.getByRole('dialog', { name: 'Before you start this batch' });
  if (await setup.isVisible().catch(() => false)) await setup.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson/ }).click();
  await expect(page.getByRole('region', { name: 'Lesson notes' })).toBeVisible();
}

test('lesson reading anchor and relative scroll restore after reload at a different viewport', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('/e2e/fixtures/lesson-connected-preview.html?sections&no-wellbeing=1');
  await openSampleLesson(page);

  await expect(page.locator('[data-anchor-id]').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(async () => {
    const raw = await readLearningCache(page, READING_POSITION_STORAGE_KEY);
    if (!raw) return 0;
    const saved = JSON.parse(raw);
    return saved.scrollOffset ?? 0;
  }).toBeGreaterThan(0);

  const raw = await readLearningCache(page, READING_POSITION_STORAGE_KEY);
  expect(raw).not.toBeNull();
  const saved = JSON.parse(raw!);
  expect(saved.lessonId).toBe('SAMPLE-1.1');
  expect(saved.contentAnchorId).toBeTruthy();
  expect(saved.relativeOffset).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.evaluate(() => window.scrollTo(0, 0));
  await openSampleLesson(page);
  await expect(page.locator('.lesson-split-wide')).toBeVisible();

  const restored = await page.evaluate((anchorId: string) => {
    const pane = document.querySelector<HTMLElement>('.lesson-split-lesson-scroll');
    const anchor = Array.from(document.querySelectorAll<HTMLElement>('[data-anchor-id]'))
      .find(element => element.dataset.anchorId === anchorId);
    if (!pane || !anchor) return null;
    return {
      top: anchor.getBoundingClientRect().top,
      paneTop: pane.getBoundingClientRect().top,
      height: anchor.getBoundingClientRect().height,
    };
  }, saved.contentAnchorId);
  expect(restored).not.toBeNull();
  if (!restored) throw new Error('Saved reading anchor was not present after reload.');
  const expectedTop = restored.paneTop - saved.relativeOffset * restored.height;
  expect(Math.abs(restored.top - expectedTop)).toBeLessThan(120);
});
