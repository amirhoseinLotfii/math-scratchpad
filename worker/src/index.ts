import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { verifyGoogleIdToken } from './auth';
import { readBoundedBody } from './body';
import type { GoogleIdentity, WorkerEnv } from './env';
import { generateSessionToken, hashSessionToken, isSessionToken, isWellFormedSessionToken } from './session';
import { isValidLearningResetEpoch, LEARNING_RESET_EPOCH_HEADER } from '../../src/sync/learning-reset-epoch';

const MAX_BODY_BYTES = 250_000;
const MAX_STATE_BODY_BYTES = 2_100_000;
const PAGES_ORIGIN = 'https://amirhoseinlotfii.github.io';

export type IdTokenVerifier = (token: string, clientId: string) => Promise<GoogleIdentity>;
type AuthKind = 'google' | 'session';
type AppEnv = { Bindings: WorkerEnv; Variables: { identity: GoogleIdentity; authKind: AuthKind; sessionHash?: string } };
type AppContext = Context<AppEnv>;

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function safeMirrorError(value: unknown): string {
  const allowed = new Set([
    'not_configured', 'reauthorization_required', 'account_mismatch', 'permission_denied',
    'quota_exceeded', 'etag_conflict', 'invalid_response', 'duplicate_file',
    'subrequest_budget_exceeded', 'network_error', 'token_invalid', 'database_not_shared',
    'schema_mismatch', 'rate_limited', 'remote_error',
  ]);
  return typeof value === 'string' && allowed.has(value) ? value : 'unknown';
}

function safeMirrorStage(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9_]{1,80}$/.test(value) ? value : 'unknown';
}

