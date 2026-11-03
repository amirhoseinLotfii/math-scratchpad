import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { verifyGoogleIdToken } from './auth';
import { readBoundedBody } from './body';
import type { GoogleIdentity, WorkerEnv } from './env';

const MAX_BODY_BYTES = 250_000;
const PAGES_ORIGIN = 'https://amirhoseinlotfii.github.io';

export type IdTokenVerifier = (token: string, clientId: string) => Promise<GoogleIdentity>;
type AppEnv = { Bindings: WorkerEnv; Variables: { identity: GoogleIdentity } };
type AppContext = Context<AppEnv>;

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
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
  const allowed = new Set(['authorization', 'content-type']);
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
      c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      c.header('Access-Control-Max-Age', '86400');
      c.header('Vary', 'Origin');
      return c.body(null, 204);
    }

    await next();
  });

  app.get('/health', c => finalizeResponse(c.json({ ok: true, service: 'math-scratchpad-sync' }), c));

  const authorize = async (c: AppContext, next: Next) => {
    const header = c.req.header('Authorization');
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match || match[1].length > 10_000) return finalizeResponse(jsonError('unauthorized', 401), c);
    try {
      const identity = await verifyToken(match[1], c.env.GOOGLE_CLIENT_ID);
      if (identity.email_verified !== true
        || identity.email.trim().toLowerCase() !== c.env.OWNER_EMAIL.trim().toLowerCase()) {
        return finalizeResponse(jsonError('unauthorized', 401), c);
      }
      c.set('identity', identity);
      await next();
    } catch {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
  };

  const proxy = async (c: AppContext, path: string, method: 'GET' | 'POST', expectsBody = method === 'POST') => {
    let body: ArrayBuffer | undefined;
    if (expectsBody) {
      const declaredLength = Number(c.req.header('Content-Length') ?? 0);
      if (declaredLength > MAX_BODY_BYTES) return finalizeResponse(jsonError('payload_too_large', 413), c);
      body = await readBoundedBody(c.req.raw, MAX_BODY_BYTES) ?? undefined;
      if (!body) return finalizeResponse(jsonError('payload_too_large', 413), c);
    }

    const identity = c.get('identity');
    const id = c.env.EVENT_STORE.idFromName(identity.email.trim().toLowerCase());
    const stub = c.env.EVENT_STORE.get(id);
    const incomingUrl = new URL(c.req.url);
    const target = new URL(`${path}${incomingUrl.search}`, 'https://event-store.internal');
    const headers = new Headers();
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await stub.fetch(new Request(target, { method, headers, ...(body !== undefined ? { body } : {}) }));
    return finalizeResponse(response, c);
  };

  app.post('/events', authorize, c => proxy(c, '/events', 'POST'));
  app.get('/state', authorize, c => proxy(c, '/state', 'GET'));
  app.post('/state', authorize, c => proxy(c, '/state', 'POST'));
  app.get('/sync', authorize, c => proxy(c, '/sync', 'GET'));
  app.get('/snapshot', authorize, c => proxy(c, '/snapshot', 'GET'));
  app.get('/drive/status', authorize, c => proxy(c, '/drive/status', 'GET'));
  app.post('/drive/sync', authorize, c => proxy(c, '/drive/sync', 'POST', false));
  app.get('/notion/status', authorize, c => proxy(c, '/notion/status', 'GET'));
  app.post('/notion/sync', authorize, c => proxy(c, '/notion/sync', 'POST', false));

  app.notFound(c => finalizeResponse(jsonError('not_found', 404), c));
  app.onError((_error, c) => finalizeResponse(jsonError('internal_error', 500), c));
  return app;
}

const app = createApp();

export async function requestMirrorSync(env: Pick<WorkerEnv, 'EVENT_STORE' | 'OWNER_EMAIL'>): Promise<void> {
  const id = env.EVENT_STORE.idFromName(env.OWNER_EMAIL.trim().toLowerCase());
  const response = await env.EVENT_STORE.get(id).fetch(new Request('https://event-store.internal/internal/sync-all', { method: 'POST' }));
  if (!response.ok) throw new Error('scheduled_mirror_sync_failed');
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
