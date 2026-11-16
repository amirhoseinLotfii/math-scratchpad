import { readBoundedBody } from '../body';
import { MAX_ACTIVE_SESSIONS, SESSION_HASH_PATTERN, SESSION_TTL_MS } from '../session';
import { json } from './response';

export type StoredSession = { email: string; sub: string; expiresAt: number };

export function readValidSession(storage: DurableObjectStorage, tokenHash: string, now = Date.now()): StoredSession | undefined {
  const row = storage.sql
    .exec<{
      email: string;
      sub: string;
      expires_at: number;
      revoked_at: number | null;
    }>('SELECT email, sub, expires_at, revoked_at FROM auth_sessions WHERE token_hash = ?', tokenHash)
    .toArray()[0];
  if (!row || row.revoked_at !== null || Number(row.expires_at) <= now) return undefined;
  return { email: row.email, sub: row.sub, expiresAt: Number(row.expires_at) };
}

/** Internal session bookkeeping; reachable only through the Worker's stub, never from the public router. */
export async function handleSession(
  storage: DurableObjectStorage,
  consumeRateLimit: () => Response | null,
  pathname: string,
  request: Request,
): Promise<Response> {
  const body = await readBoundedBody(request, 4_096);
  if (!body) return json({ error: 'payload_too_large' }, 413);
  let input: { tokenHash?: unknown; email?: unknown; sub?: unknown; all?: unknown };
  try {
    input = JSON.parse(new TextDecoder().decode(body)) ?? {};
  } catch {
    return json({ error: 'invalid_session_request' }, 400);
  }
  const now = Date.now();
  const tokenHash = typeof input.tokenHash === 'string' && SESSION_HASH_PATTERN.test(input.tokenHash) ? input.tokenHash : undefined;

  if (pathname === '/internal/session/issue') {
    const rate = consumeRateLimit();
    if (rate) return rate;
    if (
      !tokenHash ||
      typeof input.email !== 'string' ||
      !input.email ||
      input.email.length > 320 ||
      typeof input.sub !== 'string' ||
      !input.sub ||
      input.sub.length > 255
    ) {
      return json({ error: 'invalid_session_request' }, 400);
    }
    const expiresAt = now + SESSION_TTL_MS;
    storage.transactionSync(() => {
      storage.sql.exec(
        'DELETE FROM auth_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)',
        now,
        now - SESSION_TTL_MS,
      );
      storage.sql.exec(
        'INSERT INTO auth_sessions (token_hash, email, sub, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)',
        tokenHash,
        input.email,
        input.sub,
        now,
        expiresAt,
      );
      storage.sql.exec(
        `UPDATE auth_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND token_hash NOT IN (
           SELECT token_hash FROM auth_sessions WHERE revoked_at IS NULL ORDER BY created_at DESC, token_hash LIMIT ?)`,
        now,
        MAX_ACTIVE_SESSIONS,
      );
    });
    return json({ expiresAt }, 201);
  }

  if (pathname === '/internal/session/verify') {
    if (!tokenHash) return json({ error: 'session_invalid' }, 401);
    const session = readValidSession(storage, tokenHash, now);
    if (!session) return json({ error: 'session_invalid' }, 401);
    return json({ email: session.email, sub: session.sub, expiresAt: session.expiresAt });
  }

  if (pathname === '/internal/session/revoke') {
    const rate = consumeRateLimit();
    if (rate) return rate;
    if (input.all === true) {
      const revoked = storage.sql.exec('UPDATE auth_sessions SET revoked_at = ? WHERE revoked_at IS NULL', now).rowsWritten;
      return json({ revoked });
    }
    if (!tokenHash) return json({ error: 'invalid_session_request' }, 400);
    const revoked = storage.sql.exec(
      'UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
      now,
      tokenHash,
    ).rowsWritten;
    return json({ revoked });
  }
  return json({ error: 'not_found' }, 404);
}
