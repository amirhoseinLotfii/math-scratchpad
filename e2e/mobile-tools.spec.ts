import { expect, test } from './support/test';

test('mobile math tools keep comfortable spacing and the plus stays close to the next term', async ({ page }) => {
  await page.goto('/');

  const history = page.locator('.wide-history-tools');
  await expect(history).toHaveCSS('display', 'none');

  const quickTools = page.locator('.quick-math-tools button');
  const boxes = await Promise.all((await quickTools.all()).map(button => button.boundingBox()));
  expect(boxes).toHaveLength(5);
  for (const box of boxes) {
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index]!.x - (boxes[index - 1]!.x + boxes[index - 1]!.width)).toBeGreaterThanOrEqual(5);
  }

  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  const plusMetrics = await field.evaluate(element => {
    const root = element.shadowRoot!;
    const plus = [...root.querySelectorAll('*')].find(node => node.children.length === 0 && node.textContent?.trim() === '+');
    if (!plus?.parentElement) return null;
    const siblings = [...plus.parentElement.children];
    const plusIndex = siblings.indexOf(plus);
    const nextTerm = siblings.slice(plusIndex + 1).find(node => (node as HTMLElement).classList.contains('ML__mfrac'));
    if (!nextTerm) return null;
    const plusBox = plus.getBoundingClientRect();
    const nextTermBox = nextTerm.getBoundingClientRect();
    return {
      operatorWidth: plusBox.width,
      gapAfterGlyph: nextTermBox.left - plusBox.right,
      nextTermClass: (nextTerm as HTMLElement).className,
    };
  });
  expect(plusMetrics).not.toBeNull();
  expect(plusMetrics!.operatorWidth).toBeGreaterThan(0);
  expect(plusMetrics!.operatorWidth).toBeLessThanOrEqual(24);
  expect(plusMetrics!.gapAfterGlyph).toBeGreaterThanOrEqual(0);
  expect(plusMetrics!.gapAfterGlyph).toBeLessThanOrEqual(8);
  expect(plusMetrics!.nextTermClass).toContain('ML__mfrac');
});
