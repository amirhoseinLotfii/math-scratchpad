import { expect, test, mathField } from '../support/test';

// This file includes a test of the batch wellbeing dialog itself; keep it visible.
test.use({ autoDismissWellbeing: false });

test('reset confirmation is visibly destructive, focuses Cancel first, and restores the menu trigger', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'Run once in the narrow mobile Chromium project.');
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Exercise menu' });
  await menu.click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: 'Reset current session' }).click();

  const dialog = page.getByRole('dialog', { name: 'Reset current session?' });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  const reset = dialog.getByRole('button', { name: 'Reset session' });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  await expect(reset).toHaveClass(/button-danger/);
  const visual = await reset.evaluate(element => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const [red, green, blue] = rgb(value).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const style = getComputedStyle(element);
    const tokenProbe = document.createElement('span');
    tokenProbe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--ms-danger').trim();
    document.body.append(tokenProbe);
    const dangerTokenBackground = getComputedStyle(tokenProbe).color;
    tokenProbe.remove();
    const values = [luminance(style.backgroundColor), luminance(style.color)].sort((a, b) => b - a);
    return {
      background: style.backgroundColor,
      dangerTokenBackground,
      contrast: (values[0] + 0.05) / (values[1] + 0.05),
    };
  });
  expect(visual.background).toBe(visual.dangerTokenBackground);
  expect(visual.contrast).toBeGreaterThanOrEqual(4.5);
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: 'Reset all local storage' }).click();
  const allDialog = page.getByRole('dialog', { name: 'Reset all local storage?' });
  await expect(allDialog.getByRole('button', { name: 'Delete everything' })).toHaveClass(/button-danger/);
  await allDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(menu).toBeFocused();
});

test('batch wellbeing Skip for now returns focus to the practice editor', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'Run once in the narrow mobile Chromium project.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: /Start Round 1/ }).click();
  await page.getByRole('button', { name: 'Start 20 Questions' }).click();

  const dialog = page.getByRole('dialog', { name: 'Before you start this batch' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip for now' }).click();
  await expect(dialog).toBeHidden();
  await expect(mathField(page)).toBeFocused();
});

test('Skip to practice cancellation restores its trigger', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'Run once in the narrow mobile Chromium project.');
  await page.goto('/e2e/fixtures/lesson-connected-preview.html?no-wellbeing=1');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  await page.getByRole('dialog', { name: 'Lessons' }).getByRole('button', { name: /Sample lesson/ }).click();

  const trigger = page.getByRole('button', { name: 'Skip to practice' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Skip to practice?' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Add and Reset Step focus the math caret; Ctrl+Shift+Z returns focus to the editor', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'Run once with Chromium keyboard-event emulation.');
  await page.goto('/');
  const first = mathField(page);
  await first.click();
  await page.keyboard.type('123');

  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  const newStep = mathField(page, 2);
  await expect(newStep).toBeFocused();
  await page.keyboard.type('42');
  await expect.poll(() => newStep.evaluate(element => (element as HTMLElement & { value: string }).value)).toContain('42');

  await page.getByRole('button', { name: 'Reset Step 2' }).click();
  await expect(newStep).toBeFocused();
  await page.keyboard.type('9');
  await expect.poll(() => newStep.evaluate(element => (element as HTMLElement & { value: string }).value)).toContain('9');

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(newStep).toBeFocused();
  await expect.poll(() => newStep.evaluate(element => (element as HTMLElement & { value: string }).value)).toContain('9');
});
