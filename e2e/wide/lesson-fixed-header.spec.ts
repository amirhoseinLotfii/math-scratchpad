import { expect, test } from '../support/test';

test('wide lesson keeps its section header fixed while only the lesson content scrolls', { tag: '@only-laptop-1440' }, async ({ page }) => {
  for (const width of [1100, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');

    const screen = page.locator('.lesson-screen');
    const pane = page.locator('.lesson-split-lesson');
    const header = pane.locator('.lesson-split-lesson-header');
    const content = pane.locator('.lesson-split-lesson-scroll');

    await expect(page.locator('.lesson-split-wide')).toBeVisible();
    await expect(header.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
    await expect(content).toHaveAttribute('role', 'region');
    await expect(content).toHaveAttribute('tabindex', '0');

    const metrics = await page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>('.lesson-screen')!;
      const pane = document.querySelector<HTMLElement>('.lesson-split-lesson')!;
      const header = pane.querySelector<HTMLElement>('.lesson-split-lesson-header')!;
      const content = pane.querySelector<HTMLElement>('.lesson-split-lesson-scroll')!;
      const filler = document.createElement('div');
      filler.setAttribute('aria-hidden', 'true');
      filler.style.height = '1800px';
      content.appendChild(filler);
      const headerTopBefore = header.getBoundingClientRect().top;
      content.scrollTop = 280;
      return {
        paddingTop: Number.parseFloat(getComputedStyle(screen).paddingTop),
        headerTopBefore,
        headerTopAfter: header.getBoundingClientRect().top,
        contentScrollTop: content.scrollTop,
        paneScrollTop: pane.scrollTop,
        windowScrollY: window.scrollY,
        contentClientHeight: content.clientHeight,
        contentScrollHeight: content.scrollHeight,
      };
    });

    expect(metrics.paddingTop, 'top spacing at ' + width + 'px').toBeGreaterThanOrEqual(16);
    expect(metrics.contentScrollHeight).toBeGreaterThan(metrics.contentClientHeight);
    expect(metrics.contentScrollTop).toBeGreaterThan(0);
    expect(metrics.paneScrollTop).toBe(0);
    expect(metrics.windowScrollY).toBe(0);
    expect(metrics.headerTopAfter).toBeCloseTo(metrics.headerTopBefore, 0);
    await expect(header).toBeVisible();
  }
});
