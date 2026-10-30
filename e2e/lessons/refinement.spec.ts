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
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 640 });
  await page.locator('.lesson-math-editor').scrollIntoViewIfNeeded();
  await expect(page.locator('.lesson-math-editor .current-step')).toBeInViewport();
  await expect(page.locator('.lesson-math-editor .current-step .token-active')).toBeInViewport();
  const activeCaretUncovered = await page.locator('.lesson-math-editor .current-step .token-active').evaluate(el => {
    const rect = el.getBoundingClientRect();
    const source = document.querySelector('.lesson-check-source')!.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return rect.top >= source.bottom && !!hit && (hit === el || el.contains(hit));
  });
  expect(activeCaretUncovered).toBe(true);
  await expect(page.locator('.lesson-check-source')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.lesson-check-source')).toBeInViewport();
  await capture(page, 'math-keyboard-mobile-390x640', false);
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Fraction', exact: true }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.locator('.lesson-math-editor .fraction .numerator')).toContainText('8');
  await expect(page.locator('.lesson-math-editor .fraction > span:nth-child(2)')).toContainText('3');
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Step 1 Insert after item 1', exact: true }).click();
  await page.getByRole('button', { name: '+', exact: true }).click();
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: 'Fraction', exact: true }).click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  const updatedCaretUncovered = await page.locator('.lesson-math-editor .current-step .token-active').evaluate(el => {
    const rect = el.getBoundingClientRect();
    const source = document.querySelector('.lesson-check-source')!.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return rect.top >= source.bottom && !!hit && (hit === el || el.contains(hit));
  });
  expect(updatedCaretUncovered).toBe(true);
  await expect(page.getByRole('button', { name: '4', exact: true })).toBeInViewport();
  const operatorSpacing = await page.locator('.lesson-answer-step.current-step .expression').evaluate(expression => {
    const sequence = expression.querySelector(':scope > .math-sequence.top-sequence')!;
    const operator = sequence.querySelector('.math-token.operator')!.getBoundingClientRect();
    const fractions = sequence.querySelectorAll('.math-structure > .fraction');
    const secondFraction = fractions[1].getBoundingClientRect();
    return secondFraction.left - operator.right;
  });
  expect(operatorSpacing).toBeLessThan(10);
  await capture(page, 'math-fraction-spacing-mobile-390x640', false);
  await page.getByRole('button', { name: 'Hide Keyboard' }).click();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Keyboard' }).click();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await page.getByRole('button', { name: 'Add step' }).click();
  for (const digit of ['1', '2', '3', '4']) await page.getByRole('button', { name: digit, exact: true }).click();
  const multiDigit = page.getByRole('button', { name: 'Step 2 number 1234' });
  const digitCenters = await multiDigit.locator('[data-digit]').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return rect.left + rect.width / 2;
  }));
  const buttonBox = await multiDigit.boundingBox();
  await page.mouse.click((digitCenters[1] + digitCenters[2]) / 2, buttonBox!.y + buttonBox!.height / 2);
  await page.getByRole('button', { name: '9', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Step 2 number 12934' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Step 2 as final' }).click();
  await expect(page.getByRole('button', { name: 'Mark Step 2 as final' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Step 1', exact: true }).click();
  await page.locator('.lesson-answer-step').first().locator('.math-token.number').first().click();
  await page.getByRole('button', { name: '7', exact: true }).click();
  await expect(page.locator('.lesson-answer-step').nth(1)).toContainText('Needs review');
  await expect(page.getByRole('button', { name: 'Step 2 number 12934' })).toBeVisible();
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
  await expect(page.locator('.lesson-answer-step.current-step .expression')).toContainText('P');
  await expect(page.locator('.lesson-answer-step.current-step .expression')).toContainText('5');
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
