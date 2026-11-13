import { expect, test } from '@playwright/test';

test('initial-layout.has-no-overflow-and-menu-opens', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const errors:string[]=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Exercise menu'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Exercise menu'}).click();
  await expect(page.getByRole('menuitem',{name:'Show more'})).toBeVisible();
  expect(errors).toEqual([]);
});