function constantTimeSecretEqual(candidate: string, expected: string): boolean {
  const left = new TextEncoder().encode(candidate);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function finalizeResponse(response: Response, c: AppContext): Response {
  const headers = new Headers(response.headers);
  const origin = c.req.header('Origin');
  const allowedOrigin = c.env.ALLOWED_ORIGIN || PAGES_ORIGIN;
  headers.set('Cache-Control', 'no-store');
  if (origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    const vary = new Set((headers.get('Vary') ?? '').split(',').map(value => value.trim()).filter(Boolean));
    vary.add('Origin');
    headers.set('Vary', [...vary].join(', '));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function requestedHeadersAreAllowed(value: string | null): boolean {
  if (!value) return true;
  const allowed = new Set(['authorization', 'content-type', 'idempotency-key', LEARNING_RESET_EPOCH_HEADER.toLowerCase()]);
  return value.split(',').every(header => allowed.has(header.trim().toLowerCase()));
}

/** App factory keeps route tests deterministic; the exported production app always verifies Google JWTs. */
export function createApp(verifyToken: IdTokenVerifier = verifyGoogleIdToken) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    const allowedOrigin = c.env.ALLOWED_ORIGIN || PAGES_ORIGIN;
    if (origin && origin !== allowedOrigin) return jsonError('origin_not_allowed', 403);

    if (c.req.method === 'OPTIONS') {
      if (origin !== allowedOrigin
        || !requestedHeadersAreAllowed(c.req.header('Access-Control-Request-Headers') ?? null)) {
        return jsonError('origin_not_allowed', 403);
      }
      const requestedMethod = c.req.header('Access-Control-Request-Method');
      if (requestedMethod && !['GET', 'POST'].includes(requestedMethod.toUpperCase())) {
        return jsonError('method_not_allowed', 405);
      }
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      c.header('Access-Control-Allow-Headers', `Authorization, Content-Type, Idempotency-Key, ${LEARNING_RESET_EPOCH_HEADER}`);
      c.header('Access-Control-Max-Age', '86400');
      c.header('Vary', 'Origin');
      return c.body(null, 204);
    }

    await next();
  });

  app.get('/health', c => finalizeResponse(c.json({
    ok: true,
    service: 'math-scratchpad-sync',
    env: c.env.RELEASE_ENV ?? 'production',
    sha: c.env.RELEASE_SHA ?? null,
  }), c));

  const ownerStub = (env: WorkerEnv) => env.EVENT_STORE.get(env.EVENT_STORE.idFromName(env.OWNER_EMAIL.trim().toLowerCase()));

  app.get('/reset/status', async c => finalizeResponse(
    await ownerStub(c.env).fetch('https://event-store.internal/internal/learning-reset/client-status'), c,
  ));

  const internalJson = (path: string, body: unknown, env: WorkerEnv) => ownerStub(env).fetch(new Request(
    `https://event-store.internal${path}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  ));

  const isOwner = (identity: GoogleIdentity, env: WorkerEnv) => identity.email_verified === true
    && !!env.OWNER_EMAIL.trim()
    && identity.email.trim().toLowerCase() === env.OWNER_EMAIL.trim().toLowerCase();

  const bearer = (c: AppContext): string | undefined => {
    const match = c.req.header('Authorization')?.match(/^Bearer ([^\s]+)$/i);
    return match && match[1].length <= 10_000 ? match[1] : undefined;
  };

  /** Accepts a fresh Google ID token, or a Worker session that was minted from one. */
  const authorizeWith = (allowSession: boolean) => async (c: AppContext, next: Next) => {
    const token = bearer(c);
    if (!token) return finalizeResponse(jsonError('unauthorized', 401), c);
    try {
      if (isSessionToken(token)) {
        if (!allowSession || !isWellFormedSessionToken(token)) return finalizeResponse(jsonError('unauthorized', 401), c);
        const tokenHash = await hashSessionToken(token);
        const verified = await internalJson('/internal/session/verify', { tokenHash }, c.env);
        if (!verified.ok) return finalizeResponse(jsonError(verified.status === 401 ? 'session_invalid' : 'unauthorized', 401), c);
        const record = await verified.json() as { email?: unknown; sub?: unknown };
        if (typeof record.email !== 'string' || typeof record.sub !== 'string') return finalizeResponse(jsonError('unauthorized', 401), c);
        const identity: GoogleIdentity = { sub: record.sub, email: record.email, email_verified: true };
        // Re-check the configured owner on every request so changing OWNER_EMAIL invalidates old sessions.
        if (!isOwner(identity, c.env)) return finalizeResponse(jsonError('unauthorized', 401), c);
        c.set('identity', identity);
        c.set('authKind', 'session');
        c.set('sessionHash', tokenHash);
      } else {
        const identity = await verifyToken(token, c.env.GOOGLE_CLIENT_ID);
        if (!isOwner(identity, c.env)) return finalizeResponse(jsonError('unauthorized', 401), c);
        c.set('identity', identity);
        c.set('authKind', 'google');
      }
      await next();
    } catch {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
  };
  const authorize = authorizeWith(true);
  const authorizeGoogleOnly = authorizeWith(false);

  const proxy = async (
    c: AppContext,
    path: string,
    method: 'GET' | 'POST',
    expectsBody = method === 'POST',
    maxBodyBytes = MAX_BODY_BYTES,
  ) => {
    let body: ArrayBuffer | undefined;
    if (expectsBody) {
      const declaredLength = Number(c.req.header('Content-Length') ?? 0);
      if (declaredLength > maxBodyBytes) return finalizeResponse(jsonError('payload_too_large', 413), c);
      body = await readBoundedBody(c.req.raw, maxBodyBytes) ?? undefined;
      if (!body) return finalizeResponse(jsonError('payload_too_large', 413), c);
    }

    const identity = c.get('identity');
    const id = c.env.EVENT_STORE.idFromName(identity.email.trim().toLowerCase());
    const stub = c.env.EVENT_STORE.get(id);
    const incomingUrl = new URL(c.req.url);
    const target = new URL(`${path}${incomingUrl.search}`, 'https://event-store.internal');
    const headers = new Headers();
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const clientEpoch = c.req.header(LEARNING_RESET_EPOCH_HEADER);
    if (clientEpoch) headers.set(LEARNING_RESET_EPOCH_HEADER, clientEpoch);
    const idempotencyKey = c.req.header('Idempotency-Key');
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    const response = await stub.fetch(new Request(target, { method, headers, ...(body !== undefined ? { body } : {}) }));
    return finalizeResponse(response, c);
  };

  // A session can only be minted from a verified Google ID token, never extended by another session.
  app.post('/session', authorizeGoogleOnly, async c => {
    const identity = c.get('identity');
    const sessionToken = generateSessionToken();
    const response = await internalJson('/internal/session/issue', {
      tokenHash: await hashSessionToken(sessionToken),
      email: identity.email.trim().toLowerCase(),
      sub: identity.sub,
    }, c.env);
    if (!response.ok) return finalizeResponse(response, c);
    const issued = await response.json() as { expiresAt: number };
    return finalizeResponse(Response.json({ sessionToken, expiresAt: issued.expiresAt }, { status: 201 }), c);
  });
  // Logout: revoke the presented session; `?all=1` revokes every session of the owner.
  app.post('/session/revoke', authorize, async c => {
    const all = new URL(c.req.url).searchParams.get('all') === '1';
    const tokenHash = c.get('sessionHash');
    if (!all && !tokenHash) return finalizeResponse(Response.json({ revoked: 0 }), c);
    const response = await internalJson('/internal/session/revoke', all ? { all: true } : { tokenHash }, c.env);
    return finalizeResponse(response, c);
  });

  // This destructive maintenance route is unavailable unless a temporary
  // Worker secret has been configured for the one coordinated reset.
  app.post('/admin/learning-reset', async c => {
    const token = bearer(c);
    const expected = c.env.LEARNING_RESET_TOKEN;
    if (!expected || !token || !constantTimeSecretEqual(token, expected)) {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    const declaredLength = Number(c.req.header('Content-Length') ?? 0);
    if (declaredLength > 4_096) return finalizeResponse(jsonError('payload_too_large', 413), c);
    const body = await readBoundedBody(c.req.raw, 4_096);
    if (!body) return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    let input: { confirm?: unknown; resetId?: unknown; takeover?: unknown };
    try { input = JSON.parse(new TextDecoder().decode(body)) ?? {}; }
    catch { return finalizeResponse(jsonError('invalid_reset_request', 400), c); }
    if (input.confirm !== 'DELETE_ALL_LEARNING_DATA'
      || typeof input.resetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.resetId)
      || (input.takeover !== undefined && input.takeover !== 'TAKEOVER_STUCK_LEARNING_RESET')) {
      return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    }
    const takeover = input.takeover === 'TAKEOVER_STUCK_LEARNING_RESET';
    const response = await internalJson('/internal/learning-reset', { resetId: input.resetId, takeover }, c.env);
    return finalizeResponse(response, c);
  });

  app.get('/admin/learning-reset/status', async c => {
    const token = bearer(c);
    const expected = c.env.LEARNING_RESET_TOKEN;
    if (!expected || !token || !constantTimeSecretEqual(token, expected)) {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    const response = await ownerStub(c.env).fetch('https://event-store.internal/internal/learning-reset/status');
    return finalizeResponse(response, c);
  });

  app.post('/admin/learning-reset/release', async c => {
    const token = bearer(c);
    const expected = c.env.LEARNING_RESET_TOKEN;
    if (!expected || !token || !constantTimeSecretEqual(token, expected)) {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    const declaredLength = Number(c.req.header('Content-Length') ?? 0);
    if (declaredLength > 4_096) return finalizeResponse(jsonError('payload_too_large', 413), c);
    const body = await readBoundedBody(c.req.raw, 4_096);
    if (!body) return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    let input: { confirm?: unknown; resetId?: unknown };
    try { input = JSON.parse(new TextDecoder().decode(body)) ?? {}; }
    catch { return finalizeResponse(jsonError('invalid_reset_request', 400), c); }
    if (input.confirm !== 'RELEASE_LEARNING_SYNC'
      || typeof input.resetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.resetId)) {
      return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    }
    const response = await internalJson('/internal/learning-reset/release', { resetId: input.resetId }, c.env);
    return finalizeResponse(response, c);
  });

  // pagehide uses sendBeacon with a safelisted text/plain body so a CORS preflight
  // cannot prevent the browser from queueing the request during document teardown.
  app.post('/events/beacon', async c => {
    const allowedOrigin = c.env.ALLOWED_ORIGIN || PAGES_ORIGIN;
    if (c.req.header('Origin') !== allowedOrigin) return finalizeResponse(jsonError('origin_not_allowed', 403), c);
    if (c.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/plain') {
      return finalizeResponse(jsonError('invalid_content_type', 415), c);
    }
    const declaredLength = Number(c.req.header('Content-Length') ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return finalizeResponse(jsonError('payload_too_large', 413), c);
    const raw = await readBoundedBody(c.req.raw, MAX_BODY_BYTES);
    if (!raw) return finalizeResponse(jsonError('payload_too_large', 413), c);
    let input: { sessionToken?: unknown; epoch?: unknown; events?: unknown };
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) ?? {}; }
    catch { return finalizeResponse(jsonError('invalid_beacon_payload', 400), c); }
    if (typeof input.sessionToken !== 'string' || input.sessionToken.length > 10_000
      || !isSessionToken(input.sessionToken) || !isWellFormedSessionToken(input.sessionToken)) {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    if (!isValidLearningResetEpoch(input.epoch) || !Array.isArray(input.events)
      || input.events.length < 1 || input.events.length > 50) {
      return finalizeResponse(jsonError('invalid_beacon_payload', 400), c);
    }
    const verified = await internalJson('/internal/session/verify', {
      tokenHash: await hashSessionToken(input.sessionToken),
    }, c.env);
    if (!verified.ok) return finalizeResponse(jsonError(verified.status === 401 ? 'session_invalid' : 'unauthorized', 401), c);
    const record = await verified.json() as { email?: unknown; sub?: unknown };
    if (typeof record.email !== 'string' || typeof record.sub !== 'string') {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    const identity: GoogleIdentity = { sub: record.sub, email: record.email, email_verified: true };
    if (!isOwner(identity, c.env)) return finalizeResponse(jsonError('unauthorized', 401), c);

    const id = c.env.EVENT_STORE.idFromName(identity.email.trim().toLowerCase());
    const response = await c.env.EVENT_STORE.get(id).fetch(new Request('https://event-store.internal/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [LEARNING_RESET_EPOCH_HEADER]: input.epoch },
      body: JSON.stringify({ events: input.events }),
    }));
    return finalizeResponse(response, c);
  });
  app.post('/events', authorize, c => proxy(c, '/events', 'POST'));
  app.get('/reset/epoch', authorize, c => proxy(c, '/internal/learning-reset/epoch', 'GET'));
  app.get('/reset/preview', authorize, c => proxy(c, '/reset/preview', 'GET'));
  app.get('/state', authorize, c => proxy(c, '/state', 'GET'));
  app.post('/state', authorize, c => proxy(c, '/state', 'POST', true, MAX_STATE_BODY_BYTES));
  app.get('/sync', authorize, c => proxy(c, '/sync', 'GET'));
  app.get('/snapshot', authorize, c => proxy(c, '/snapshot', 'GET'));
  app.get('/drive/status', authorize, c => proxy(c, '/drive/status', 'GET'));
  app.post('/drive/sync', authorize, c => proxy(c, '/drive/sync', 'POST', false));
  app.get('/notion/status', authorize, c => proxy(c, '/notion/status', 'GET'));
  app.post('/notion/sync', authorize, c => proxy(c, '/notion/sync', 'POST', false));
  app.post('/bank/source', authorize, c => proxy(c, '/bank/source', 'POST'));
  app.get('/bank/meta', authorize, c => proxy(c, '/bank/meta', 'GET'));
  app.get('/bank/content', authorize, c => proxy(c, '/bank/content', 'GET'));

  app.notFound(c => finalizeResponse(jsonError('not_found', 404), c));
  app.onError((_error, c) => finalizeResponse(jsonError('internal_error', 500), c));
  return app;
}

const app = createApp();

export async function requestMirrorSync(env: Pick<WorkerEnv, 'EVENT_STORE' | 'OWNER_EMAIL'>): Promise<void> {
  const id = env.EVENT_STORE.idFromName(env.OWNER_EMAIL.trim().toLowerCase());
  const response = await env.EVENT_STORE.get(id).fetch(new Request('https://event-store.internal/internal/sync-all', { method: 'POST' }));
  if (!response.ok) {
    console.warn('scheduled_mirror_sync_failed', { stage: 'durable_object_request', status: response.status });
    throw new Error('scheduled_mirror_sync_failed');
  }
  const state = await response.json() as {
    drive?: { status?: string; lastError?: unknown; failureStage?: unknown };
    notion?: { status?: string; lastError?: unknown };
    subrequestsUsed?: unknown;
    subrequestLimit?: unknown;
  };
  const failures = [
    ...(state.drive?.status === 'error' ? [{ destination: 'drive', errorCode: safeMirrorError(state.drive.lastError), stage: safeMirrorStage(state.drive.failureStage) }] : []),
    ...(state.notion?.status === 'error' ? [{ destination: 'notion', errorCode: safeMirrorError(state.notion.lastError), stage: 'notion_event_sync' }] : []),
  ];
  const used = Number.isSafeInteger(state.subrequestsUsed) ? Number(state.subrequestsUsed) : null;
  const limit = Number.isSafeInteger(state.subrequestLimit) ? Number(state.subrequestLimit) : null;
  if (failures.length) {
    console.warn('scheduled_mirror_sync_incomplete', { failures, subrequestsUsed: used, subrequestLimit: limit });
    throw new Error('scheduled_mirror_retry_incomplete');
  }
}

export async function requestWeeklyDriveBackup(
  env: Pick<WorkerEnv, 'EVENT_STORE' | 'OWNER_EMAIL'>,
  scheduledTime: number,
): Promise<void> {
  const owner = env.OWNER_EMAIL.trim().toLowerCase();
  if (!owner || !Number.isSafeInteger(scheduledTime) || scheduledTime <= 0) throw new Error('weekly_backup_request_invalid');
  const id = env.EVENT_STORE.idFromName(owner);
  const stub = env.EVENT_STORE.get(id);
  const response = await stub.fetch(new Request(`https://event-store.internal/internal/weekly-backup?scheduledTime=${scheduledTime}`, { method: 'POST' }));
  if (!response.ok) throw new Error('weekly_backup_request_failed');
}

export default {
  fetch: (request: Request, env: WorkerEnv, execution: ExecutionContext) => app.fetch(request, env, execution),
  scheduled: (controller: ScheduledController, env: WorkerEnv, execution: ExecutionContext) => {
    if (controller.cron === '*/5 * * * *') execution.waitUntil(requestMirrorSync(env));
    else execution.waitUntil(requestWeeklyDriveBackup(env, controller.scheduledTime));
  },
};
export { LearningEventStore } from './event-store';
