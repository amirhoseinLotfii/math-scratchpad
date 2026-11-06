import { expect, test } from './support/test';
import { dismissWellbeing } from './support/test';

const menu = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Exercise menu' });
const hitCenter = (element: Element) => {
 const rect = element.getBoundingClientRect();
 const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
 return !!hit && (hit === element || element.contains(hit));
};

test('UI-AUDIT-01: offline sync status never intercepts pointer menu actions', async ({ page }) => {
 await page.goto('/?serverMode');
 await expect(page.getByRole('status', { name: 'وضعیت همگام‌سازی' })).toBeVisible();
 await menu(page).click();
 for (const name of ['Google Drive · Question bank', 'New Problem', 'Skip question']) {
  const item = page.getByRole('menuitem', { name, exact: true });
  await expect(item).toBeVisible();
  expect(await item.evaluate(hitCenter), name).toBe(true);
 }
 await page.getByRole('menuitem', { name: 'New Problem' }).click();
 await expect(page.getByRole('region', { name: 'New exercise' })).toBeVisible();
 await expect(page.getByRole('textbox', { name: 'Problem' })).toBeVisible();
 await expect(page.getByRole('status', { name: 'وضعیت همگام‌سازی' })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('UI-AUDIT-02: new problem updates MathLive shadow rendering immediately', async ({ page }) => {
 await page.goto('/?serverMode');
 const display = () => page.locator('math-div[aria-label="Original question expression"]');
 await expect(display()).toBeVisible();
 const initial = await display().evaluate(element => element.shadowRoot?.querySelector('math')?.textContent);
 await menu(page).click();
 await page.getByRole('menuitem', { name: 'New Problem' }).click();
 const editor = page.getByRole('region', { name: 'New exercise' });
 await editor.getByRole('textbox', { name: 'Problem' }).fill(String.raw`\frac{3}{4}+\frac{1}{8}`);
 await editor.getByRole('button', { name: 'Start' }).click();
 await expect.poll(() => display().evaluate(element => element.textContent)).toBe(String.raw`\frac{3}{4}+\frac{1}{8}`);
 await expect.poll(() => display().evaluate(element => element.shadowRoot?.querySelector('math')?.textContent)).toBe('34+18');
 expect(initial).not.toBe('34+18');
});

test('UI-AUDIT-03: insert dialog Escape and Cancel return focus to opener', async ({ page }) => {
 await page.goto('/');
 const trigger = page.getByRole('button', { name: 'More math tools' });
 await trigger.click();
 await expect(page.getByRole('dialog', { name: 'Insert Math Element' })).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog', { name: 'Insert Math Element' })).toBeHidden();
 await expect(trigger).toBeFocused();
 await trigger.click();
 await page.getByRole('dialog', { name: 'Insert Math Element' }).getByRole('button', { name: 'Cancel · Esc' }).click();
 await expect(trigger).toBeFocused();
});

test('UI-AUDIT-04: viewport changes preserve edited steps, controls, and direction', async ({ page }) => {
 await page.goto('/');
 const edit = page.locator('math-field[aria-label="Step 1 expression"]');
 await expect(edit).toHaveAttribute('dir', 'ltr');
 await page.getByRole('button', { name: 'Add step' }).click();
 await expect(page.getByRole('button', { name: 'Step 2', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Mark Step 2 as final' }).click();
 for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  await page.setViewportSize(size);
  await expect(page.getByRole('button', { name: 'Mark Step 2 as final' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Add step' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(size)).toBe(true);
 }
 await page.getByRole('button', { name: 'Delete Step 2' }).click();
 await expect(page.getByRole('button', { name: 'Step 2', exact: true })).toHaveCount(0);
});

test('UI-AUDIT-05: legal pages wrap long contact links at narrow sizes', async ({ page }) => {
 for (const route of ['privacy.html', 'terms.html']) {
  await page.setViewportSize({ width: 320, height: 568 });
  const response = await page.goto('/' + route);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
});

test('UI-AUDIT-06: fraction batch confirmation stays clickable with sync active', async ({ page }) => {
 await page.goto('/?serverMode');
 await menu(page).click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await page.getByRole('menuitem', { name: 'Start Round 1 · 20 fraction questions' }).click();
 const start = page.getByRole('button', { name: 'Start 20 Questions' });
 expect(await start.evaluate(hitCenter)).toBe(true);
 await start.click();
 await dismissWellbeing(page);
 await expect(page.getByRole('combobox', { name: 'Select question' }).locator('option')).toHaveCount(20);
 await page.getByRole('button', { name: /Next question/i }).click();
 await expect(page.getByRole('dialog', { name: 'Answer confidence' })).toBeVisible();
 await page.getByRole('dialog', { name: 'Answer confidence' }).getByRole('radio', { name: 'Medium' }).check();
 await page.getByRole('dialog', { name: 'Answer confidence' }).getByRole('button', { name: 'Continue' }).click();
 await expect(page.getByRole('heading', { name: 'Question 2' })).toBeVisible();
});


test('UI-AUDIT-07: setup panels are mutually exclusive across menu workflows', async ({ page }) => {
 await page.goto('/?serverMode');
 await menu(page).click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await page.getByRole('menuitem', { name: 'Import session JSON' }).click();
 const backup = page.getByRole('region', { name: 'Session backup' });
 await expect(backup).toBeVisible();
 await backup.getByRole('textbox', { name: 'Copy or paste session JSON' }).fill('synthetic draft');
 await menu(page).click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await page.getByRole('menuitem', { name: 'Start 30-question diagnostic' }).click();
 await expect(backup).toHaveCount(0);
 await expect(page.getByRole('region', { name: 'Confirm diagnostic start' })).toBeVisible();
 await menu(page).click();
 await page.getByRole('menuitem', { name: 'New Problem' }).click();
 await expect(page.getByRole('region', { name: 'Confirm diagnostic start' })).toHaveCount(0);
 await expect(page.getByRole('region', { name: 'New exercise' })).toBeVisible();
 await menu(page).click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await page.getByRole('menuitem', { name: 'Start Round 1 · 20 fraction questions' }).click();
 await expect(page.getByRole('region', { name: 'New exercise' })).toHaveCount(0);
 await expect(page.getByRole('region', { name: 'Confirm fraction round start' })).toBeVisible();
});

test('UI-AUDIT-08: connection banner cannot cover sync inspector backup buttons', async ({ page }) => {
 for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
 ]) {
  await page.setViewportSize(size);
  await page.goto('/?serverMode');
  const banner = page.locator('aside[aria-label="وضعیت همگام‌سازی"]');
  await expect(banner).toBeVisible();
  await menu(page).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: 'Cloud sync and migration' }).click();
  const dialog = page.getByRole('dialog', { name: 'همگام‌سازی و حفظ داده‌ها' });
  await expect(dialog).toBeVisible();
  await expect(banner).toBeHidden();
  await dialog.getByRole('button', { name: 'همگام‌سازی الان' }).click();
  await dialog.getByRole('button', { name: 'بررسی اتصال و خطای Drive / Notion' }).click();
  // A real click without force was previously intercepted by the banner.
  await dialog.getByRole('button', { name: 'دانلود پشتیبان کامل JSON' }).click();
  await dialog.getByRole('button', { name: 'بستن تنظیم همگام‌سازی' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(banner).toBeVisible();
 }
});
