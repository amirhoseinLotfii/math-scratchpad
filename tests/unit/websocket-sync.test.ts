import { describe, expect, it, vi } from 'vitest';
import { WS_SYNC_PROTOCOL } from '../../shared/contracts/ws-sync';
import type { LearnEvent } from '../../src/sync/events';
import { WebSocketSyncClient, type WebSocketLike } from '../../src/sync/websocket-sync';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const EVENT = {
  id: '22222222-2222-4222-8222-222222222222',
  schema: 1,
  ts: '2026-11-15T10:00:00.000Z',
  deviceId: DEVICE_ID,
  bankVersion: 'v1',
  session: 'session-1',
  chapter: 1,
  lesson: '1.1',
  section: '1.1',
  concept: 'fractions',
  type: 'lesson_open',
} as LearnEvent;

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = 3;
    this.onclose?.();
  });
  send = vi.fn((data: string) => {
    if (this.readyState !== 1) throw new Error('socket_not_open');
    this.sent.push(data);
  });
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  failBeforeOpen() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function ticketResponse() {
  return Response.json({ ticket: 'ticket-for-tests', expiresAt: Date.now() + 60_000 }, { status: 201 });
}

describe('WebSocketSyncClient', () => {
  it('requests a device-bound ticket, handshakes, drains queued events/state, and handles server messages', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ticketResponse());
    const socket = new FakeSocket();
    const events: Array<{ seq: number; event: LearnEvent }> = [];
    const acks: string[][] = [];
    const client = new WebSocketSyncClient({
      apiOrigin: 'https://sync.example/',
      token: 'mss1.session',
      deviceId: DEVICE_ID,
      epoch: 'epoch-1',
      cursor: 3,
      stateRevision: 2,
      appSha: 'sha-1',
      fetcher,
      socketFactory: vi.fn(() => socket),
      onEvents: (incoming) => events.push(...incoming),
      onAck: (ids) => acks.push(ids),
    });

    client.queueEvents([EVENT]);
    client.putState('math-scratchpad-session-v3', 'value', 2);
    const connecting = client.connect();
    expect(client.getStatus()).toBe('ticketing');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ deviceId: DEVICE_ID });
    await vi.waitFor(() => expect(socket.onopen).not.toBeNull());
    socket.open();
    await connecting;
    expect(JSON.parse(socket.sent[0])).toMatchObject({ protocol: WS_SYNC_PROTOCOL, type: 'hello', cursor: 3 });
    expect(socket.sent).toHaveLength(1);

    socket.receive({ protocol: WS_SYNC_PROTOCOL, type: 'welcome', serverCursor: 4, epoch: 'epoch-1', resetStatus: 'ready' });
    expect(client.getStatus()).toBe('ready');
    expect(socket.sent.map((value) => JSON.parse(value).type)).toEqual(['hello', 'events.push', 'state.put']);

    socket.receive({ protocol: WS_SYNC_PROTOCOL, type: 'events', from: 5, to: 5, events: [{ seq: 5, event: EVENT }] });
    socket.receive({ protocol: WS_SYNC_PROTOCOL, type: 'ack', eventIds: [EVENT.id], seq: 5 });
    expect(events).toHaveLength(1);
    expect(acks).toEqual([[EVENT.id]]);
    expect(client.getCursor()).toBe(5);
  });

  it('keeps only the latest pending state value while offline and falls back after three failed reconnects', async () => {
    const timers: Array<() => void> = [];
    const sockets: FakeSocket[] = [];
    const fallback = vi.fn();
    const client = new WebSocketSyncClient({
      apiOrigin: 'https://sync.example',
      token: 'mss1.session',
      deviceId: DEVICE_ID,
      epoch: 'epoch-1',
      cursor: 0,
      stateRevision: 0,
      appSha: 'sha-1',
      fetcher: async (_input: RequestInfo | URL, _init?: RequestInit) => ticketResponse(),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      scheduleTimeout: ((callback: () => void) => {
        timers.push(callback);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      cancelTimeout: (() => undefined) as typeof clearTimeout,
      onFallback: fallback,
      random: () => 0,
    });

    client.putState('math-scratchpad-session-v3', 'first', 0);
    client.putState('math-scratchpad-session-v3', 'last', 1);
    const first = client.connect();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].failBeforeOpen();
    await expect(first).rejects.toThrow('websocket_closed_before_open');
    expect(client.getStatus()).toBe('reconnecting');

    timers.shift()?.();
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].failBeforeOpen();
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers.shift()?.();
    await vi.waitFor(() => expect(sockets).toHaveLength(3));
    sockets[2].failBeforeOpen();
    await vi.waitFor(() => expect(fallback).toHaveBeenCalledWith('websocket_closed_before_open'));
    expect(client.getStatus()).toBe('fallback');
  });

  it('does not send malformed server messages or non-retryable errors into the application', async () => {
    const socket = new FakeSocket();
    const reset = vi.fn();
    const fallback = vi.fn();
    const client = new WebSocketSyncClient({
      apiOrigin: 'https://sync.example',
      token: 'mss1.session',
      deviceId: DEVICE_ID,
      epoch: 'epoch-1',
      cursor: 0,
      stateRevision: 0,
      appSha: 'sha-1',
      fetcher: async (_input: RequestInfo | URL, _init?: RequestInit) => ticketResponse(),
      socketFactory: () => socket,
      onReset: reset,
      onFallback: fallback,
    });
    const connecting = client.connect();
    await vi.waitFor(() => expect(socket.onopen).not.toBeNull());
    socket.open();
    await connecting;
    socket.receive({ protocol: WS_SYNC_PROTOCOL, type: 'welcome', serverCursor: 0, epoch: 'epoch-1', resetStatus: 'ready' });
    socket.onmessage?.({ data: '{broken' });
    expect(reset).not.toHaveBeenCalled();
    socket.receive({ protocol: WS_SYNC_PROTOCOL, type: 'error', code: 'bad_request', retryable: false });
    expect(fallback).toHaveBeenCalledWith('bad_request');
    expect(client.getStatus()).toBe('closed');
  });

  it('schedules a bounded reconnect after a ticket endpoint failure', async () => {
    const timers: Array<() => void> = [];
    const fallback = vi.fn();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new TypeError('offline');
    });
    const client = new WebSocketSyncClient({
      apiOrigin: 'https://sync.example',
      token: 'mss1.session',
      deviceId: DEVICE_ID,
      epoch: 'epoch-1',
      cursor: 0,
      stateRevision: 0,
      appSha: 'sha-1',
      fetcher,
      scheduleTimeout: ((callback: () => void) => {
        timers.push(callback);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      cancelTimeout: (() => undefined) as typeof clearTimeout,
      onFallback: fallback,
      random: () => 0,
    });

    const first = client.connect();
    await expect(first).rejects.toThrow('offline');
    await vi.waitFor(() => expect(timers.length).toBeGreaterThan(0));
    timers.shift()?.();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(client.getStatus()).toBe('reconnecting'));
    expect(fallback).not.toHaveBeenCalled();
    client.close();
  });
});
