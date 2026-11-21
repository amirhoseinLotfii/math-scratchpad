import { expect, test } from '../support/test';

test.use({ autoDismissWellbeing: false });

test('E2E-13: Phase 1 Bilingual typing, Persian text segment, math island, and branch split', async ({ page }) => {
  await page.goto('/');

  // Step 1 Persian text segment: click and type Persian text immediately
  const persianInput = page.locator('textarea.step-persian-input').first();
  await expect(persianInput).toBeVisible();
  await persianInput.click();
  await page.keyboard.type('اگر x برابر ۲ باشد');
  await expect(persianInput).toHaveValue('اگر x برابر ۲ باشد');

  // Tab moves focus from Persian text segment to the isolated Math island (AC-T5)
  await page.keyboard.press('Tab');
  const mathField = page.locator('math-field.mathlive-step-input').first();
  await expect(mathField).toBeFocused();

  // Set math with +/- symbol into the math island (AC-T2, AC-F6)
  await mathField.evaluate((el: any) => {
    el.setValue('x = \\pm 3');
    el.dispatchEvent(new CustomEvent('input', { bubbles: true }));
  });
  await expect.poll(() => mathField.evaluate((el: any) => el.value)).toContain('\\pm');

  // When +/- is present, the Split ± button appears (AC-F6)
  const branchBtn = page.getByRole('button', { name: /Split into ± branches|انشعاب/ });
  await expect(branchBtn).toBeVisible();

  // Click the branch button to split into two child branches
  await branchBtn.click();

  // Verify that two child branch steps (+ and -) are created
  const plusBadge = page.locator('.branch-badge.branch-sign-plus');
  const minusBadge = page.locator('.branch-badge.branch-sign-minus');
  await expect(plusBadge).toBeVisible();
  await expect(minusBadge).toBeVisible();

  // Step 2 has the + branch and Step 3 has the - branch
  const step2Math = page.locator('math-field.mathlive-step-input').nth(1);
  const step3Math = page.locator('math-field.mathlive-step-input').nth(2);
  await expect.poll(() => step2Math.evaluate((el: any) => el.value)).toContain('+');
  await expect.poll(() => step3Math.evaluate((el: any) => el.value)).toContain('-');
});
