import { expect, test } from '../support/test';
const fixture = '/e2e/fixtures/lesson-preview.html?view=stacked';

test('wide lesson work pane math tools have independent pointer hit targets', { tag: '@only-laptop-1440' }, async ({ page }) => {
  for (const width of [1100, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(fixture);
    await expect(page.locator('.lesson-split-wide')).toBeVisible();
    for (const ratio of [30, 50, 70]) {
      await page.locator('.lesson-split-wide').evaluate((element, pct) => {
        (element as HTMLElement).style.setProperty('--lesson-split', String(pct) + '%');
      }, ratio);
      const toolbar = page.locator('.lesson-split-work .math-tools-row');
      const hitResults = await toolbar.evaluate(row => {
        const items = [...row.querySelectorAll<HTMLButtonElement>('button')];
        return items.filter(button => button.getBoundingClientRect().width > 0).map(button => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return { name: button.getAttribute('aria-label'), valid: hit === button || button.contains(hit) };
        });
      });
      expect(hitResults.filter(item => !item.valid), JSON.stringify({ width, ratio })).toEqual([]);
      const horizontalOverflow = await page.locator('.lesson-split-work').evaluate(el => el.scrollWidth - el.clientWidth);
      expect(horizontalOverflow, JSON.stringify({ width, ratio })).toBeLessThanOrEqual(1);
    }
  }
});
