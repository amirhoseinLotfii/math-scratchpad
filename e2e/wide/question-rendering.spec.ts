import { expect, test } from '@playwright/test';

test('question statements render the bank’s common math forms on desktop', async ({ page }) => {
  await page.goto('/e2e/fixtures/practice-answer-types-preview.html');

  const mathHost = (label: string) => page.getByRole('math', { name: label });
  const goTo = async (index: number) => {
    await page.getByRole('button', { name: new RegExp(`^Question ${index} `) }).click();
    await expect(page.getByRole('heading', { name: `Question ${index}`, exact: true })).toBeVisible();
  };

  await expect(page.getByRole('math', { name: 'Original question expression' })).toBeVisible();
  await expect.poll(() => mathHost('Original question expression').evaluate(element => !!element.shadowRoot?.childElementCount)).toBe(true);

  await goTo(2);
  await expect(page.getByRole('radio', { name: '>' })).toBeVisible();

  await goTo(3);
  await expect(page.getByRole('math', { name: 'Original question expression' })).toBeVisible();

  await goTo(4);
  const table = page.getByRole('region', { name: 'Lesson table' });
  await expect(table.getByRole('columnheader', { name: 'Input' })).toBeVisible();
  await expect(table.getByRole('cell', { name: '7', exact: true })).toBeVisible();

  await goTo(5);
  await expect(mathHost('Original question expression')).toBeVisible();
  await expect.poll(() => mathHost('Original question expression').evaluate(element => !!element.shadowRoot?.childElementCount)).toBe(true);

  await goTo(6);
  await expect(mathHost('Original question expression')).toBeVisible();
  await expect.poll(() => mathHost('Original question expression').evaluate(element => !!element.shadowRoot?.childElementCount)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await goTo(7);
  const prose = page.locator('.question-source-text[dir="rtl"]');
  await expect(prose).toContainText('معنی f(5)=2 را توضیح دهید');
  await expect(prose.locator('bdi[dir="ltr"]')).toHaveCount(3);

  await goTo(8);
  const firstChoice = mathHost('Mathematical answer choice 1');
  const secondChoice = mathHost('Mathematical answer choice 2');
  await expect(firstChoice).toBeVisible();
  await expect(secondChoice).toBeVisible();
  await expect.poll(() => secondChoice.evaluate(element => !!element.shadowRoot?.childElementCount)).toBe(true);
  await page.getByRole('radio', { name: /Mathematical answer choice 2/ }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  for (const index of [9, 10, 11, 12, 13, 14]) {
    await goTo(index);
    const expression = mathHost('Original question expression');
    await expect(expression).toBeVisible();
    await expect.poll(() => expression.evaluate(element => !!element.shadowRoot?.childElementCount)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  await goTo(15);
  const mixedProse = page.locator('.question-source-text[dir="rtl"]');
  await expect(mixedProse).toContainText('دامنه');
  const inlineMath = mixedProse.locator('.lesson-inline-math math-span');
  await expect(inlineMath).toBeVisible();
  await expect.poll(() => inlineMath.evaluate(element => !!element.shadowRoot?.childElementCount)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
