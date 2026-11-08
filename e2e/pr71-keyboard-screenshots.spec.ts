/**
 * Phase A - Step 6: Capture real before/after screenshots for PR #71 keyboard placement
 * 
 * This test captures screenshots of the math keyboard before and after interaction
 * to verify the keyboard placement fixes from PR #71.
 */

import { test, expect } from '@playwright/test';

test.describe('PR #71 - Math Keyboard Placement Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/lessons/1.1');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Mobile - 390px', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Keyboard before interaction - mobile', async ({ page }) => {
      await page.waitForSelector('.math-keyboard');
      await expect(page).toHaveScreenshot('pr71-keyboard-before-mobile.png', {
        animations: 'disabled',
        mask: [page.locator('.lesson-navigation')],
        fullPage: false
      });
    });

    test('Keyboard after clicking math field - mobile', async ({ page }) => {
      await page.click('.math-field');
      await page.waitForSelector('.math-keyboard:visible');
      await expect(page).toHaveScreenshot('pr71-keyboard-after-click-mobile.png', {
        animations: 'disabled',
        mask: [page.locator('.lesson-navigation')],
        fullPage: false
      });
    });

    test('Keyboard position relative to active field - mobile', async ({ page }) => {
      await page.click('.math-field');
      await page.waitForSelector('.math-keyboard:visible');
      
      const fieldRect = await page.locator('.math-field').boundingBox();
      const keyboardRect = await page.locator('.math-keyboard').boundingBox();
      if (!fieldRect || !keyboardRect) {
        throw new Error('Expected the math field and keyboard to have layout bounds');
      }

      const fieldBottom = fieldRect.y + fieldRect.height;
      expect(keyboardRect.y).toBeGreaterThan(fieldBottom - 50);
      expect(keyboardRect.y).toBeLessThan(fieldBottom + 100);
      expect(Math.abs(keyboardRect.width - fieldRect.width)).toBeLessThan(50);
    });
  });

  test.describe('Desktop - 1024px', () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test('Keyboard before interaction - desktop', async ({ page }) => {
      await page.waitForSelector('.math-keyboard');
      await expect(page).toHaveScreenshot('pr71-keyboard-before-desktop.png', {
        animations: 'disabled',
        fullPage: false
      });
    });

    test('Keyboard after clicking math field - desktop', async ({ page }) => {
      await page.click('.math-field');
      await page.waitForSelector('.math-keyboard:visible');
      await expect(page).toHaveScreenshot('pr71-keyboard-after-click-desktop.png', {
        animations: 'disabled',
        fullPage: false
      });
    });

    test('Keyboard position relative to active field - desktop', async ({ page }) => {
      await page.click('.math-field');
      await page.waitForSelector('.math-keyboard:visible');
      
      const fieldRect = await page.locator('.math-field').boundingBox();
      const keyboardRect = await page.locator('.math-keyboard').boundingBox();
      if (!fieldRect || !keyboardRect) {
        throw new Error('Expected the math field and keyboard to have layout bounds');
      }

      const fieldBottom = fieldRect.y + fieldRect.height;
      expect(keyboardRect.y).toBeGreaterThan(fieldBottom - 50);
      expect(keyboardRect.y).toBeLessThan(fieldBottom + 100);
      expect(Math.abs(keyboardRect.width - fieldRect.width)).toBeLessThan(50);
    });
  });

  test.describe('Desktop - 1440px', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('Keyboard before interaction - wide desktop', async ({ page }) => {
      await page.waitForSelector('.math-keyboard');
      await expect(page).toHaveScreenshot('pr71-keyboard-before-wide.png', {
        animations: 'disabled',
        fullPage: false
      });
    });

    test('Keyboard after clicking math field - wide desktop', async ({ page }) => {
      await page.click('.math-field');
      await page.waitForSelector('.math-keyboard:visible');
      await expect(page).toHaveScreenshot('pr71-keyboard-after-click-wide.png', {
        animations: 'disabled',
        fullPage: false
      });
    });
  });
});
