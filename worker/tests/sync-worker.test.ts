import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env, reset } from 'cloudflare:test';
import { generateKeyPair, SignJWT } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { verifyGoogleIdToken } from '../src/auth';
import { createApp, type IdTokenVerifier } from '../src/index';
import type { GoogleIdentity, WorkerEnv } from '../src/env';

const OWNER_EMAIL = 'amirhoseinlotfalizadeprogramer@gmail.com';
const CLIENT_ID = 'test-google-client.apps.googleusercontent.com';
const ALLOWED_ORIGIN = 'https://amirhoseinlotfii.github.io';
const OWNER: GoogleIdentity = { sub: 'google-subject-for-test', email: OWNER_EMAIL, email_verified: true };
const testEnv = env as unknown as WorkerEnv;

const validVerifier: IdTokenVerifier = async token => {
  if (token !== 'valid-test-token') throw new Error('Invalid test token.');
  return OWNER;
};

function makeEvent(id = crypto.randomUUID()) {
  return {
    id,
    schema: 1,
    ts: new Date().toISOString(),
    deviceId: crypto.randomUUID(),
    bankVersion: 'v21',
    session: 'test-session',
    chapter: 1,
    lesson: '1.1',
    section: '1.1',
    concept: 'relations',
    type: 'lesson_open',
  };
}

