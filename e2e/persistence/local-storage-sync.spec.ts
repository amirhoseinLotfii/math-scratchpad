import { expect, test, type Page, mathField, mathValue, clickMathKeys } from '../support/test';
import { actions, initialState, makeStore } from '../../src/store';
import { serialize } from '../../src/persistence';
import { parse } from '../../src/parser';
import { stepLatex } from '../../src/model';
import { legacyStorageKey, storageKey } from '../support/mobile-journey';
async function seedLegacy(page: Page) {
 const s = makeStore(initialState()); s.dispatch(actions.startFractionRound());
 await page.addInitScript(({ key, raw }) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
 }, { key: legacyStorageKey, raw: serialize(s.getState()) });
}
async function readSaved(page: Page) {
 const raw = await page.evaluate(key => localStorage.getItem(key), storageKey);
 return raw ? JSON.parse(raw) : null;
}
async function expectSaved(page: Page) {
 await expect.poll(async () => !!(await readSaved(page)), { message: 'validated Zustand v3 draft must be saved' }).toBe(true);
 return readSaved(page);
}
test('SYNC-01: legacy Redux v2 draft migrates into validated Zustand persistence without losing questions', async ({ page }) => {
 await seedLegacy(page); await page.goto('/'); const saved = await expectSaved(page);
 expect(saved.version).toBe(3); expect(saved.state.session.doc.exercises).toHaveLength(20);
 expect(saved.state.sync.revision).toEqual(expect.any(Number));
 expect(saved.state.sync.writerId).toEqual(expect.any(String));
 expect(await page.evaluate(key => localStorage.getItem(key), legacyStorageKey)).not.toBeNull();
});
test('SYNC-02: reload preserves typed math, question and ordered steps', async ({ page }) => {
 await seedLegacy(page); await page.goto('/');
 const first = mathField(page); await clickMathKeys(page, '123');
 await page.getByRole('button', { name: 'Add step', exact: true }).click(); const second = mathField(page, 2); await expect(second).toBeFocused(); await clickMathKeys(page, '456');
 await expect.poll(() => mathValue(second)).toContain('456');
 await expect.poll(async () => { const saved = await readSaved(page); const step = saved?.state.session.doc.exercises[0].steps[1]; return step ? stepLatex(step) : null; }).toBe('456');
 const saved = await readSaved(page); expect(saved.state.session.doc.exercises[0].steps).toHaveLength(2); await page.reload();
 await expect.poll(() => mathValue(mathField(page))).toContain('123'); await expect.poll(() => mathValue(mathField(page, 2))).toBe('456');
 expect((await readSaved(page)).state.session.doc.exerciseId).toBe(saved.state.session.doc.exerciseId);
});
test('SYNC-03: another clean tab receives a saved draft without reloading', async ({ page, context }) => {
 await seedLegacy(page); await page.goto('/'); await expectSaved(page);
 const other = await context.newPage(); await other.goto('/');
 const first = mathField(page); await clickMathKeys(page, '777');
 await expect.poll(() => mathValue(mathField(other))).toContain('777');
 await expect(other.getByRole('dialog', { name: /draft conflict/i })).toHaveCount(0);
});
test('SYNC-04: storage events do not bounce forever between clean tabs', async ({ page, context }) => {
 await seedLegacy(page); await page.goto('/'); await expectSaved(page);
 await page.getByRole('button', { name: 'Pause', exact: true }).click();
 const other = await context.newPage(); await other.goto('/');
 await expect(other.getByRole('button', { name: 'Resume', exact: true })).toBeVisible(); // pause is shared through the saved session
 await other.clock.install(); await other.clock.runFor(1000);
 const first = mathField(page); await clickMathKeys(page, '222');
 await expect.poll(() => mathValue(mathField(other))).toContain('222');
 const before = await readSaved(other); await other.clock.runFor(2000); const after = await readSaved(other);
 expect(after.state.sync.revision).toBe(before.state.sync.revision);
 expect(after.state.sync.writerId).toBe(before.state.sync.writerId);
});
test('SYNC-05: an unsaved local edit is preserved when a conflicting remote revision arrives', async ({ page, context }) => {
 await page.clock.install(); await seedLegacy(page); await page.goto('/'); await page.clock.runFor(1000);
 await expectSaved(page); const other = await context.newPage(); await other.goto('/');
 // Freeze this tab before editing so the 180 ms autosave cannot race the remote write.
 await page.clock.pauseAt(new Date(Date.now() + 2000));
 const first = mathField(page);
 // Dispatch one MathLive input synchronously so the test can deliver a remote
 // storage event before the 180 ms persistence debounce flushes this local edit.
 await first.evaluate(element => {
  const field = element as HTMLElement & { value: string };
  field.focus(); field.value = '111'; field.dispatchEvent(new Event('input', { bubbles: true }));
 });
 await expect.poll(() => mathValue(first)).toBe('111');
 const remote = structuredClone(await readSaved(page)), expression = parse('888');
 expect(remote.state.session.doc.exercises[0].steps[0].expression.children[0].value).toBe('');
 remote.state.session.doc.exercises[0].steps[0].expression = expression;
 remote.state.session.doc.cursor.nodeId = expression.children[0].id;
 remote.state.session.doc.cursor.sequenceId = null;
 remote.state.session.doc.cursor.offset = 3;
 remote.state.sync.revision += 1; remote.state.sync.writerId = 'remote-test-tab';
 await other.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: JSON.stringify(remote) });
 const conflict = page.getByRole('dialog', { name: /draft conflict/i }); await expect(conflict).toBeVisible();
 await conflict.getByRole('button', { name: /Keep this tab/i }).click();
 await expect.poll(() => mathValue(first)).toContain('111');
});
test('SYNC-06: malformed saved data is not silently overwritten on application boot', async ({ page }) => {
 const bad = '{broken-json'; await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: bad });
 await page.goto('/'); await expect(page.getByRole('alert').filter({ hasText: /draft|recover|storage/i })).toBeVisible();
 expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(bad);
});
test('SYNC-07: localStorage write failure keeps editing usable and exposes export recovery', async ({ page }) => {
 await page.addInitScript(() => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
   if (key.startsWith('math-scratchpad')) throw new DOMException('Quota full', 'QuotaExceededError');
   return original.call(this, key, value);
  };
 });
 await page.goto('/'); const first = mathField(page); await clickMathKeys(page, '987');
 await expect(page.getByRole('alert').filter({ hasText: /storage|saved|backup/i })).toBeVisible();
 await expect.poll(() => mathValue(first)).toContain('987');
 await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: 'Show more' }).click();
 await expect(page.getByRole('menuitem', { name: /Copy full session JSON/i })).toBeVisible();
});
