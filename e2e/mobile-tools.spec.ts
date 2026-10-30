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

  const plus = page.locator('.expression .math-token.operator').filter({ hasText: '+' }).first();
  const plusMetrics = await plus.evaluate(element => {
    const glyph = document.createRange();
    glyph.selectNodeContents(element);
    const glyphBox = glyph.getBoundingClientRect();
    const buttonBox = element.getBoundingClientRect();
    const nextTermBox = element.nextElementSibling?.getBoundingClientRect();
    return {
      buttonWidth: buttonBox.width,
      buttonHeight: buttonBox.height,
      gapAfterGlyph: nextTermBox ? nextTermBox.left - glyphBox.right : Number.POSITIVE_INFINITY,
    };
  });
  expect(plusMetrics.buttonWidth).toBe(32);
  expect(plusMetrics.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(plusMetrics.gapAfterGlyph).toBeLessThanOrEqual(8);

  // Insertion gaps remain available for touch editing and precise cursor placement.
  expect((await page.locator('.expression .math-gap').first().boundingBox())?.width).toBeGreaterThanOrEqual(44);
});
