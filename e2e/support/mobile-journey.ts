import { expect, type Page } from '@playwright/test';
import { actions, initialState, makeStore } from '../../src/store';
import { serialize } from '../../src/persistence';
export const legacyStorageKey = 'math-scratchpad-redux-v2';
export const storageKey = 'math-scratchpad-session-v3';
export async function startBatch(page: Page) {
 await page.goto('/'); await page.getByRole('button', { name: 'Exercise menu' }).click();
 await page.getByRole('menuitem', { name: /Start Round 1/ }).click();
 await page.getByRole('button', { name: 'Start 20 Questions', exact: true }).click();
 await expect(page.getByRole('combobox', { name: 'Current exercise' }).locator('option')).toHaveCount(20);
}
export async function openConfidence(page: Page) {
 await startBatch(page); await page.getByRole('button', { name: /Next question/i }).click();
 const dialog = page.getByRole('dialog', { name: /confidence/i }); await expect(dialog).toBeVisible(); return dialog;
}
export async function openCompletion(page: Page) {
 const s = makeStore(initialState()); s.dispatch(actions.startFractionRound());
 s.dispatch(actions.switchExercise(s.getState().doc.exercises.at(-1)!.id));
 s.dispatch(actions.command({ type: 'digit', value: '3' }));
 const data = JSON.parse(serialize(s.getState()));
 data.doc.exercises.slice(0, -1).forEach((e: { skipped: boolean }) => { e.skipped = true; });
 await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: legacyStorageKey, raw: JSON.stringify(data) });
 await page.goto('/'); await page.getByRole('button', { name: /Finish session/i }).click();
 const confidence = page.getByRole('dialog', { name: /confidence/i });
 await confidence.getByRole('radio', { name: 'High' }).check();
 await confidence.getByRole('button', { name: /Continue/i }).click();
 const dialog = page.getByRole('dialog', { name: /Session complete/i }); await expect(dialog).toBeVisible();
 return dialog;
}
