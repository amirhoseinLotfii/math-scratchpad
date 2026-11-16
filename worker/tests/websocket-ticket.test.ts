import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { env, reset, runInDurableObject } from 'cloudflare:test';
import { createApp, type IdTokenVerifier } from '../src/index';
import type { GoogleIdentity, WorkerEnv } from '../src/env';
import { consumeWebSocketTicket, isValidWebSocketDeviceId, isValidWebSocketTicket } from '../src/event-store/websocket-ticket';
import { ALLOWED_ORIGIN, OWNER, OWNER_EMAIL, testEnv } from './helpers/sync-worker';

const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';
const verifier: IdTokenVerifier = async (token) => {
  if (token === 'owner-id-token') return OWNER;
  throw new Error('invalid token');
};

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

function call(path: string, options: { method?: string; token?: string; origin?: string; body?: unknown; upgrade?: boolean } = {}) {
  const headers = new Headers();
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.origin) headers.set('Origin', options.origin);
  if (options.upgrade) headers.set('Upgrade', 'websocket');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return createApp(verifier).fetch(
    new Request(`https://worker.test${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    }),
    testEnv,
  );
}

async function issueSession(): Promise<{ sessionToken: string }> {
  const response = await call('/session', { method: 'POST', token: 'owner-id-token' });
  expect(response.status).toBe(201);
  return response.json();
}

function ownerStub() {
  return testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL));
}

describe('WebSocket ticket authentication', () => {
  it('keeps ticket and device validators strict across generated input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (value) => {
        expect(isValidWebSocketTicket(value)).toBe(/^[A-Za-z0-9_-]{43}$/.test(value));
        expect(isValidWebSocketDeviceId(value)).toBe(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
      }),
      { seed: 20261115, numRuns: 5_000 },
    );
  });

  it('requires a Worker session, binds the ticket to one device, and consumes it once', async () => {
    const session = await issueSession();
    expect((await call('/ws/ticket', { method: 'POST', token: 'owner-id-token', body: { deviceId: DEVICE_A } })).status).toBe(401);

    const issued = await call('/ws/ticket', {
      method: 'POST',
      token: session.sessionToken,
      origin: ALLOWED_ORIGIN,
      body: { deviceId: DEVICE_A },
    });
    expect(issued.status).toBe(201);
    const ticket = (await issued.json()) as { ticket: string; expiresAt: number };
    expect(ticket.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ticket.expiresAt).toBeGreaterThan(Date.now());

    const consumed = await runInDurableObject(ownerStub(), (_instance, state) =>
      consumeWebSocketTicket(state.storage, ticket.ticket, DEVICE_A),
    );
    expect(consumed?.deviceId).toBe(DEVICE_A);
    expect(
      await runInDurableObject(ownerStub(), (_instance, state) => consumeWebSocketTicket(state.storage, ticket.ticket, DEVICE_A)),
    ).toBeUndefined();
  });

  it('rejects a ticket on another device and after expiry', async () => {
    const session = await issueSession();
    const issued = await call('/ws/ticket', { method: 'POST', token: session.sessionToken, body: { deviceId: DEVICE_A } });
    const ticket = (await issued.json()) as { ticket: string };
    expect(
      await runInDurableObject(ownerStub(), (_instance, state) => consumeWebSocketTicket(state.storage, ticket.ticket, DEVICE_B)),
    ).toBeUndefined();

    const second = await call('/ws/ticket', { method: 'POST', token: session.sessionToken, body: { deviceId: DEVICE_A } });
    const expired = (await second.json()) as { ticket: string };
    await runInDurableObject(ownerStub(), (_instance, state) => {
      state.storage.sql.exec('UPDATE ws_tickets SET expires_at = ?', Date.now() - 1);
    });
    expect(
      await runInDurableObject(ownerStub(), (_instance, state) => consumeWebSocketTicket(state.storage, expired.ticket, DEVICE_A)),
    ).toBeUndefined();
  });

  it('requires the configured Origin and a WebSocket upgrade', async () => {
    const session = await issueSession();
    const issued = await call('/ws/ticket', { method: 'POST', token: session.sessionToken, body: { deviceId: DEVICE_A } });
    const ticket = (await issued.json()) as { ticket: string };
    expect((await call(`/ws?ticket=${ticket.ticket}&device=${DEVICE_A}`, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(`/ws?ticket=${ticket.ticket}&device=${DEVICE_A}`, { origin: ALLOWED_ORIGIN })).status).toBe(426);
  });

  it('opens an authenticated Hibernation API socket, completes hello, and answers ping', async () => {
    const session = await issueSession();
    const issued = await call('/ws/ticket', { method: 'POST', token: session.sessionToken, body: { deviceId: DEVICE_A } });
    const ticket = (await issued.json()) as { ticket: string };
    const response = await call(`/ws?ticket=${ticket.ticket}&device=${DEVICE_A}`, { origin: ALLOWED_ORIGIN, upgrade: true });
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    const client = response.webSocket!;
    client.accept();
    const messages: string[] = [];
    client.addEventListener('message', (event) => {
      messages.push(String(event.data));
    });
    client.send(
      JSON.stringify({
        protocol: 'ms-sync/1',
        type: 'hello',
        deviceId: DEVICE_A,
        epoch: 'learning-reset-v1',
        cursor: 0,
        stateRevision: 0,
        appSha: 'test-sha',
      }),
    );
    await vi.waitFor(() => expect(messages.some((message) => JSON.parse(message).type === 'welcome')).toBe(true));
    client.send(JSON.stringify({ protocol: 'ms-sync/1', type: 'ping' }));
    await vi.waitFor(() => expect(messages.some((message) => JSON.parse(message).type === 'pong')).toBe(true));
  });

  it('acknowledges pushed events and broadcasts events/state changes to another device', async () => {
    const session = await issueSession();
    const open = async (deviceId: string) => {
      const issued = await call('/ws/ticket', { method: 'POST', token: session.sessionToken, body: { deviceId } });
      const ticket = (await issued.json()) as { ticket: string };
      const response = await call(`/ws?ticket=${ticket.ticket}&device=${deviceId}`, { origin: ALLOWED_ORIGIN, upgrade: true });
      expect(response.status).toBe(101);
      const socket = response.webSocket!;
      socket.accept();
      const messages: string[] = [];
      socket.addEventListener('message', (event) => {
        messages.push(String(event.data));
      });
      socket.send(
        JSON.stringify({
          protocol: 'ms-sync/1',
          type: 'hello',
          deviceId,
          epoch: 'learning-reset-v1',
          cursor: 0,
          stateRevision: 0,
          appSha: 'test-sha',
        }),
      );
      await vi.waitFor(() => expect(messages.some((message) => JSON.parse(message).type === 'welcome')).toBe(true));
      return { socket, messages };
    };
    const first = await open(DEVICE_A);
    const second = await open(DEVICE_B);
    first.socket.send(
      JSON.stringify({
        protocol: 'ms-sync/1',
        type: 'events.push',
        events: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            schema: 1,
            ts: '2026-11-15T10:00:00.000Z',
            deviceId: DEVICE_A,
            bankVersion: 'v21',
            session: 'test-session',
            chapter: 1,
            lesson: '1.1',
            section: '1.1',
            concept: 'relations',
            type: 'lesson_open',
          },
        ],
      }),
    );
    await vi.waitFor(() => expect(first.messages.some((message) => JSON.parse(message).type === 'ack')).toBe(true));
    await vi.waitFor(() => expect(second.messages.some((message) => JSON.parse(message).type === 'events')).toBe(true));
    first.socket.send(
      JSON.stringify({
        protocol: 'ms-sync/1',
        type: 'state.put',
        key: 'math-scratchpad-session-v3',
        value: 'remote-value',
        baseRevision: 0,
      }),
    );
    await vi.waitFor(() => expect(second.messages.some((message) => JSON.parse(message).type === 'state.changed')).toBe(true));
    first.socket.close();
    second.socket.close();
  });

  it('closes an active socket with 4401 when its Worker session is revoked', async () => {
    const session = await issueSession();
    const issued = await call('/ws/ticket', { method: 'POST', token: session.sessionToken, body: { deviceId: DEVICE_A } });
    const ticket = (await issued.json()) as { ticket: string };
    const response = await call(`/ws?ticket=${ticket.ticket}&device=${DEVICE_A}`, { origin: ALLOWED_ORIGIN, upgrade: true });
    const client = response.webSocket!;
    client.accept();
    let closeCode: number | undefined;
    client.addEventListener('close', (event) => {
      closeCode = event.code;
    });
    client.send(
      JSON.stringify({
        protocol: 'ms-sync/1',
        type: 'hello',
        deviceId: DEVICE_A,
        epoch: 'learning-reset-v1',
        cursor: 0,
        stateRevision: 0,
        appSha: 'test-sha',
      }),
    );
    await call('/session/revoke', { method: 'POST', token: session.sessionToken });
    await vi.waitFor(() => expect(closeCode).toBe(4401));
  });
});
