import { expect, test } from '../support/test';
import { actions, initialState, makeStore } from '../../src/store';
import { storageKey } from '../support/mobile-journey';
/** A draft saved by the pre-ux-batch release: in-progress question 5 with Step 1 "+6", accumulated time, no new fields. */
function oldDraft() {
  const s = makeStore(initialState()); s.dispatch(actions.startFractionRound());
  const q5 = s.getState().doc.exercises[4].id; s.dispatch(actions.switchExercise(q5));
  s.dispatch(actions.command({ type: 'operator', value: '+' })); s.dispatch(actions.command({ type: 'digit', value: '6' }));
  const doc = JSON.parse(JSON.stringify(s.getState().doc));
  for (const e of doc.exercises) { delete e.guidance; delete e.guidanceOpenedAt; delete e.timerRunningSince; delete e.timerPaused; }
  doc.exercises[4].elapsedMs = 125_000;
  return { version: 3, state: { session: { doc, prefs: s.getState().prefs, keyboardOpen: true }, sync: { revision: 7, writerId: 'old-release' } } };
}
test('MIGRATE-UX: an old in-progress draft (Q5, Step 1 "+6", 2:05 tracked) survives the upgrade and a reload', async ({ page }) => {
  const draft = oldDraft();
  await page.addInitScript(({ key, raw }) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, raw); } }, { key: storageKey, raw: JSON.stringify(draft) });
  await page.goto('/');
  await expect(page.locator('select[aria-label="Select question"]')).toHaveValue(draft.state.session.doc.exerciseId);
  await expect(page.getByLabel('Step 1 expression')).toContainText('+6');
  const time = page.getByLabel('Question elapsed time');
  await expect(time).toHaveText(/^0?2:0[5-9]$/);
  await page.reload();
  await expect(page.getByLabel('Step 1 expression')).toContainText('+6');
  await expect(time).toHaveText(/^0?2:(0[5-9]|1\d)$/);
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), storageKey);
  const ex = saved.state.session.doc.exercises[4];
  expect(ex.elapsedMs).toBeGreaterThanOrEqual(125_000); expect(saved.state.session.doc.exercises).toHaveLength(20);
});
