import { expect, test } from '../support/test';
import { GOOGLE_AUTH_BUTTON_NAME, installFakeGoogleAuth, openSyncPanel } from '../support/sync-panel';

const productionApi = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';
const localApi = 'http://127.0.0.1:8789';

type StoredEvent = { id: string; event: { id: string; type?: string; steps?: string[] } };
type WorkerSnapshot = { events: Array<{ seq: number; event: { id: string } }>; cursor: number; through: number; snapshotCursor: number; hasMore: boolean };

async function installLocalWorkerRoute(page: import('@playwright/test').Page, requests: Array<{ path: string; method: string; body?: unknown; at: number }>) {
  let dropNextEventsResponse = false;
  const context = page.context();
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== productionApi) return;
    requests.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() ?? undefined, at: Date.now() });
  });
  await context.route(`${productionApi}/**`, async route => {
    const url = route.request().url().replace(productionApi, localApi);
    const response = await route.fetch({ url });
    const requestUrl = new URL(route.request().url());
    if (dropNextEventsResponse && route.request().method() === 'POST' && requestUrl.pathname === '/events') {
      dropNextEventsResponse = false;
      await route.abort('failed');
      return;
    }
    await route.fulfill({ response });
  });
  return { dropNextEventsResponse: () => { dropNextEventsResponse = true; } };
}

async function readOutboxRecords(page: import('@playwright/test').Page): Promise<StoredEvent[]> {
  return page.evaluate(async dbName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredEvent[]>((resolve, reject) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => resolve(request.result as StoredEvent[]);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, 'math-scratchpad-sync-v2');
}

async function readWorkerSessionToken(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('math-scratchpad-auth-v1', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('session')) request.result.createObjectStore('session'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const request = db.transaction('session', 'readonly').objectStore('session').get('worker-session');
        request.onsuccess = () => resolve((request.result as { token?: string } | undefined)?.token ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

async function readWorkerEvents(page: import('@playwright/test').Page): Promise<WorkerSnapshot['events']> {
  const token = await readWorkerSessionToken(page);
  if (!token) throw new Error('The synthetic Worker session was not persisted in this browser context.');
  const result = await page.evaluate(async ({ localApi, token }) => {
    const response = await fetch(`${localApi}/snapshot?cursor=0&limit=100`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    return { status: response.status, body: await response.json() as WorkerSnapshot };
  }, { localApi, token });
  expect(result.status).toBe(200);
  return result.body.events;
}

async function connectAndEdit(page: import('@playwright/test').Page, answer: string, requests: Array<{ path: string; method: string; body?: unknown; at: number }>) {
  await installFakeGoogleAuth(page);
  const localWorkerRoute = await installLocalWorkerRoute(page, requests);
  const panel = await openSyncPanel(page);
  const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/session' && response.status() === 201);
  await page.getByRole('button', { name: GOOGLE_AUTH_BUTTON_NAME }).click();
  await sessionResponse;
  await expect.poll(() => readWorkerSessionToken(page)).not.toBeNull();

  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect(field).toBeVisible();
  await expect(panel.getByText(/همگام‌شده با سرور/)).toBeVisible();
  await field.evaluate((element, nextValue) => {
    const mathfield = element as HTMLElement & { value: string };
    mathfield.value = nextValue;
    mathfield.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }, answer);
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(answer);
  await expect.poll(async () => (await readOutboxRecords(page)).some(row => row.event.type === 'step_edited' && row.event.steps?.includes(answer))).toBe(true);
  const edited = (await readOutboxRecords(page)).find(row => row.event.type === 'step_edited' && row.event.steps?.includes(answer));
  if (!edited) throw new Error('The answer event was not found in the durable outbox.');
  return { panel, eventId: edited.id, localWorkerRoute };
}

test('exit-flush.pagehide-sends-the-outbox-within-two-seconds-and-Worker-deduplicates-on-reopen', async ({ page, context }) => {
  const requests: Array<{ path: string; method: string; body?: unknown; at: number }> = [];
  const answer = '24680';
  const { eventId, panel, localWorkerRoute } = await connectAndEdit(page, answer, requests);
  await expect(panel.getByText(/همگام‌شده با سرور/)).toBeVisible();
  const queuedRequestCount = requests.length;
  const closeStarted = Date.now();
  localWorkerRoute.dropNextEventsResponse();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => requests.slice(queuedRequestCount).some(item => item.path === '/events' && item.method === 'POST'
    && JSON.stringify(item.body).includes(eventId) && item.at - closeStarted < 2_000), { timeout: 2_000 }).toBe(true);
  expect(Date.now() - closeStarted).toBeLessThan(2_000);
  await expect.poll(async () => (await readWorkerEvents(page)).filter(row => row.event.id === eventId)).toHaveLength(1);
  await expect.poll(async () => (await readOutboxRecords(page)).some(row => row.id === eventId)).toBe(true);
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto('/');
  const field = reopened.locator('math-field[aria-label="Step 1 expression"]');
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(answer);
  await expect.poll(async () => (await readOutboxRecords(reopened)).every(row => row.id !== eventId)).toBe(true);
  await expect.poll(async () => (await readWorkerEvents(reopened)).filter(row => row.event.id === eventId)).toHaveLength(1);
  await reopened.close();
});

test('exit-flush.offline-pagehide-keeps-the-event-durable-and-syncs-on-reconnect', async ({ page, context }) => {
  const requests: Array<{ path: string; method: string; body?: unknown; at: number }> = [];
  const answer = '13579';
  const { eventId, panel } = await connectAndEdit(page, answer, requests);
  await expect(panel.getByText(/همگام‌شده با سرور/)).toBeVisible();
  const contextRequests = requests.length;
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(async () => (await readOutboxRecords(page)).some(row => row.id === eventId)).toBe(true);
  expect(requests.slice(contextRequests).some(item => item.path === '/events' && item.method === 'POST'
    && JSON.stringify(item.body).includes(eventId))).toBe(false);
  await page.close();

  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto('/');
  const field = reopened.locator('math-field[aria-label="Step 1 expression"]');
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(answer);
  await expect.poll(async () => (await readOutboxRecords(reopened)).some(row => row.id === eventId)).toBe(true);
  await expect.poll(async () => (await readOutboxRecords(reopened)).some(row => row.id === eventId), { timeout: 15_000 }).toBe(false);
  await expect.poll(async () => (await readWorkerEvents(reopened)).filter(row => row.event.id === eventId)).toHaveLength(1);
  await reopened.close();
});
