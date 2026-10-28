import { expect, test as base, type Locator, type Page } from '@playwright/test';
/** The once-per-batch anxiety/energy prompt is modal. Suites that are not about it get it dismissed automatically. */
const wellbeing = (page: Page) => page.getByRole('dialog', { name: /Before you start/ });
export async function dismissWellbeing(page: Page) {
  const wb = wellbeing(page);
  if (await wb.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await wb.getByRole('button', { name: 'Skip for now' }).click({ timeout: 2000 }).catch(() => {});
  await expect(wb).toBeHidden();
}
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(wellbeing(page), async dialog => { await dialog.getByRole('button', { name: 'Skip for now' }).click({ timeout: 2000 }).catch(() => {}); });
    await use(page);
  },
});
export { expect, type Locator, type Page };
