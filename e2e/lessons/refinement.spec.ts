import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from '../support/test';

async function capture(page: Page, name: string, fullPage = true) {
  const path = resolve(`artifacts/lessons/refined-${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage });
}

test('Learn layouts and interactions stay readable across phone, tablet, and desktop sizes', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'This test changes viewport sizes explicitly.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=concept');
  await expect(page.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
  await expect(page.getByText('1 of 2 steps shown')).toBeVisible();
  await expect(page.getByText('Second sample teaching step.')).toHaveCount(0);
  await capture(page, 'concept-mobile-390x844');
  await page.getByRole('button', { name: 'Show next step' }).click();
  await expect(page.getByText('All 2 steps shown')).toBeVisible();

  await page.goto('/e2e/fixtures/lesson-preview.html?view=choice');
  const choiceA = page.getByRole('radio', { name: 'Option A' });
  const choiceB = page.getByRole('radio', { name: 'Option B' });
  await expect(choiceA).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next concept →' })).toBeDisabled();
  const choiceBoxes = await page.locator('.lesson-choice-options label').evaluateAll(labels => labels.map(label => {
    const rect = label.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  expect(choiceBoxes).toHaveLength(2);
  expect(choiceBoxes[0].y).toBe(choiceBoxes[1].y);
  expect(choiceBoxes.every(box => box.height >= 48)).toBe(true);
  await choiceB.check();
  await page.getByRole('radio', { name: 'Confidence 4' }).check();
  await expect(page.locator('.lesson-choice-selected')).toContainText('Option B');
  await expect(page.getByRole('button', { name: 'Next concept →' })).toBeEnabled();
  await capture(page, 'choice-selected-mobile-390');

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=choice');
  const narrowChoices = await page.locator('.lesson-choice-options label').evaluateAll(labels => labels.map(label => label.getBoundingClientRect().y));
  expect(narrowChoices[1]).toBeGreaterThan(narrowChoices[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await capture(page, 'choice-narrow-mobile-320');

  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=text');
  const textAnswer = page.getByRole('textbox', { name: 'Answer for check SAMPLE-1.1-L01' });
  await expect(textAnswer).toBeVisible();
  await expect(page.locator('.math-tools-row')).toHaveCount(0);
  await expect(page.getByText('Write each step')).toHaveCount(0);
  await textAnswer.fill('Temporary preview response');
  await expect(page.getByRole('button', { name: 'Next concept →' })).toBeEnabled();
  await textAnswer.scrollIntoViewIfNeeded();
  await expect(textAnswer).toBeInViewport();
  await capture(page, 'text-answer-mobile-390x640');

  await page.goto('/e2e/fixtures/lesson-preview.html?view=text');
  await page.getByRole('button', { name: 'Skip check' }).click();
  const skipDialog = page.getByRole('dialog', { name: 'Skip this check?' });
  await expect(skipDialog).toBeVisible();
  await capture(page, 'skip-check-dialog-mobile-390', false);
  await skipDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(skipDialog).toBeHidden();
  await page.getByRole('button', { name: 'Skip check' }).click();
  await page.getByRole('dialog', { name: 'Skip this check?' }).getByRole('button', { name: 'Skip check' }).click();
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible();

  await page.goto('/e2e/fixtures/lesson-preview.html?view=math');
  await expect(page.getByRole('group', { name: 'Question expression' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 640 });
  await expect(page.getByRole('button', { name: 'Show Keyboard' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Keyboard' }).click();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await page.locator('.lesson-math-editor').scrollIntoViewIfNeeded();
  await expect(page.locator('.lesson-math-editor .current-step')).toBeInViewport();
  const activeField = page.locator('.lesson-math-editor .current-step math-field');
  await activeField.click();
  await activeField.scrollIntoViewIfNeeded();
  await expect(activeField).toBeInViewport();
  const activeCaretUncovered = await activeField.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const source = document.querySelector('.lesson-check-source')!.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return rect.top >= source.bottom && !!hit && (hit === el || el.contains(hit));
  });
  expect(activeCaretUncovered).toBe(true);
  await expect(page.locator('.lesson-check-source')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.lesson-check-source')).toBeInViewport();
  await capture(page, 'math-keyboard-mobile-390x640', false);
  await page.getByRole('button', { name: 'Fraction', exact: true }).click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  const mathLatex = (field: import('../support/test').Locator) => field.evaluate(element => (element as HTMLElement & { value: string }).value);
  await expect.poll(() => mathLatex(activeField)).toContain('\\frac83');
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Add step' }).click();
  const secondField = page.locator('.lesson-answer-step').nth(1).locator('math-field');
  await expect(secondField).toBeInViewport();
  await expect.poll(() => secondField.evaluate(element => document.activeElement === element)).toBe(true);
  await page.keyboard.type('1234');
  await expect.poll(() => mathLatex(secondField)).toBe('1234');
  await page.getByRole('button', { name: 'Mark Step 2 as final' }).click();
  await expect(page.getByRole('button', { name: 'Mark Step 2 as final' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Step 1', exact: true }).click();
  const firstField = page.locator('.lesson-answer-step').first().locator('math-field');
  await firstField.click();
  await expect.poll(() => firstField.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);
  await page.keyboard.press('Control+A');
  await expect.poll(() => firstField.evaluate(element => document.activeElement === element)).toBe(true);
  await page.keyboard.type('2+2');
  await expect(page.locator('.lesson-answer-step').nth(1)).toContainText('Needs review');
  await expect.poll(() => mathLatex(secondField)).toBe('1234');
  await capture(page, 'math-needs-review-mobile-390x640', false);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=math');
  await expect(page.getByRole('button', { name: 'Show Keyboard' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Edit history' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toHaveCount(0);
  const moreTools = page.getByRole('button', { name: 'More math tools' });
  await moreTools.click();
  await expect(moreTools).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Symbols' })).toBeVisible();
  await capture(page, 'math-more-tools-tablet-1024x768');
  await page.getByRole('button', { name: 'Probability & stats' }).click();
  await page.getByRole('button', { name: 'Insert Probability' }).click();
  await expect(moreTools).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await page.getByRole('button', { name: '5', exact: true }).click();
  const tabletMathField = page.locator('.lesson-answer-step.current-step math-field');
  await expect.poll(() => mathLatex(tabletMathField)).toContain('P');
  await expect.poll(() => mathLatex(tabletMathField)).toContain('5');
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await page.locator('.lesson-math-editor').scrollIntoViewIfNeeded();
  await expect(page.locator('.lesson-math-editor .current-step')).toBeInViewport();
  await capture(page, 'math-keyboard-tablet-1024x768', false);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/e2e/fixtures/lesson-preview.html?view=choice');
  const cardWidths = await page.locator('.lesson-checks').evaluate(section => ({
    section: section.getBoundingClientRect().width,
    card: section.querySelector('.lesson-check')!.getBoundingClientRect().width,
  }));
  expect(cardWidths.card).toBeGreaterThan(cardWidths.section - 32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await capture(page, 'choice-desktop-1280x900');

  await page.goto('/e2e/fixtures/lesson-preview.html?view=summary');
  await expect(page.getByRole('heading', { name: 'Lesson summary' })).toBeFocused();
  await capture(page, 'summary-desktop-1280x900');
});
