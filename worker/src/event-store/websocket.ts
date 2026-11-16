import {
  WS_SYNC_PROTOCOL,
  encodeWsServerMessage,
  parseWsClientMessage,
  type WsClientMessage,
  type WsServerMessage,
} from '../../../shared/contracts/ws-sync';
import { hashSessionToken } from '../session';
import type { WorkerEnv } from '../env';
import { readValidSession } from './session-service';
import { readEventsAfter, maxSequence } from './event-repository';
import { readAppStateRecord } from './state-repository';
import { consumeWebSocketTicket, isValidWebSocketDeviceId, isValidWebSocketTicket, type WebSocketTicket } from './websocket-ticket';

export type WebSocketAttachment = WebSocketTicket & {
  hello: boolean;
  cursor: number;
  stateRevision: number;
  epoch: string;
  connectedAt: number;
};

export type WebSocketStorePorts = {
  ctx: DurableObjectState;
  env: WorkerEnv;
  appendEvents: (request: Request) => Promise<Response>;
  writeState: (request: Request) => Promise<Response>;
  requiredEpoch: () => string | null;
  resetLocked: () => boolean;
};

function send(socket: WebSocket, message: WsServerMessage): void {
  try {
    socket.send(encodeWsServerMessage(message));
  } catch {
    socket.close(1011, 'socket_send_failed');
  }
}

function error(socket: WebSocket, code: string, retryable: boolean): void {
  send(socket, { protocol: WS_SYNC_PROTOCOL, type: 'error', code, retryable });
}

function attachment(socket: WebSocket): WebSocketAttachment | undefined {
  const value = socket.deserializeAttachment();
  if (!value || typeof value !== 'object') return undefined;
  return value as WebSocketAttachment;
}

function updateAttachment(socket: WebSocket, value: WebSocketAttachment): void {
  socket.serializeAttachment(value);
}

function broadcast(ctx: DurableObjectState, sender: WebSocket, message: WsServerMessage): void {
  const encoded = encodeWsServerMessage(message);
  for (const socket of ctx.getWebSockets()) {
    if (socket === sender || socket.readyState !== WebSocket.OPEN) continue;
    try {
      socket.send(encoded);
    } catch {
      socket.close(1011, 'socket_send_failed');
    }
  }
}

function resetMessage(ports: WebSocketStorePorts, socket: WebSocket): void {
  send(socket, {
    protocol: WS_SYNC_PROTOCOL,
    type: 'reset',
    status: ports.resetLocked() ? 'learning_reset_in_progress' : 'client_update_required',
    epoch: ports.requiredEpoch(),
  });
}

function sessionIsValid(ports: WebSocketStorePorts, sessionHash: string): boolean {
  const session = readValidSession(ports.ctx.storage, sessionHash);
  return !!session && session.email.trim().toLowerCase() === (ports.env.OWNER_EMAIL ?? '').trim().toLowerCase();
}

async function replayEvents(ports: WebSocketStorePorts, socket: WebSocket, cursor: number): Promise<void> {
  const through = await maxSequence(ports.ctx.storage);
  if (cursor > through) {
    error(socket, 'invalid_cursor', false);
    return;
  }
  let next = cursor;
  while (next < through) {
    const events = readEventsAfter(ports.ctx.storage, next, through, 100);
    if (!events.length) break;
    send(socket, { protocol: WS_SYNC_PROTOCOL, type: 'events', from: events[0].seq, to: events.at(-1)!.seq, events });
    next = events.at(-1)!.seq;
  }
}

async function handleHello(
  ports: WebSocketStorePorts,
  socket: WebSocket,
  message: Extract<WsClientMessage, { type: 'hello' }>,
): Promise<void> {
  const current = attachment(socket);
  if (!current || message.deviceId !== current.deviceId || !sessionIsValid(ports, current.sessionHash)) {
    socket.close(4401, 'session_invalid');
    return;
  }
  const requiredEpoch = ports.requiredEpoch();
  if (ports.resetLocked() || (requiredEpoch && message.epoch !== requiredEpoch)) {
    resetMessage(ports, socket);
    return;
  }
  const next = { ...current, hello: true, cursor: message.cursor, stateRevision: message.stateRevision, epoch: message.epoch };
  updateAttachment(socket, next);
  send(socket, {
    protocol: WS_SYNC_PROTOCOL,
    type: 'welcome',
    serverCursor: await maxSequence(ports.ctx.storage),
    epoch: requiredEpoch,
    resetStatus: ports.resetLocked() ? 'locked' : 'ready',
  });
  await replayEvents(ports, socket, message.cursor);
}

