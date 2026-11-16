import { hashSessionToken, SESSION_HASH_PATTERN } from '../session';
import { readBoundedBody } from '../body';
import { readValidSession } from './session-service';
import { json } from './response';

const TICKET_TTL_MS = 60_000;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WebSocketTicket = {
  sessionHash: string;
  deviceId: string;
  expiresAt: number;
};

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isValidWebSocketDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value);
}

export function isValidWebSocketTicket(value: unknown): value is string {
  return typeof value === 'string' && TICKET_PATTERN.test(value);
}

export function isValidSessionHash(value: unknown): value is string {
  return typeof value === 'string' && SESSION_HASH_PATTERN.test(value);
}

export async function issueWebSocketTicket(
  storage: DurableObjectStorage,
  sessionHash: string,
  deviceId: string,
): Promise<{ ticket: string; expiresAt: number }> {
  if (!isValidSessionHash(sessionHash) || !isValidWebSocketDeviceId(deviceId)) throw new Error('invalid_websocket_ticket');
  const ticket = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const ticketHash = await hashSessionToken(ticket);
  const expiresAt = Date.now() + TICKET_TTL_MS;
  storage.sql.exec(
    'INSERT INTO ws_tickets (ticket_hash, session_hash, device_id, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)',
    ticketHash,
    sessionHash,
    deviceId,
    expiresAt,
  );
  return { ticket, expiresAt };
}

export async function consumeWebSocketTicket(
  storage: DurableObjectStorage,
  ticket: string,
  deviceId: string,
): Promise<WebSocketTicket | undefined> {
  if (!isValidWebSocketTicket(ticket) || !isValidWebSocketDeviceId(deviceId)) return undefined;
  const ticketHash = await hashSessionToken(ticket);
  const now = Date.now();
  const result = storage.transactionSync(() => {
    const row = storage.sql
      .exec<{
        session_hash: string;
        device_id: string;
        expires_at: number;
        used_at: number | null;
      }>('SELECT session_hash, device_id, expires_at, used_at FROM ws_tickets WHERE ticket_hash = ?', ticketHash)
      .toArray()[0];
    if (!row || row.used_at !== null || Number(row.expires_at) <= now || row.device_id !== deviceId) return undefined;
    storage.sql.exec('UPDATE ws_tickets SET used_at = ? WHERE ticket_hash = ?', now, ticketHash);
    return { sessionHash: row.session_hash, deviceId: row.device_id, expiresAt: Number(row.expires_at) } satisfies WebSocketTicket;
  });
  return result;
}

export function pruneWebSocketTickets(storage: DurableObjectStorage, now = Date.now()): void {
  storage.sql.exec('DELETE FROM ws_tickets WHERE expires_at <= ? OR used_at IS NOT NULL AND used_at <= ?', now, now - TICKET_TTL_MS);
}

export async function issueWebSocketTicketFromInternalRequest(storage: DurableObjectStorage, request: Request): Promise<Response> {
  const body = await readBoundedBody(request, 4_096);
  if (!body) return json({ error: 'payload_too_large' }, 413);
  let input: { sessionHash?: unknown; deviceId?: unknown };
  try {
    input = JSON.parse(new TextDecoder().decode(body)) ?? {};
  } catch {
    return json({ error: 'invalid_websocket_ticket' }, 400);
  }
  if (!isValidSessionHash(input.sessionHash) || !isValidWebSocketDeviceId(input.deviceId)) {
    return json({ error: 'invalid_websocket_ticket' }, 400);
  }
  if (!readValidSession(storage, input.sessionHash)) return json({ error: 'session_invalid' }, 401);
  return json(await issueWebSocketTicket(storage, input.sessionHash, input.deviceId), 201);
}
