import { expect, test } from '@playwright/test';

function contrastRatio(foreground: number[], background: number[]) {
  const luminance = ([red, green, blue]: number[]) => {
    const linear = [red, green, blue].map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const cssRgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);

test('neutral control borders and small practice labels are readable', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');
  await main.focus();
  await page.keyboard.type('8');
  await page.getByRole('button', { name: 'Add step', exact: true }).click();

  const inactiveStep = page.locator('.step:not(.current-step)').first();
  const stepContrast = await inactiveStep.evaluate(element => {
    const styles = getComputedStyle(element);
    return { border: styles.borderTopColor, background: styles.backgroundColor };
  });
  expect(contrastRatio(cssRgb(stepContrast.border), cssRgb(stepContrast.background))).toBeGreaterThanOrEqual(3);

  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'New Problem' }).click();
  const problemInput = page.getByRole('textbox', { name: 'Problem' });
  const inputContrast = await problemInput.evaluate(element => {
    const styles = getComputedStyle(element);
    return { border: styles.borderTopColor, background: styles.backgroundColor };
  });
  expect(contrastRatio(cssRgb(inputContrast.border), cssRgb(inputContrast.background))).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Show Keyboard' }).click();
  const stepStateFontSize = await page.locator('.step-state').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const keyboardLabelFontSize = await page.locator('.keyboard-toolbar button').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(stepStateFontSize).toBeGreaterThanOrEqual(12);
  expect(keyboardLabelFontSize).toBeGreaterThanOrEqual(12);
  await page.getByRole('button', { name: 'Symbols' }).click();
  const eyebrowFontSize = await page.locator('.template-preview .eyebrow').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(eyebrowFontSize).toBeGreaterThanOrEqual(12);

  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  const sessionDetails = page.getByRole('menuitem', { name: 'Session details' });
  await expect(sessionDetails).toHaveCSS('text-align', 'start');
});

test('the full confidence labels remain touch-sized across narrow and wide viewports', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.goto('/e2e/fixtures/lesson-connected-preview.html?no-wellbeing=1');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson/ }).click();

  const sizes = [
    { width: 320, height: 740 },
    { width: 390, height: 640 },
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];
  const confidenceLabels = page.locator('.lesson-confidence-options label');
  await expect(confidenceLabels).toHaveCount(5);

  for (const size of sizes) {
    await page.setViewportSize(size);
    const dimensions = await confidenceLabels.evaluateAll(labels => labels.map(label => {
      const { width, height } = label.getBoundingClientRect();
      return { width, height };
    }));
    expect(dimensions.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
    const pageWidths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(pageWidths.content).toBeLessThanOrEqual(pageWidths.viewport);
    await page.screenshot({ path: `/tmp/math-scratchpad-a11y-confidence-${size.width}x${size.height}.png`, fullPage: true });
  }
});
