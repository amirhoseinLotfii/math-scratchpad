import { expect, test } from './support/test';

test.use({ autoDismissWellbeing: false });

test('mobile offline status is compact, discoverable and does not block math actions', { tag: '@only-mobile-390' }, async ({ page }) => {
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(size);
    await page.goto('/?serverMode');
    const status = page.getByRole('status', { name: 'وضعیت همگام‌سازی' });
    await expect(status).toBeVisible();
    await expect(status.getByRole('button', { name: 'بررسی دوباره اتصال' })).toBeVisible();
    const height = await status.evaluate(el => el.getBoundingClientRect().height);
    expect(height, JSON.stringify(size)).toBeLessThan(250);
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'New Problem' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'New Problem' }).click();
    await expect(page.getByRole('textbox', { name: 'Problem' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('practice completion tells learner how many answers remain unverified', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Practice', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Start Round 1 · 20 fraction questions' }).press('Enter');
  await page.getByRole('button', { name: 'Start 20 Questions' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('combobox', { name: 'Select question' }).selectOption({ index: 19 });
  await page.getByRole('button', { name: 'Finish session' }).click();
  const confidence = page.getByRole('dialog', { name: 'Answer confidence' });
  await confidence.getByRole('radio', { name: 'Low' }).click();
  await confidence.getByRole('button', { name: 'Continue' }).click();
  const done = page.getByRole('dialog', { name: 'Session complete' });
  await expect(done).toBeVisible();
  await expect(done.getByRole('status')).toContainText('0 of 20 questions answered');
  await expect(done.getByRole('status')).toContainText('20 not answered (unverified)');
  await done.getByRole('button', { name: 'Finish & Analyze' }).click();
  await expect(page.getByRole('region', { name: 'Diagnostic report' })).toContainText('unverified');
});


test('session summary counts saved drafts separately from untouched questions', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Practice', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Start Round 1 · 20 fraction questions' }).press('Enter');
  await page.getByRole('button', { name: 'Start 20 Questions' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  const showKeyboard = page.getByRole('button', { name: 'Show Keyboard' });
  if (await showKeyboard.count()) await showKeyboard.click();
  await page.getByRole('group', { name: 'Numeric keys' }).getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: 'Mark Step 1 as final' }).click();
  await expect(page.getByRole('combobox', { name: 'Select question' }).locator('option').first()).toContainText('Draft');
  await page.getByRole('combobox', { name: 'Select question' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Skip question' }).click();
  await page.getByRole('combobox', { name: 'Select question' }).selectOption({ index: 19 });
  await page.getByRole('button', { name: 'Finish session' }).click();
  const confidence = page.getByRole('dialog', { name: 'Answer confidence' });
  await confidence.getByRole('radio', { name: 'Low' }).click();
  await confidence.getByRole('button', { name: 'Continue' }).click();
  const summary = page.getByRole('dialog', { name: 'Session complete' }).getByRole('status');
  await expect(summary).toContainText('0 of 20 questions answered');
  await expect(summary).toContainText('1 draft (saved, not submitted)');
  await expect(summary).toContainText('1 skipped');
  await expect(summary).toContainText('18 not answered (unverified)');
});
