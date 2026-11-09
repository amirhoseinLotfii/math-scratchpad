import { expect, test, type Page } from '@playwright/test';

const keyboard = (page: Page) => page.locator('.math-keyboard');
const stepField = (page: Page) => page.locator('math-field[aria-label="Step 1 expression"]');

async function expectKeyboardClosed(page: Page) {
  await expect(page.getByRole('button', { name: 'Show Keyboard' })).toHaveAttribute('aria-expanded', 'false');
  await expect(keyboard(page)).toHaveCount(0);
}

async function openKeyboard(page: Page) {
  await page.getByRole('button', { name: 'Show Keyboard' }).click();
  await expect(page.getByRole('button', { name: 'Hide Keyboard' })).toHaveAttribute('aria-expanded', 'true');
  await expect(keyboard(page)).toBeVisible();
}

async function expectKeyboardBelowActiveField(page: Page) {
  const field = await stepField(page).boundingBox();
  const keypad = await keyboard(page).boundingBox();
  if (!field || !keypad) throw new Error('Expected the active math field and keyboard to have layout bounds');
  expect(keypad.y).toBeGreaterThanOrEqual(field.y + field.height - 2);
  expect(keypad.x).toBeGreaterThanOrEqual(0);
  expect(keypad.x + keypad.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth) + 1);
}

test.describe('Math keyboard placement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(stepField(page)).toBeVisible();
  });

  test.describe('Mobile - 390px', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('keeps the keyboard closed until requested', async ({ page }) => {
      await expectKeyboardClosed(page);
    });

    test('opens the keypad from the visible keyboard control', async ({ page }) => {
      await openKeyboard(page);
      await expectKeyboardBelowActiveField(page);
    });

    test('keeps the keypad directly below the active step', async ({ page }) => {
      await openKeyboard(page);
      await stepField(page).click();
      await expectKeyboardBelowActiveField(page);
      await expect(keyboard(page).getByRole('group', { name: 'Numeric keys' }).getByRole('button').first()).toBeVisible();
    });
  });

  test.describe('Desktop - 1024px', () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test('keeps the keyboard closed until requested', async ({ page }) => {
      await expectKeyboardClosed(page);
    });

    test('opens the keypad from the visible keyboard control', async ({ page }) => {
      await openKeyboard(page);
      await expectKeyboardBelowActiveField(page);
    });

    test('keeps the keypad directly below the active step', async ({ page }) => {
      await openKeyboard(page);
      await stepField(page).click();
      await expectKeyboardBelowActiveField(page);
      await expect(keyboard(page).getByRole('group', { name: 'Numeric keys' }).getByRole('button').first()).toBeVisible();
    });
  });

  test.describe('Desktop - 1440px', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('keeps the keyboard closed until requested', async ({ page }) => {
      await expectKeyboardClosed(page);
    });

    test('opens the keypad from the visible keyboard control', async ({ page }) => {
      await openKeyboard(page);
      await expectKeyboardBelowActiveField(page);
    });
  });
});