function call(
  app: ReturnType<typeof createApp>,
  path: string,
  options: { method?: string; token?: string; origin?: string; body?: unknown; extraHeaders?: Record<string, string> } = {},
) {
  const headers = new Headers(options.extraHeaders);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.origin) headers.set('Origin', options.origin);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return app.fetch(new Request(`https://worker.test${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  }), testEnv);
}

describe('Google ID token verification', () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;
  let resolver: JWTVerifyGetKey;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair('RS256'));
    resolver = async () => publicKey;
  });

  async function token(claims: Record<string, unknown> = {}, options: { audience?: string | string[]; issuer?: string; expires?: string | number } = {}) {
    return new SignJWT({ email: OWNER_EMAIL, email_verified: true, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(options.issuer ?? 'https://accounts.google.com')
      .setAudience(options.audience ?? CLIENT_ID)
      .setSubject('google-subject-for-test')
      .setIssuedAt()
      .setExpirationTime(options.expires ?? '2m')
      .sign(privateKey);
  }

  it('accepts an RS256 token from Google with the configured audience and verified identity', async () => {
    const identity = await verifyGoogleIdToken(await token(), CLIENT_ID, resolver);
    expect(identity).toEqual(OWNER);
  });

  it.each([
    ['wrong audience', { audience: 'another-client.apps.googleusercontent.com' }],
    ['missing authorized party for multiple audiences', { audience: [CLIENT_ID, 'another-client.apps.googleusercontent.com'] }],
    ['wrong issuer', { issuer: 'https://attacker.example' }],
    ['expired token', { expires: 946684800 }],
  ])('rejects a token with %s', async (_reason, options) => {
    await expect(verifyGoogleIdToken(await token({}, options), CLIENT_ID, resolver)).rejects.toThrow();
  });

  it('rejects a token without Google verified-email claims', async () => {
    await expect(verifyGoogleIdToken(await token({ email_verified: false }), CLIENT_ID, resolver)).rejects.toThrow();
  });

  it('rejects a token with a bad signature', async () => {
    const otherPair = await generateKeyPair('RS256');
    const forged = await new SignJWT({ email: OWNER_EMAIL, email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject('google-subject-for-test')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(otherPair.privateKey);
    await expect(verifyGoogleIdToken(forged, CLIENT_ID, resolver)).rejects.toThrow();
  });
});

describe('Math Scratchpad sync Worker API and SQLite Durable Object', () => {
  afterEach(async () => reset());

  it('serves health and exact-origin CORS preflight; rejects other origins', async () => {
    const app = createApp(validVerifier);
    const health = await call(app, '/health', { origin: ALLOWED_ORIGIN });
    expect(health.status).toBe(200);
    expect(health.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(health.headers.get('Cache-Control')).toBe('no-store');
    const apiResponse = await call(app, '/sync', { token: 'valid-test-token', origin: ALLOWED_ORIGIN });
    expect(apiResponse.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);

    const preflight = await call(app, '/events', {
      method: 'OPTIONS', origin: ALLOWED_ORIGIN,
      extraHeaders: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);

    const foreign = await call(app, '/health', { origin: 'https://example.com' });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.has('Access-Control-Allow-Origin')).toBe(false);
    const badPreflight = await call(app, '/events', { method: 'OPTIONS', origin: 'https://example.com' });
    expect(badPreflight.status).toBe(403);
  });

  it('requires a bearer ID token and the one configured owner email', async () => {
    const app = createApp(async token => {
      if (token === 'valid-test-token') return OWNER;
      if (token === 'other-owner-token') return { ...OWNER, email: 'other@example.com' };
      throw new Error('invalid token');
    });
    expect((await call(app, '/sync')).status).toBe(401);
    expect((await call(app, '/sync', { token: 'bad-token' })).status).toBe(401);
    expect((await call(app, '/sync', { token: 'other-owner-token' })).status).toBe(401);
    expect((await call(app, '/sync', { token: 'valid-test-token' })).status).toBe(200);
    const corsAuthFailure = await call(app, '/sync', { token: 'bad-token', origin: ALLOWED_ORIGIN });
    expect(corsAuthFailure.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  it('validates the event schema before writing', async () => {
    const app = createApp(validVerifier);
    const response = await call(app, '/events', { token: 'valid-test-token', body: { events: [{ id: 'bad' }] } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_event' });
    const snapshot = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect(await snapshot.json()).toMatchObject({ events: [], cursor: 0, through: 0 });
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
    const firstResult = await first.json() as { events: { id: string; seq: number; duplicate: boolean }[] };
    expect(first.status).toBe(200);
    expect(firstResult.events[0]).toMatchObject({ id: event.id, seq: 1, duplicate: false });

    const reorderedEvent = Object.fromEntries(Object.entries(event).reverse());
    const reorderedRetry = await call(app, '/events', { token: 'valid-test-token', body: { events: [reorderedEvent] } });
    expect(await reorderedRetry.json()).toMatchObject({ events: [{ seq: 1, duplicate: true }] });

    const retry = await call(app, '/events', { token: 'valid-test-token', body: { events: [event] } });
    const retryResult = await retry.json() as { events: { seq: number; duplicate: boolean }[] };
    expect(retryResult.events[0]).toMatchObject({ seq: 1, duplicate: true });

    const reusedId = { ...event, note: 'different content' };
    const conflict = await call(app, '/events', { token: 'valid-test-token', body: { events: [reusedId] } });
    expect(conflict.status).toBe(409);
    const snapshot = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect((await snapshot.json() as { events: unknown[] }).events).toHaveLength(1);
  });

  it('keeps a conflicting batch atomic', async () => {
    const app = createApp(validVerifier);
    const first = makeEvent();
    const stored = await call(app, '/events', { token: 'valid-test-token', body: { events: [first] } });
    expect(stored.status).toBe(200);

    const second = makeEvent();
    const conflict = await call(app, '/events', {
      token: 'valid-test-token', body: { events: [second, { ...first, note: 'conflicting copy' }] },
    });
    expect(conflict.status).toBe(409);
    const afterConflict = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect((await afterConflict.json() as { events: unknown[] }).events).toHaveLength(1);
  });

  it('supports paged sync and a stable snapshot cursor', async () => {
    const app = createApp(validVerifier);
    const first = makeEvent();
    const second = makeEvent();
    const third = makeEvent();
    expect((await call(app, '/events', { token: 'valid-test-token', body: { events: [first, second, third] } })).status).toBe(200);

    const page1 = await call(app, '/sync?cursor=0&limit=2', { token: 'valid-test-token' });
    const page1Body = await page1.json() as { events: StoredEventForTest[]; cursor: number; through: number; hasMore: boolean };
    expect(page1Body.events.map(item => item.seq)).toEqual([1, 2]);
    expect(page1Body).toMatchObject({ cursor: 2, through: 3, hasMore: true });
    const page2 = await call(app, `/sync?cursor=${page1Body.cursor}&through=${page1Body.through}&limit=2`, { token: 'valid-test-token' });
    expect(await page2.json()).toMatchObject({ events: [{ seq: 3 }], cursor: 3, through: 3, hasMore: false });

    const snapshot1 = await call(app, '/snapshot?limit=2', { token: 'valid-test-token' });
    const snapshotBody = await snapshot1.json() as { events: unknown[]; cursor: number; snapshotCursor: number };
    expect(snapshotBody).toMatchObject({ cursor: 2, snapshotCursor: 3 });
    const snapshot2 = await call(app, `/snapshot?cursor=${snapshotBody.cursor}&through=${snapshotBody.snapshotCursor}&limit=2`, { token: 'valid-test-token' });
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