async function handleEventsPush(
  ports: WebSocketStorePorts,
  socket: WebSocket,
  current: WebSocketAttachment,
  message: Extract<WsClientMessage, { type: 'events.push' }>,
): Promise<void> {
  if (ports.resetLocked() || (ports.requiredEpoch() && current.epoch !== ports.requiredEpoch())) {
    resetMessage(ports, socket);
    return;
  }
  const response = await ports.appendEvents(
    new Request('https://event-store.internal/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: message.events }),
    }),
  );
  const body = (await response.json().catch(() => null)) as { events?: Array<{ id?: unknown; seq?: unknown }>; cursor?: unknown } | null;
  if (!response.ok || !body || !Array.isArray(body.events) || !Number.isSafeInteger(body.cursor)) {
    error(socket, response.status === 503 ? 'learning_reset_in_progress' : 'events_rejected', response.status >= 500);
    return;
  }
  const rows = body.events.filter((row): row is { id: string; seq: number } => typeof row.id === 'string' && Number.isSafeInteger(row.seq));
  const byId = new Map(message.events.map((event) => [event.id, event]));
  const delivered = rows.flatMap((row) => {
    const event = byId.get(row.id);
    return event ? [{ seq: row.seq, event }] : [];
  });
  updateAttachment(socket, { ...current, cursor: Math.max(current.cursor, Number(body.cursor)) });
  send(socket, { protocol: WS_SYNC_PROTOCOL, type: 'ack', eventIds: rows.map((row) => row.id), seq: Number(body.cursor) });
  if (delivered.length) {
    broadcast(ports.ctx, socket, {
      protocol: WS_SYNC_PROTOCOL,
      type: 'events',
      from: delivered[0].seq,
      to: delivered.at(-1)!.seq,
      events: delivered,
    });
  }
}

async function handleStatePut(
  ports: WebSocketStorePorts,
  socket: WebSocket,
  current: WebSocketAttachment,
  message: Extract<WsClientMessage, { type: 'state.put' }>,
): Promise<void> {
  if (ports.resetLocked() || (ports.requiredEpoch() && current.epoch !== ports.requiredEpoch())) {
    resetMessage(ports, socket);
    return;
  }
  const response = await ports.writeState(
    new Request('https://event-store.internal/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: message.key, value: message.value, revision: message.baseRevision }),
    }),
  );
  const body = (await response.json().catch(() => null)) as { key?: unknown; revision?: unknown } | null;
  if (response.status === 409) {
    const remote = readAppStateRecord(ports.ctx.storage, message.key);
    send(socket, {
      protocol: WS_SYNC_PROTOCOL,
      type: 'state.conflict',
      key: message.key,
      localRevision: message.baseRevision,
      remote: { value: remote?.value ?? null, revision: remote?.revision ?? 0 },
    });
    return;
  }
  if (!response.ok || !body || body.key !== message.key || !Number.isSafeInteger(body.revision)) {
    error(socket, response.status === 503 ? 'learning_reset_in_progress' : 'state_rejected', response.status >= 500);
    return;
  }
  updateAttachment(socket, { ...current, stateRevision: Number(body.revision) });
  broadcast(ports.ctx, socket, {
    protocol: WS_SYNC_PROTOCOL,
    type: 'state.changed',
    key: message.key,
    value: message.value,
    revision: Number(body.revision),
    sourceDevice: current.deviceId,
  });
}

export async function openWebSocket(ports: WebSocketStorePorts, request: Request): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== ports.env.ALLOWED_ORIGIN) return Response.json({ error: 'origin_not_allowed' }, { status: 403 });
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return Response.json({ error: 'upgrade_required' }, { status: 426 });
  const url = new URL(request.url);
  const ticket = url.searchParams.get('ticket');
  const deviceId = url.searchParams.get('device');
  if (!isValidWebSocketTicket(ticket) || !isValidWebSocketDeviceId(deviceId))
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  const consumed = await consumeWebSocketTicket(ports.ctx.storage, ticket, deviceId);
  if (!consumed || !sessionIsValid(ports, consumed.sessionHash)) return Response.json({ error: 'session_invalid' }, { status: 401 });
  const pair = new WebSocketPair();
  const attachmentValue: WebSocketAttachment = {
    ...consumed,
    hello: false,
    cursor: 0,
    stateRevision: 0,
    epoch: ports.requiredEpoch() ?? '',
    connectedAt: Date.now(),
  };
  pair[1].serializeAttachment(attachmentValue);
  ports.ctx.acceptWebSocket(pair[1], [deviceId]);
  ports.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('keepalive', 'keepalive'));
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export async function handleWebSocketMessage(ports: WebSocketStorePorts, socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
  const parsed = parseWsClientMessage(message);
  if (!parsed) {
    error(socket, 'invalid_message', false);
    return;
  }
  if (parsed.type === 'hello') return handleHello(ports, socket, parsed);
  const current = attachment(socket);
  if (!current || !current.hello || !sessionIsValid(ports, current.sessionHash)) {
    socket.close(4401, 'session_invalid');
    return;
  }
  if (parsed.type === 'ping') {
    send(socket, { protocol: WS_SYNC_PROTOCOL, type: 'pong' });
    return;
  }
  if (parsed.type === 'events.push') return handleEventsPush(ports, socket, current, parsed);
  return handleStatePut(ports, socket, current, parsed);
}

export function closeWebSocketsForSession(ctx: DurableObjectState, sessionHash?: string): number {
  let closed = 0;
  for (const socket of ctx.getWebSockets()) {
    const current = attachment(socket);
    if (!sessionHash || current?.sessionHash === sessionHash) {
      socket.close(4401, 'session_revoked');
      closed += 1;
    }
  }
  return closed;
}

export function revalidateWebSockets(ports: WebSocketStorePorts): void {
  for (const socket of ports.ctx.getWebSockets()) {
    const current = attachment(socket);
    if (!current || !sessionIsValid(ports, current.sessionHash)) socket.close(4401, 'session_invalid');
  }
}

export function socketSessionHash(socket: WebSocket): string | undefined {
  return attachment(socket)?.sessionHash;
}
