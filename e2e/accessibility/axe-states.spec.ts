import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openCompletion, openConfidence, startBatch } from '../support/mobile-journey';
const states = ['single-edit','batch-edit','menu','symbols','confidence','confidence-error','completion','new-problem','invalid-json'] as const;
for (const state of states) test(`AXE ${state}: no WCAG A/AA violations including contrast`, async ({ page }, info) => {
 if (state === 'confidence' || state === 'confidence-error') {
  const dialog = await openConfidence(page);
  if (state === 'confidence-error') await dialog.getByRole('button', { name: /Continue/i }).click();
 } else if (state === 'completion') await openCompletion(page);
 else if (state === 'batch-edit') await startBatch(page);
 else {
  await page.goto('/');
  if (state === 'menu') await page.getByRole('button', { name: 'Exercise menu' }).click();
  if (state === 'symbols') { await page.getByRole('main').focus(); await page.keyboard.type('/'); }
  if (state === 'new-problem') { await page.getByRole('button', { name: 'Exercise menu' }).click(); await page.getByRole('menuitem', { name: 'New Problem', exact: true }).click(); }
  if (state === 'invalid-json') {
   await page.getByRole('button', { name: 'Exercise menu' }).click();
   await page.getByRole('menuitem', { name: 'Import session JSON' }).click();
   await page.getByRole('textbox', { name: 'Copy or paste session JSON' }).fill('not JSON');
   await page.getByRole('button', { name: 'Restore' }).click();
  }
 }
 const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
 await info.attach(`axe-${state}`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
 // Incomplete/manual-review items remain in the report; no rule exclusions or snapshots.
 expect(results.violations).toEqual([]);
});
