import { expect, test } from '../support/test';
import { GOOGLE_AUTH_BUTTON_NAME, installFakeGoogleAuth, openSyncPanel } from '../support/sync-panel';

const localApi = 'http://127.0.0.1:8789';

type StoredEvent = { id: string; event: { id: string; type?: string; steps?: string[] } };
type WorkerSnapshot = { events: Array<{ seq: number; event: { id: string } }>; cursor: number; through: number; snapshotCursor: number; hasMore: boolean };
type ApiRequest = { path: string; method: string; body?: unknown; at: number };

function observeLocalWorkerRequests(page: import('@playwright/test').Page, requests: ApiRequest[]): void {
  const context = page.context();
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== localApi) return;
    let body: unknown;
    const postData = request.postData();
    if (postData) {
      try { body = JSON.parse(postData); }
      catch { try { body = request.postDataJSON(); } catch { /* Keep non-JSON request bodies out of the audit log. */ } }
    }
    requests.push({ path: url.pathname, method: request.method(), body, at: Date.now() });
  });
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

async function readWorkerEvents(page: import('@playwright/test').Page, existingToken?: string): Promise<WorkerSnapshot['events']> {
  const token = existingToken ?? await readWorkerSessionToken(page);
  if (!token) throw new Error('The synthetic Worker session was not persisted in this browser context.');
  const events: WorkerSnapshot['events'] = [];
  let cursor = 0;
  let through: number | undefined;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const params = new URLSearchParams({ cursor: String(cursor), limit: '100' });
    if (through !== undefined) params.set('through', String(through));
    const response = await page.context().request.get(`${localApi}/snapshot?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok()) throw new Error(`Local Worker snapshot returned ${response.status()}.`);
    const body = await response.json() as WorkerSnapshot;
    events.push(...body.events);
    through ??= body.snapshotCursor;
    if (!body.hasMore) return events;
    if (body.cursor <= cursor) throw new Error('Local Worker snapshot pagination did not advance.');
    cursor = body.cursor;
  }
  throw new Error('Local Worker snapshot exceeded the E2E pagination limit.');
}

async function connectAndEdit(
  page: import('@playwright/test').Page,
  answer: string,
  requests: ApiRequest[],
  beforeEdit?: () => Promise<void>,
) {
  await installFakeGoogleAuth(page);
  observeLocalWorkerRequests(page, requests);
  const panel = await openSyncPanel(page);
  const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/session' && response.status() === 201);
  await page.getByRole('button', { name: GOOGLE_AUTH_BUTTON_NAME }).click();
  await sessionResponse;
  await expect.poll(() => readWorkerSessionToken(page)).not.toBeNull();

  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect(field).toBeVisible();
  await expect(panel.getByText(/همگام‌شده با سرور/)).toBeVisible();
  await beforeEdit?.();
  await field.evaluate((element, nextValue) => {
    const mathfield = element as HTMLElement & { value: string };
    mathfield.value = nextValue;
    mathfield.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }, answer);
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(answer);
  await expect.poll(async () => (await readOutboxRecords(page)).some(row => row.event.type === 'step_edited' && row.event.steps?.includes(answer))).toBe(true);
  const edited = (await readOutboxRecords(page)).find(row => row.event.type === 'step_edited' && row.event.steps?.includes(answer));
  if (!edited) throw new Error('The answer event was not found in the durable outbox.');
  await expect.poll(async () => {
    const text = await panel.getByText(/\d+ رویداد در صف محلی/).textContent();
    return Number.parseInt(text ?? '0', 10);
  }).toBeGreaterThan(0);
  return { panel, eventId: edited.id };
}

test('exit-flush.pagehide-sends-the-outbox-within-two-seconds-and-Worker-deduplicates-on-reopen', async ({ page, context }) => {
  const requests: ApiRequest[] = [];
  const answer = '24680';
  let allowRegularRetry = false;
  const blockNormalRetry = async (route: import('@playwright/test').Route) => {
    if (allowRegularRetry) await route.continue();
    else await route.abort();
  };
  const { eventId, panel } = await connectAndEdit(page, answer, requests, async () => {
    await context.route(`${localApi}/events`, blockNormalRetry);
  });
  await expect(panel.getByText(/همگام‌شده با سرور/)).toBeVisible();
  const sessionToken = await readWorkerSessionToken(page);
  if (!sessionToken) throw new Error('The synthetic Worker session was not persisted in this browser context.');
  const closeStarted = Date.now();
  await page.goto('about:blank');
  await expect.poll(async () => (await readWorkerEvents(page, sessionToken)).filter(row => row.event.id === eventId), { timeout: 2_000 }).toHaveLength(1);
  expect(Date.now() - closeStarted).toBeLessThan(2_000);
  const reopened = await context.newPage();
  await reopened.goto('/');
  const field = reopened.locator('math-field[aria-label="Step 1 expression"]');
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(answer);
  await expect.poll(async () => (await readOutboxRecords(reopened)).some(row => row.id === eventId)).toBe(true);
  allowRegularRetry = true;
  await expect.poll(async () => (await readOutboxRecords(reopened)).every(row => row.id !== eventId)).toBe(true);
  await expect.poll(async () => (await readWorkerEvents(reopened, sessionToken)).filter(row => row.event.id === eventId)).toHaveLength(1);
  await context.unroute(`${localApi}/events`, blockNormalRetry);
  await reopened.close();
});

test('exit-flush.offline-pagehide-keeps-the-event-durable-and-syncs-on-reconnect', async ({ page, context }) => {
  const requests: Array<{ path: string; method: string; body?: unknown; at: number }> = [];
  const answer = '13579';
  const { eventId, panel } = await connectAndEdit(page, answer, requests, () => context.setOffline(true));
  await expect(panel.getByText(/\d+ رویداد در صف محلی/)).toBeVisible();
  const contextRequests = requests.length;
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
  await expect.poll(async () => (await readOutboxRecords(reopened)).some(row => row.id === eventId), { timeout: 15_000 }).toBe(false);
  await expect.poll(async () => (await readWorkerEvents(reopened)).filter(row => row.event.id === eventId)).toHaveLength(1);
  await reopened.close();
});
