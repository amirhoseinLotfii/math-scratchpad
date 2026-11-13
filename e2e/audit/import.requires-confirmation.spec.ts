import { expect, test } from '@playwright/test';
import { initialState } from '../../src/store';
import { serialize } from '../../src/persistence';

test('import.session-json.requires-confirmation.before-replacing-existing-work', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/');
  const wellbeing = page.getByRole('dialog', { name: /Before you start/ });
  if (await wellbeing.isVisible().catch(() => false)) await wellbeing.getByRole('button', { name: 'Skip for now' }).click();
  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await field.evaluate(element => { const e = element as HTMLElement & { value: string }; e.value='987654'; e.dispatchEvent(new Event('input',{bubbles:true,composed:true})); });
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value:string }).value)).toBe('987654');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Show more' }).click();
  await page.getByRole('menuitem', { name: 'Data', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Import session JSON' }).click();
  const panel=page.getByRole('region', {name:'Session backup'});
  await panel.getByRole('textbox',{name:'Copy or paste session JSON'}).fill(serialize(initialState()));
  await panel.getByRole('button',{name:'Restore'}).click();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value:string }).value), { timeout: 1500 }).toBe('987654');
  await expect(page.getByRole('dialog', {name:/confirm|replace|restore/i})).toBeVisible();
});
