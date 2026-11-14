import { test, expect, mathField, clickMathKeys, mathValue } from '../support/test';
import { readLearningCache, readOutboxCount } from '../support/indexeddb';
import { storageKey } from '../support/mobile-journey';

const workerOrigin = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';
const oldEpoch = '2026-11-12-v3';
const candidateEpoch = 'server-generation-next';
const resetFlag = 'math-scratchpad-local-learning-reset-pending-v1';
const serverEpochKey = 'math-scratchpad-server-learning-reset-epoch-v1';
const pendingEpochKey = 'math-scratchpad-pending-learning-reset-epoch-v1';
const dbName = 'math-scratchpad-sync-v2';
const oldEventId = '10000000-0000-4000-8000-000000000001';

type QueuedEvent = { id: string; creationEpoch?: string; event: { id: string; [key: string]: unknown } };

async function readOutboxRecords(page: import('@playwright/test').Page): Promise<QueuedEvent[]> {
  return page.evaluate(async dbName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<QueuedEvent[]>((resolve, reject) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => resolve(request.result as QueuedEvent[]);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, dbName);
}

test('stuck-phone.local-only-keeps-answers-and-releases-only-after-the-server', async ({ page }) => {
  let resetStatus: 'idle' | 'awaiting_release' | 'released' = 'idle';
  const storedEvents = new Map<string, { id: string; seq: number }>();
  const writes: Array<{ path: string; body?: unknown }> = [];
  let writeCountAtPendingStart = 0;
  let googleRequests = 0;
  let googleRequestsBeforePending = 0;
  await page.addInitScript(() => {
    (window as Window & { __resetPopupCalls?: number }).__resetPopupCalls = 0;
    window.open = (() => {
      (window as Window & { __resetPopupCalls?: number }).__resetPopupCalls = ((window as Window & { __resetPopupCalls?: number }).__resetPopupCalls ?? 0) + 1;
      return null;
    }) as typeof window.open;
  });
  await page.route('https://accounts.google.com/**', route => { googleRequests += 1; return route.abort(); });
  await page.route(`${workerOrigin}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-math-scratchpad-reset-epoch', 'access-control-allow-methods': 'GET, POST, OPTIONS' },
      body: JSON.stringify(body),
    });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-math-scratchpad-reset-epoch', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
    if (path === '/reset/status') return json({ status: resetStatus, epoch: resetStatus === 'idle' ? oldEpoch : candidateEpoch });
    if (path === '/reset/epoch') return json({ epoch: resetStatus === 'released' ? candidateEpoch : oldEpoch });
    if (path === '/state' && request.method() === 'GET') return json({ records: [], revision: 0 });
    if (path === '/state' && request.method() === 'POST') {
      const body = request.postDataJSON(); writes.push({ path, body });
      return json({ key: (body as { key: string }).key, revision: 1, updatedAt: new Date().toISOString() });
    }
    if (path === '/events' && request.method() === 'POST') {
      const body = request.postDataJSON() as { events: Array<{ id: string }> };
      writes.push({ path, body });
      const ack = body.events.map(event => {
        let row = storedEvents.get(event.id);
        if (!row) { row = { id: event.id, seq: storedEvents.size + 1 }; storedEvents.set(event.id, row); }
        return { ...row, duplicate: false };
      });
      return json({ events: ack, cursor: storedEvents.size });
    }
    if (path === '/snapshot' || path === '/sync') return json({ events: [], cursor: storedEvents.size, through: storedEvents.size, snapshotCursor: storedEvents.size, hasMore: false });
    if (path === '/drive/status' || path === '/notion/status') return json({ status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null });
    return json({ error: 'not_found' }, 404);
  });

  await page.goto('/?serverMode=1');
  await expect(mathField(page)).toBeVisible();

  await page.evaluate(async ({ dbName, oldEpoch, resetFlag, serverEpochKey, oldEventId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const event = {
        id: oldEventId, schema: 1, ts: '2026-11-12T12:00:00.000Z', deviceId: '20000000-0000-4000-8000-000000000001',
        bankVersion: 'synthetic-v1', session: 'stuck-phone-old-work', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations', type: 'lesson_open',
      };
      tx.objectStore('outbox').put({ id: oldEventId, event, queuedAt: event.ts, creationEpoch: oldEpoch });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const authDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('math-scratchpad-auth-v1', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('session')) request.result.createObjectStore('session'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = authDb.transaction('session', 'readwrite');
      tx.objectStore('session').put({ token: `mss1.${'S'.repeat(43)}`, expiresAt: Date.now() + 7 * 24 * 60 * 60_000 }, 'worker-session');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    authDb.close();
    localStorage.setItem(serverEpochKey, oldEpoch);
    localStorage.setItem(resetFlag, '1');
  }, { dbName, oldEpoch, resetFlag, serverEpochKey, oldEventId });
  resetStatus = 'awaiting_release';
  writeCountAtPendingStart = writes.length;
  googleRequestsBeforePending = googleRequests;
  await page.reload();

  const editor = page.locator('[data-server-editor]');
  await expect(editor).toHaveAttribute('data-connection-state', 'local', { timeout: 2_000 });
  await expect(editor).not.toHaveAttribute('inert', '');
  await expect(page.getByText('پاسخ‌ها روی همین دستگاه ذخیره می‌شوند و پس از تأیید سرور همگام خواهند شد.')).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), pendingEpochKey)).toBe(candidateEpoch);
  await expect(page.getByRole('button', { name: /Sign in with Google|ورود با Google/i })).toHaveCount(0);
  await clickMathKeys(page, '456');
  await expect.poll(() => mathValue(mathField(page))).toContain('456');
  await expect.poll(async () => (await readOutboxRecords(page)).some(row => row.id !== oldEventId && row.creationEpoch === candidateEpoch)).toBe(true);
  const beforeReloadRecords = await readOutboxRecords(page);
  const beforeReloadIds = beforeReloadRecords.map(row => row.id);
  const candidateEvents = beforeReloadRecords.filter(row => row.id !== oldEventId && row.creationEpoch === candidateEpoch);
  const beforeReload = beforeReloadRecords.length;
  expect(beforeReload).toBeGreaterThanOrEqual(2);
  expect(candidateEvents.length).toBeGreaterThan(0);
  expect(writes.slice(writeCountAtPendingStart), 'no server writes while reset is awaiting release').toEqual([]);
  expect(await page.evaluate(() => (window as Window & { __resetPopupCalls?: number }).__resetPopupCalls ?? 0)).toBe(0);
  expect(googleRequests).toBe(googleRequestsBeforePending);

  await page.reload();
  await expect(editor).toHaveAttribute('data-connection-state', 'local', { timeout: 2_000 });
  await expect.poll(async () => {
    const records = await readOutboxRecords(page);
    return beforeReloadIds.every(id => records.some(row => row.id === id)) && new Set(records.map(row => row.id)).size === records.length;
  }).toBe(true);
  await expect.poll(() => mathValue(mathField(page))).toContain('456');

  resetStatus = 'released';
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), resetFlag), { timeout: 15_000 }).toBeNull();
  await expect.poll(() => [...storedEvents.keys()].filter(id => id !== oldEventId).length).toBeGreaterThanOrEqual(candidateEvents.length);

  const acceptedIds = [...storedEvents.keys()];
  const postedIds = writes.slice(writeCountAtPendingStart)
    .filter(write => write.path === '/events')
    .flatMap(write => ((write.body as { events: Array<{ id: string }> }).events ?? []).map(event => event.id));
  expect(acceptedIds).not.toContain(oldEventId);
  expect(new Set(acceptedIds).size).toBe(acceptedIds.length);
  expect(acceptedIds).toEqual(expect.arrayContaining(candidateEvents.map(row => row.id)));
  expect(postedIds).not.toContain(oldEventId);
  expect(new Set(postedIds).size).toBe(postedIds.length);
  expect(postedIds).toEqual(expect.arrayContaining(candidateEvents.map(row => row.id)));
  expect(writes.slice(writeCountAtPendingStart).filter(write => write.path === '/events')).toHaveLength(1);
  const quarantined = await page.evaluate(async dbName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('quarantine', 'readonly').objectStore('quarantine').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, dbName);
  expect(quarantined.find(record => (record as { id?: string }).id === oldEventId)).toMatchObject({ id: oldEventId, creationEpoch: oldEpoch, requiredEpoch: candidateEpoch });
  expect(await readLearningCache(page, storageKey)).toContain('456');
});

test('stuck-phone.unreachable-status-still-allows-local-editing-without-Google', async ({ page }) => {
  await page.addInitScript(({ resetFlag, serverEpochKey, oldEpoch }) => {
    localStorage.setItem(resetFlag, '1');
    localStorage.setItem(serverEpochKey, oldEpoch);
    (window as Window & { __resetPopupCalls?: number }).__resetPopupCalls = 0;
    window.open = (() => {
      (window as Window & { __resetPopupCalls?: number }).__resetPopupCalls = ((window as Window & { __resetPopupCalls?: number }).__resetPopupCalls ?? 0) + 1;
      return null;
    }) as typeof window.open;
  }, { resetFlag, serverEpochKey, oldEpoch });
  let writes = 0;
  let googleRequests = 0;
  await page.route('https://accounts.google.com/**', route => { googleRequests += 1; return route.abort(); });
  await page.route(`${workerOrigin}/**`, async route => {
    if (new URL(route.request().url()).pathname === '/reset/status') return route.abort('failed');
    if (route.request().method() === 'POST') writes += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ epoch: oldEpoch, records: [], revision: 0, events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false }) });
  });

  await page.goto('/?serverMode=1');
  const editor = page.locator('[data-server-editor]');
  await expect(editor).toHaveAttribute('data-connection-state', 'local', { timeout: 2_000 });
  await expect(editor).not.toHaveAttribute('inert', '');
  await expect(mathField(page)).toBeVisible();
  await clickMathKeys(page, '7');
  await expect.poll(() => mathValue(mathField(page))).toContain('7');
  await expect.poll(() => readOutboxCount(page)).toBeGreaterThan(0);
  expect(writes).toBe(0);
  expect(googleRequests).toBe(0);
  expect(await page.evaluate(() => (window as Window & { __resetPopupCalls?: number }).__resetPopupCalls ?? 0)).toBe(0);
});
