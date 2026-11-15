import { expect, test } from '../support/test';
import { makeSizedSession } from '../../tests/helpers/large-session';

test('records mobile-390 recovery journal time under 4× CPU throttling', { tag: '@only-mobile-390' }, async ({ page, context }, info) => {
  const session = makeSizedSession(900_000);
  await page.addInitScript(
    (state) => {
      localStorage.setItem(
        'math-scratchpad-session-v3',
        JSON.stringify({ version: 3, state: { session: state, sync: { revision: 1, writerId: 'fixture' } } }),
      );
      const start = Storage.prototype.setItem;
      const writes: number[] = [];
      const tasks: number[] = [];
      const serialization: number[] = [];
      const stringify = JSON.stringify;
      JSON.stringify = function (value, ...args: [never?, never?]) {
        const before = performance.now();
        const result = stringify(value, ...args);
        if (value?.version === 1 && value?.snapshot?.version === 3) serialization.push(performance.now() - before);
        return result;
      };
      Object.assign(window, { journalProfile: { writes, tasks, serialization } });
      Storage.prototype.setItem = function (key, value) {
        const before = performance.now();
        start.call(this, key, value);
        if (key.startsWith('math-scratchpad-pending-draft-v1:')) writes.push(performance.now() - before);
      };
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) tasks.push(entry.duration);
        }).observe({ type: 'longtask', buffered: false });
      }
    },
    { doc: session.doc, prefs: session.prefs, keyboardOpen: false },
  );
  const client = await context.newCDPSession(page);
  await page.goto('/');
  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect(field).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.exercise-bar select').first()).toBeAttached();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await field.click();
  await field.focus();
  await expect(field).toBeFocused();
  await page.evaluate(() => {
    const profile = (window as Window & { journalProfile?: { writes: number[]; tasks: number[]; serialization: number[] } })
      .journalProfile!;
    profile.writes.length = 0;
    profile.tasks.length = 0;
    profile.serialization.length = 0;
  });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('1234567890'.repeat(10));
  const profile = await page.evaluate(
    () => (window as Window & { journalProfile?: { writes: number[]; tasks: number[]; serialization: number[] } }).journalProfile!,
  );
  expect(profile.writes.length).toBeGreaterThan(0);
  await info.attach('recovery-journal-profile.json', { body: JSON.stringify(profile), contentType: 'application/json' });
  console.info(
    JSON.stringify({
      writes: profile.writes.length,
      maxWriteMs: Math.max(...profile.writes),
      maxSerializationMs: Math.max(...profile.serialization),
      longTasksMs: profile.tasks,
    }),
  );
});
