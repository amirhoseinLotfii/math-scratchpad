import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import { createApp } from '../../src/index';
import { validVerifier, makeEvent, call } from '../helpers/sync-worker';
describe('event api', () => {
  afterEach(async () => reset());
  it('validates the event schema before writing', async () => {
    const app = createApp(validVerifier);
    const response = await call(app, '/events', { token: 'valid-test-token', body: { events: [{ id: 'bad' }] } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_event' });
    const snapshot = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect(await snapshot.json()).toMatchObject({ events: [], cursor: 0, through: 0 });
  });

  it('accepts bounded legacy migration chunks and returns them in the private replay snapshot', async () => {
    const app = createApp(validVerifier);
    const migrationId = crypto.randomUUID();
    const event = {
      ...makeEvent(),
      bankVersion: 'migration-v1',
      session: `migration-${migrationId}`,
      chapter: 0,
      lesson: 'unknown',
      section: 'unknown',
      concept: 'legacy-storage',
      type: 'legacy_state_migration',
      itemId: 'math-scratchpad-session-v3',
      migrationChunk: { id: migrationId, key: 'math-scratchpad-session-v3', index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30=' },
    };
    const posted = await call(app, '/events', { method: 'POST', token: 'valid-test-token', body: { events: [event] } });
    expect(posted.status).toBe(200);
    const snapshot = await call(app, '/snapshot?limit=100', { token: 'valid-test-token' });
    const body = (await snapshot.json()) as { events: Array<{ event: { migrationChunk?: { id: string; data: string } } }> };
    expect(body.events).toContainEqual(
      expect.objectContaining({
        event: expect.objectContaining({ migrationChunk: expect.objectContaining({ id: migrationId, data: 'e30=' }) }),
      }),
    );
  });

  it('rejects oversized event batches before forwarding them to storage', async () => {
    const app = createApp(validVerifier);
    const largeEvent = { ...makeEvent(), note: 'x'.repeat(250_001) };
    const response = await call(app, '/events', { token: 'valid-test-token', body: { events: [largeEvent] } });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'payload_too_large' });
  });

  it('stores one row for retries and rejects an ID reused with different content', async () => {
    const app = createApp(validVerifier);
    const event = makeEvent();
    const first = await call(app, '/events', { token: 'valid-test-token', body: { events: [event] } });
    const firstResult = (await first.json()) as { events: { id: string; seq: number; duplicate: boolean }[] };
    expect(first.status).toBe(200);
    expect(firstResult.events[0]).toMatchObject({ id: event.id, seq: 1, duplicate: false });

    const reorderedEvent = Object.fromEntries(Object.entries(event).reverse());
    const reorderedRetry = await call(app, '/events', { token: 'valid-test-token', body: { events: [reorderedEvent] } });
    expect(await reorderedRetry.json()).toMatchObject({ events: [{ seq: 1, duplicate: true }] });

    const retry = await call(app, '/events', { token: 'valid-test-token', body: { events: [event] } });
    const retryResult = (await retry.json()) as { events: { seq: number; duplicate: boolean }[] };
    expect(retryResult.events[0]).toMatchObject({ seq: 1, duplicate: true });

    const reusedId = { ...event, note: 'different content' };
    const conflict = await call(app, '/events', { token: 'valid-test-token', body: { events: [reusedId] } });
    expect(conflict.status).toBe(409);
    const snapshot = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect(((await snapshot.json()) as { events: unknown[] }).events).toHaveLength(1);
  });

  it('keeps a conflicting batch atomic', async () => {
    const app = createApp(validVerifier);
    const first = makeEvent();
    const stored = await call(app, '/events', { token: 'valid-test-token', body: { events: [first] } });
    expect(stored.status).toBe(200);

    const second = makeEvent();
    const conflict = await call(app, '/events', {
      token: 'valid-test-token',
      body: { events: [second, { ...first, note: 'conflicting copy' }] },
    });
    expect(conflict.status).toBe(409);
    const afterConflict = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect(((await afterConflict.json()) as { events: unknown[] }).events).toHaveLength(1);
  });

  it('supports paged sync and a stable snapshot cursor', async () => {
    const app = createApp(validVerifier);
    const first = makeEvent();
    const second = makeEvent();
    const third = makeEvent();
    expect((await call(app, '/events', { token: 'valid-test-token', body: { events: [first, second, third] } })).status).toBe(200);

    const page1 = await call(app, '/sync?cursor=0&limit=2', { token: 'valid-test-token' });
    const page1Body = (await page1.json()) as { events: StoredEventForTest[]; cursor: number; through: number; hasMore: boolean };
    expect(page1Body.events.map((item) => item.seq)).toEqual([1, 2]);
    expect(page1Body).toMatchObject({ cursor: 2, through: 3, hasMore: true });
    const page2 = await call(app, `/sync?cursor=${page1Body.cursor}&through=${page1Body.through}&limit=2`, { token: 'valid-test-token' });
    expect(await page2.json()).toMatchObject({ events: [{ seq: 3 }], cursor: 3, through: 3, hasMore: false });

    const snapshot1 = await call(app, '/snapshot?limit=2', { token: 'valid-test-token' });
    const snapshotBody = (await snapshot1.json()) as { events: unknown[]; cursor: number; snapshotCursor: number };
    expect(snapshotBody).toMatchObject({ cursor: 2, snapshotCursor: 3 });
    const snapshot2 = await call(app, `/snapshot?cursor=${snapshotBody.cursor}&through=${snapshotBody.snapshotCursor}&limit=2`, {
      token: 'valid-test-token',
    });
    expect(await snapshot2.json()).toMatchObject({ events: [{ seq: 3 }], snapshotCursor: 3, hasMore: false });
  });

  it('rejects malformed cursors', async () => {
    const app = createApp(validVerifier);
    expect((await call(app, '/sync?cursor=-1', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/sync?limit=101', { token: 'valid-test-token' })).status).toBe(400);
  });

  it('enforces the configured per-owner request limit', async () => {
    const app = createApp(validVerifier);
    for (let index = 0; index < 5; index += 1) {
      const response = await call(app, '/sync', { token: 'valid-test-token' });
      expect(response.status).toBe(200);
    }
    const limited = await call(app, '/sync', { token: 'valid-test-token' });
    expect(limited.status).toBe(429);
    expect(limited.headers.has('Retry-After')).toBe(true);
  });
});

type StoredEventForTest = { seq: number; event: Record<string, unknown> };
