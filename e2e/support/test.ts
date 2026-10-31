import { expect, test as base, type Locator, type Page } from '@playwright/test';
/** The once-per-batch anxiety/energy prompt is modal. Suites that are not about it get it dismissed automatically. */
const wellbeing = (page: Page) => page.getByRole('dialog', { name: /Before you start/ });
export async function dismissWellbeing(page: Page) {
  const wb = wellbeing(page);
  if (await wb.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await wb.getByRole('button', { name: 'Skip for now' }).click({ timeout: 2000 }).catch(() => {});
  await expect(wb).toBeHidden();
}
export function mathField(page: Page, stepNumber = 1) {
  return page.locator(`math-field[aria-label="Step ${stepNumber} expression"]`);
}
export async function mathValue(field: Locator) {
  return field.evaluate(element => (element as HTMLElement & { value: string }).value);
}
export async function enterMath(page: Page, stepNumber: number, value: string, replace = false) {
  const field = mathField(page, stepNumber);
  await field.click();
  if (replace) await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
  return field;
}
export async function tapMathKeys(page: Page, value: string) {
  await dismissWellbeing(page);
  const showKeyboard = page.getByRole('button', { name: 'Show Keyboard' });
  if (await showKeyboard.count()) await showKeyboard.click();
  const keys = page.getByRole('group', { name: 'Numeric keys' });
  for (const digit of value) await keys.getByRole('button', { name: digit, exact: true }).tap();
}
export async function clickMathKeys(page: Page, value: string) {
  await dismissWellbeing(page);
  const showKeyboard = page.getByRole('button', { name: 'Show Keyboard' });
  if (await showKeyboard.count()) await showKeyboard.click();
  const keys = page.getByRole('group', { name: 'Numeric keys' });
  for (const digit of value) await keys.getByRole('button', { name: digit, exact: true }).click();
}
type TestFixtures = { autoDismissWellbeing: boolean };
export const test = base.extend<TestFixtures>({
  autoDismissWellbeing: [true, { option: true }],
  page: async ({ page, autoDismissWellbeing }, use) => {
    if (autoDismissWellbeing) {
      await page.addLocatorHandler(wellbeing(page), async dialog => { await dialog.getByRole('button', { name: 'Skip for now' }).click({ timeout: 2000 }).catch(() => {}); });
    }
    await use(page);
  },
});
export { expect, type Locator, type Page };
