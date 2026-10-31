import { expect, test } from '@playwright/test';

async function tabUntil(page: import('@playwright/test').Page, target: import('@playwright/test').Locator, limit = 40) {
  for (let index = 0; index < limit; index++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard focus did not reach ${await target.getAttribute('aria-label') ?? await target.textContent() ?? 'target'}`);
}

async function pressFocused(page: import('@playwright/test').Page, target: import('@playwright/test').Locator, key: 'Enter' | 'Space') {
  await expect(target).toBeFocused();
  await page.keyboard.press(key);
}

test('keyboard-only route reaches Learn, summary, Practice and its lesson reference', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1440', 'Run the physical-keyboard walkthrough in a desktop Chromium context.');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/e2e/fixtures/lesson-connected-preview.html');

  const initialSetup = page.getByRole('dialog', { name: 'Before you start this batch' });
  if (await initialSetup.isVisible().catch(() => false)) {
    const skip = initialSetup.getByRole('button', { name: 'Skip for now' });
    await tabUntil(page, skip, 8);
    await pressFocused(page, skip, 'Enter');
  }

  const menuButton = page.getByRole('button', { name: 'Exercise menu' });
  await tabUntil(page, menuButton, 40);
  await pressFocused(page, menuButton, 'Enter');
  await page.keyboard.press('Home');
  const lessonsItem = page.getByRole('menuitem', { name: 'Lessons' });
  for (let index = 0; index < 12 && !(await lessonsItem.evaluate(element => element === document.activeElement)); index++) await page.keyboard.press('ArrowDown');
  await expect(lessonsItem).toBeFocused();
  await pressFocused(page, lessonsItem, 'Enter');

  const picker = page.getByRole('dialog', { name: 'Lessons' });
  const lessonOption = picker.getByRole('button', { name: /Sample lesson.*Not started/ });
  await expect(lessonOption).toBeFocused();
  await pressFocused(page, lessonOption, 'Enter');
  const firstConcept = page.getByRole('heading', { name: 'First sample concept' });
  await expect(firstConcept).toBeFocused();

  const choice = page.getByRole('radio', { name: 'Option A' });
  await tabUntil(page, choice, 12);
  await pressFocused(page, choice, 'Space');
  await expect(choice).toBeChecked();
  const nextConcept = page.getByRole('button', { name: 'Next concept →' });
  await tabUntil(page, nextConcept, 12);
  await pressFocused(page, nextConcept, 'Enter');
  const secondConcept = page.getByRole('heading', { name: 'Second sample concept' });
  await expect(secondConcept).toBeFocused();

  const editor = page.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
  const mathField = editor.locator('math-field[aria-label="Step 1 expression"]');
  await tabUntil(page, mathField, 60);
  await page.keyboard.press('8');
  await expect.poll(() => mathField.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe('8');
  await tabUntil(page, nextConcept, 60);
  await pressFocused(page, nextConcept, 'Enter');
  await expect(page.getByRole('heading', { name: 'Lesson summary' })).toBeFocused();

  const startPractice = page.getByRole('button', { name: 'Start practice' });
  await tabUntil(page, startPractice, 12);
  await pressFocused(page, startPractice, 'Enter');
  await expect(page.getByText('Sample practice 1.')).toBeVisible();

  const practiceSetup = page.getByRole('dialog', { name: 'Before you start this batch' });
  if (await practiceSetup.isVisible().catch(() => false)) {
    const skip = practiceSetup.getByRole('button', { name: 'Skip for now' });
    await tabUntil(page, skip, 8);
    await pressFocused(page, skip, 'Enter');
  }
  const lessonButton = page.getByRole('button', { name: 'Lesson' });
  await tabUntil(page, lessonButton, 20);
  await pressFocused(page, lessonButton, 'Enter');
  await expect(page.getByRole('dialog', { name: 'Sample lesson' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lessonButton).toBeFocused();
});
