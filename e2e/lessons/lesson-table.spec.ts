import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('lesson tables stay readable and scroll locally at practical viewport sizes', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390');
  test.setTimeout(120_000);
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 640 }, { width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/fixtures/lesson-connected-preview.html?table=1');
    const start = page.getByRole('dialog', { name: 'Before you start this batch' });
    if (await start.isVisible().catch(() => false)) await start.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Lessons' }).click();
    await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson/ }).click();
    const table = page.getByRole('region', { name: 'Lesson table' });
    await expect(table.getByRole('columnheader', { name: 'Input' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '24', exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390 && viewport.height === 844) {
      const result = await new AxeBuilder({ page }).include('.lesson-table-scroll').analyze();
      expect(result.violations.filter(item => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
    }
    if (viewport.width < 500) {
      await table.focus();
      await expect(table).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
  }
});
