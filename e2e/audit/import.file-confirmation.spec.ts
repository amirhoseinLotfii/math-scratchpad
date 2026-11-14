import { expect, test } from '@playwright/test';
import { initialState } from '../../src/store';
import { serialize } from '../../src/persistence';

test('import.backup-file.requires-confirmation.before-replacing-existing-work', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/');
  const field=page.locator('math-field[aria-label="Step 1 expression"]');
  await field.evaluate(element => { const e=element as HTMLElement & {value:string};e.value='987654';e.dispatchEvent(new Event('input',{bubbles:true,composed:true})); });
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & {value:string}).value)).toBe('987654');
  const confirmation=page.getByRole('dialog',{name:'Replace current session?'});
  async function chooseBackupFile() {
    const menu=page.getByRole('menu',{name:'Exercise menu'});
    if (!(await menu.isVisible().catch(() => false))) await page.getByRole('button',{name:'Exercise menu'}).click();
    const showMore=page.getByRole('menuitem',{name:'Show more'});
    const expanded=await showMore.getAttribute('aria-expanded');
    if (expanded !== 'true') await showMore.click();
    const importItem=page.getByRole('menuitem',{name:'Import backup file'});
    if (!(await importItem.isVisible().catch(() => false))) await page.getByRole('menuitem',{name:'Data',exact:true}).hover();
    await expect(importItem).toBeVisible();
    const chooser=page.waitForEvent('filechooser');
    await importItem.focus();
    await importItem.press('Enter');
    await (await chooser).setFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(serialize(initialState()))});
  }
  await chooseBackupFile();
  await expect(confirmation).toBeVisible();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & {value:string}).value)).toBe('987654');
  await confirmation.getByRole('button',{name:'Keep current work'}).click();
  await expect(confirmation).toBeHidden();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & {value:string}).value)).toBe('987654');

  await chooseBackupFile();
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button',{name:'Replace session'}).click();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & {value:string}).value)).not.toBe('987654');
  const undo=page.getByRole('region',{name:'Session backup'}).getByRole('button',{name:'Undo import'});
  await expect(undo).toBeVisible();
  await undo.click();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & {value:string}).value)).toBe('987654');
});
