import { expect, mathValue, test, type Page } from '../support/test';
import { initialState } from '../../src/store';
import { GOOGLE_AUTH_BUTTON_NAME, installFakeGoogleAuth } from '../support/sync-panel';
import { LEARNING_RESET_EPOCH } from '../../src/sync/learning-reset-epoch';

const API = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';
const SESSION_KEY = 'math-scratchpad-session-v3';

type StoredStep = {
  id: string;
  expression: { id: string; type: 'sequence'; children: Array<{ id: string; type: string; value?: string }> };
  final: boolean;
  status: string;
  mathLatex?: string;
};
type StoredSessionValue = {
  version: 3;
  state: {
    session: {
      doc: { exercises: Array<{ id: string; source: string; prompt?: string; steps: StoredStep[] }> };
      prefs: unknown;
      keyboardOpen: boolean;
    };
    sync: { revision: number; writerId: string };
  };
};
type StateRecord = { value: string | null; revision: number; updatedAt: string };

function initialSessionValue(): string {
  const state = initialState();
  return JSON.stringify({ version: 3, state: {
    session: { doc: state.doc, prefs: state.prefs, keyboardOpen: false },
    sync: { revision: 1, writerId: 'seed-device' },
  } });
}

async function installConflictWorker(page: Page, records: Map<string, StateRecord>) {
  await page.route(`${API}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.pathname === '/reset/status' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'idle', epoch: LEARNING_RESET_EPOCH }),
      });
      return;
    }
    if (url.pathname === '/session' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ sessionToken: `mss1.${'S'.repeat(43)}`, expiresAt: Date.now() + 7 * 24 * 60 * 60_000 }) });
      return;
    }
    if (url.pathname === '/state' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [...records].map(([key, record]) => ({ key, ...record })), revision: records.size }) });
      return;
    }
    if (url.pathname === '/state' && method === 'POST') {
      const input = request.postDataJSON() as { key: string; value: string | null; revision: number };
      const current = records.get(input.key), revision = current?.revision ?? 0;
      if (input.revision !== revision) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'state_conflict', revision }) });
        return;
      }
      const next = { value: input.value, revision: revision + 1, updatedAt: new Date().toISOString() };
      records.set(input.key, next);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: input.key, revision: next.revision, updatedAt: next.updatedAt }) });
      return;
    }
    if (url.pathname === '/events' && method === 'POST') {
      const events = (request.postDataJSON() as { events?: Array<{ id: string }> }).events ?? [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: events.length }) });
      return;
    }
    if (url.pathname === '/snapshot' || url.pathname === '/sync') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[],"cursor":0,"through":0,"snapshotCursor":0,"hasMore":false}' });
      return;
    }
    if (url.pathname === '/drive/status' || url.pathname === '/notion/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"not_configured","pendingCount":0,"lastSyncedAt":null,"lastError":null}' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });
}

async function runOverlapJourney(page: Page) {
  const baseValue = initialSessionValue();
  const records = new Map<string, StateRecord>([[SESSION_KEY, { value: baseValue, revision: 1, updatedAt: new Date().toISOString() }]]);
  await installFakeGoogleAuth(page);
  await installConflictWorker(page, records);
  await page.addInitScript(value => localStorage.setItem('math-scratchpad-session-v3', value), baseValue);
  await page.goto('/?serverMode=1');

  const connection = page.locator('aside[aria-label="وضعیت همگام‌سازی"]');
  await connection.getByRole('button', { name: GOOGLE_AUTH_BUTTON_NAME }).click();
  await expect(page.locator('[data-server-editor]')).toHaveAttribute('data-connection-state', 'online');

  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('123');
  await expect.poll(() => records.get(SESSION_KEY)?.revision ?? 0).toBeGreaterThan(1);

  const remote = JSON.parse(records.get(SESSION_KEY)!.value!) as StoredSessionValue;
  const step = remote.state.session.doc.exercises[0]?.steps[0];
  if (!step) throw new Error('The seeded session did not contain its first work step.');
  step.expression.children = [{ id: 'other-device-number', type: 'number', value: '9' }];
  delete step.mathLatex;
  remote.state.sync = { revision: 3, writerId: 'other-device' };
  const current = records.get(SESSION_KEY)!;
  records.set(SESSION_KEY, { ...current, value: JSON.stringify(remote), revision: current.revision + 1 });

  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('8');
  const conflictDialog = page.getByRole('dialog', { name: 'Session changes overlap' });
  await expect(conflictDialog).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => mathValue(field)).toBe('8');
  await conflictDialog.getByRole('button', { name: 'Use server version' }).click();

  await expect(conflictDialog).toBeHidden();
  await expect.poll(() => mathValue(field)).toBe('9');
  expect(JSON.parse(records.get(SESSION_KEY)!.value!).state.session.doc.exercises[0]?.steps[0]?.expression.children[0]?.value).toBe('9');
}

test('mobile 390 presents overlapping server changes and applies the chosen version', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await runOverlapJourney(page);
});

test('laptop 1440 presents overlapping server changes and applies the chosen version', { tag: '@only-laptop-1440' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await runOverlapJourney(page);
});
