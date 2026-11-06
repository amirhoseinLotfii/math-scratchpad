import { expect, test } from '../support/test';
import { readLearningCache, writeLearningCacheFromOtherTab } from '../support/indexeddb';

const savedKey = 'math-scratchpad-session-v3';
const draftKeys = (page: import('@playwright/test').Page) =>
 page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('math-scratchpad-pending-draft-v1:')));

test('PERSIST-QUICK-01: added/final steps survive an immediate reload', async ({ page }) => {
 await page.goto('/?serverMode');
 await page.getByRole('button', { name: 'Add step' }).click();
 await page.getByRole('button', { name: 'Mark Step 2 as final' }).click();
 expect(await draftKeys(page)).toHaveLength(1);
 await page.reload();
 await expect(page.getByRole('button', { name: 'Step 2', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Mark Step 2 as final' })).toHaveAttribute('aria-pressed', 'true');
 // A second rapid reload must also work before the primary DB catches up.
 await page.reload();
 await expect(page.getByRole('button', { name: 'Step 2', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Mark Step 2 as final' })).toHaveAttribute('aria-pressed', 'true');
 await expect.poll(async () => {
  const raw = await readLearningCache(page, savedKey);
  return raw ? JSON.parse(raw).state.session.doc.exercises[0].steps.length : 0;
 }).toBe(2);
 await expect.poll(async () => (await draftKeys(page)).length).toBe(0);
});

test('PERSIST-QUICK-02: switching to a new problem survives immediate reload', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: 'New Problem' }).click();
 await page.getByRole('textbox', { name: 'Problem' }).fill(String.raw`\frac{3}{4}+\frac{1}{8}`);
 await page.getByRole('region', { name: 'New exercise' }).getByRole('button', { name: 'Start' }).click();
 await page.reload();
 const original = page.locator('math-div[aria-label="Original question expression"]');
 await expect(original).toBeVisible();
 await expect.poll(() => original.evaluate(node => node.textContent)).toBe(String.raw`\frac{3}{4}+\frac{1}{8}`);
 await expect.poll(() => original.evaluate(node => node.shadowRoot?.querySelector('math')?.textContent)).toBe('34+18');
});

test('PERSIST-QUICK-03: a new tab uses the authoritative saved copy after a finished flush', async ({ page, context }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Add step' }).click();
 await expect.poll(async () => {
  const raw = await readLearningCache(page, savedKey);
  return raw ? JSON.parse(raw).state.session.doc.exercises[0].steps.length : 0;
 }).toBe(2);
 await expect.poll(async () => (await draftKeys(page)).length).toBe(0);
 const another = await context.newPage();
 await another.goto('/');
 await expect(another.getByRole('button', { name: 'Step 2', exact: true })).toBeVisible();
 await expect(another.getByRole('dialog', { name: /draft conflict/i })).toHaveCount(0);
});


test('PERSIST-QUICK-04: invalid emergency journal is preserved and warns rather than overwritten', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Add step' }).waitFor();
 const key = await page.evaluate(() => {
  const tabId = sessionStorage.getItem('math-scratchpad-draft-tab-v1');
  if (!tabId) throw new Error('Missing per-tab draft identity');
  const key = 'math-scratchpad-pending-draft-v1:' + tabId;
  localStorage.setItem(key, '{broken-journal');
  return key;
 });
 await page.reload();
 await expect(page.getByRole('alert').filter({ hasText: /pending browser draft/i })).toBeVisible();
 expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{broken-journal');
});

test('PERSIST-QUICK-05: accepting a newer saved draft does not revive discarded local edits', async ({ page, context }) => {
 await page.clock.install();
 await page.goto('/');
 await page.getByRole('button', { name: 'Add step' }).click();
 await page.clock.runFor(1000);
 await expect.poll(async () => {
  const raw = await readLearningCache(page, savedKey);
  return raw ? JSON.parse(raw).state.session.doc.exercises[0].steps.length : 0;
 }).toBe(2);
 const another = await context.newPage();
 await another.goto('/');
 await page.clock.pauseAt(new Date(Date.now() + 2000));
 await page.getByRole('button', { name: 'Add step' }).click();
 await expect(page.getByRole('button', { name: 'Step 3', exact: true })).toBeVisible();
 expect(await draftKeys(page)).toHaveLength(1);

 const saved = JSON.parse((await readLearningCache(page, savedKey))!);
 saved.state.sync.revision += 1;
 saved.state.sync.writerId = 'other-writer';
 await writeLearningCacheFromOtherTab(another, savedKey, JSON.stringify(saved));
 const dialog = page.getByRole('dialog', { name: /draft conflict/i });
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button', { name: 'Use saved draft' }).click();
 await expect(page.getByRole('button', { name: 'Step 3', exact: true })).toHaveCount(0);
 expect(await draftKeys(page)).toHaveLength(0);
 await page.reload();
 await expect(page.getByRole('button', { name: 'Step 2', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Step 3', exact: true })).toHaveCount(0);
 await expect(page.getByText(/A pending browser draft conflicts/i)).toHaveCount(0);
});
