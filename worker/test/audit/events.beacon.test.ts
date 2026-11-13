import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { LEARNING_RESET_EPOCH } from '../../../src/sync/learning-reset-epoch';
import { createApp } from '../../src/index';
import type { WorkerEnv } from '../../src/env';

it('events.beacon.authenticates-a-safelisted-sendBeacon-body-and-deduplicates-retries', async () => {
  const bindings = env as unknown as WorkerEnv;
  const origin = bindings.ALLOWED_ORIGIN || 'https://amirhoseinlotfii.github.io';
  const app = createApp(async () => ({
    sub: 'synthetic-beacon-owner', email: bindings.OWNER_EMAIL, email_verified: true,
  }));
  const sessionResponse = await app.fetch(new Request('https://worker.test/session', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-google-id-token', Origin: origin },
  }), bindings);
  expect(sessionResponse.status).toBe(201);
  const session = await sessionResponse.json() as { sessionToken: string };

  const event = {
    id: crypto.randomUUID(), schema: 1, ts: new Date().toISOString(), deviceId: crypto.randomUUID(),
    bankVersion: 'synthetic-v1', session: 'pagehide-beacon', chapter: 1, lesson: '1.1',
    section: '1.1-a', concept: 'relations', type: 'lesson_open',
  };
  const sendBeacon = () => app.fetch(new Request('https://worker.test/events/beacon', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ sessionToken: session.sessionToken, epoch: LEARNING_RESET_EPOCH, events: [event] }),
  }), bindings);

  const first = await sendBeacon();
  expect(first.status).toBe(200);
  expect((await first.json() as { events: Array<{ id: string; duplicate: boolean }> }).events)
    .toEqual([{ id: event.id, seq: expect.any(Number), duplicate: false }]);
  const retry = await sendBeacon();
  expect(retry.status).toBe(200);
  expect((await retry.json() as { events: Array<{ id: string; duplicate: boolean }> }).events)
    .toEqual([{ id: event.id, seq: expect.any(Number), duplicate: true }]);

  const snapshot = await app.fetch(new Request('https://worker.test/snapshot?cursor=0&limit=100', {
    headers: { Authorization: `Bearer ${session.sessionToken}`, Origin: origin },
  }), bindings);
  expect(snapshot.status).toBe(200);
  const stored = await snapshot.json() as { events: Array<{ event: { id: string } }> };
  expect(stored.events.filter(row => row.event.id === event.id)).toHaveLength(1);
});

it('events.beacon-requires-the-configured-origin-and-a-worker-session', async () => {
  const bindings = env as unknown as WorkerEnv;
  const origin = bindings.ALLOWED_ORIGIN || 'https://amirhoseinlotfii.github.io';
  const app = createApp();
  const body = JSON.stringify({ sessionToken: 'not-a-session', epoch: LEARNING_RESET_EPOCH, events: [{}] });
  const wrongOrigin = await app.fetch(new Request('https://worker.test/events/beacon', {
    method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'text/plain' }, body,
  }), bindings);
  expect(wrongOrigin.status).toBe(403);
  const invalidSession = await app.fetch(new Request('https://worker.test/events/beacon', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body,
  }), bindings);
  expect(invalidSession.status).toBe(401);
});
