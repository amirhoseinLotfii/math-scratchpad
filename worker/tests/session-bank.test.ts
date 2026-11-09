import { afterEach, describe, expect, it, vi } from 'vitest';
import { env, reset, runInDurableObject } from 'cloudflare:test';
import { GoogleDriveClient } from '../src/google-drive';
import { createApp, type IdTokenVerifier } from '../src/index';
import { SESSION_TTL_MS } from '../src/session';
import type { GoogleIdentity, WorkerEnv } from '../src/env';

const OWNER_EMAIL = 'amirhoseinlotfalizadeprogramer@gmail.com';
const OWNER: GoogleIdentity = { sub: 'google-subject-for-test', email: OWNER_EMAIL, email_verified: true };
const STRANGER: GoogleIdentity = { sub: 'someone-else', email: 'someone@example.com', email_verified: true };
const BANK_FILE_ID = 'bankFile_0123456789';
const testEnv = env as unknown as WorkerEnv;

const verifier: IdTokenVerifier = async token => {
  if (token === 'owner-id-token') return OWNER;
  if (token === 'stranger-id-token') return STRANGER;
  throw new Error('Invalid test token.');
};

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

function call(path: string, options: { method?: string; token?: string; body?: unknown; workerEnv?: WorkerEnv } = {}) {
  const app = createApp(verifier);
  const headers = new Headers();
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return app.fetch(new Request(`https://worker.test${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  }), options.workerEnv ?? testEnv);
}

async function issueSession(token = 'owner-id-token'): Promise<{ sessionToken: string; expiresAt: number }> {
  const response = await call('/session', { method: 'POST', token });
  expect(response.status).toBe(201);
  return response.json();
}

function ownerStub() {
  return testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL));
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const BANK_TEXT = JSON.stringify({ schema_version: 'math-scratchpad.bank/1.0', bank_id: 'b', version: 'v1', questions: [] });
const BANK_META = { id: BANK_FILE_ID, name: 'MATH_QUESTION_BANK.json', mimeType: 'application/json', size: String(BANK_TEXT.length), md5Checksum: 'abc', headRevisionId: 'r1', version: '7', trashed: false };

/** Fake Google endpoints for the Worker's own refresh-token credential. */
function fakeDrive(options: { status?: number } = {}) {
  const driveRequests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://oauth2.googleapis.com/token') {
      expect(new URLSearchParams(String(init.body)).get('refresh_token')).toBe('not-a-real-token');
      return jsonResponse({ access_token: 'server-access-token', expires_in: 3600 });
    }
    if (url.pathname === '/drive/v3/about') return jsonResponse({ user: { emailAddress: OWNER_EMAIL, me: true } });
    // The browser's session token must never be forwarded to Google.
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer server-access-token');
    driveRequests.push(`${url.pathname}${url.search}`);
    if (options.status) return jsonResponse({ error: { code: options.status } }, options.status);
    if (url.pathname === `/drive/v3/files/${BANK_FILE_ID}` && url.searchParams.get('alt') === 'media') return new Response(BANK_TEXT);
    if (url.pathname === `/drive/v3/files/${BANK_FILE_ID}`) return jsonResponse(BANK_META);
    return jsonResponse({ error: 'not found' }, 404);
  }) as typeof fetch;
  const client = new GoogleDriveClient({
    OWNER_EMAIL,
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_DRIVE_CLIENT_SECRET: 'not-a-real-secret',
    GOOGLE_DRIVE_REFRESH_TOKEN: 'not-a-real-token',
  } as WorkerEnv, fetcher);
  return { client, driveRequests };
}

async function injectBankClient(client: GoogleDriveClient) {
  await runInDurableObject(ownerStub(), instance => {
    (instance as unknown as { bankClient?: GoogleDriveClient }).bankClient = client;
  });
}

describe('Worker sessions', () => {
  it('issues an opaque, long-lived session after owner Google verification and accepts it on API calls', async () => {
    const before = Date.now();
    const { sessionToken, expiresAt } = await issueSession();
    expect(sessionToken).toMatch(/^mss1\.[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS - 5_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS);
    expect((await call('/drive/status', { token: sessionToken })).status).toBe(200);

    // Only a digest is stored server-side.
    await runInDurableObject(ownerStub(), (_instance, state) => {
      const rows = state.storage.sql.exec<{ token_hash: string }>('SELECT token_hash FROM auth_sessions').toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].token_hash).not.toContain(sessionToken.slice(5));
    });
  });

  it('refuses to issue sessions for other accounts, without credentials, or from another session', async () => {
    expect((await call('/session', { method: 'POST' })).status).toBe(401);
    expect((await call('/session', { method: 'POST', token: 'stranger-id-token' })).status).toBe(401);
    const { sessionToken } = await issueSession();
    // A session cannot extend itself; a fresh Google ID token is required.
    expect((await call('/session', { method: 'POST', token: sessionToken })).status).toBe(401);
    expect((await call('/drive/status', { token: 'mss1.not-a-real-session' })).status).toBe(401);
    expect((await call('/drive/status', { token: `mss1.${'A'.repeat(43)}` })).status).toBe(401);
  });

  it('rejects a session after logout revokes it', async () => {
    const { sessionToken } = await issueSession();
    const other = await issueSession();
    const revoke = await call('/session/revoke', { method: 'POST', token: sessionToken });
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toEqual({ revoked: 1 });
    const rejected = await call('/drive/status', { token: sessionToken });
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ error: 'session_invalid' });
    // Revoking one device's session leaves the other active.
    expect((await call('/drive/status', { token: other.sessionToken })).status).toBe(200);
  });

  it('revokes every owner session with ?all=1', async () => {
    const first = await issueSession();
    const second = await issueSession();
    const revoke = await call('/session/revoke?all=1', { method: 'POST', token: 'owner-id-token' });
    expect(await revoke.json()).toEqual({ revoked: 2 });
    expect((await call('/drive/status', { token: first.sessionToken })).status).toBe(401);
    expect((await call('/drive/status', { token: second.sessionToken })).status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const { sessionToken } = await issueSession();
    await runInDurableObject(ownerStub(), (_instance, state) => {
      state.storage.sql.exec('UPDATE auth_sessions SET expires_at = ?', Date.now() - 1);
    });
    const rejected = await call('/drive/status', { token: sessionToken });
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ error: 'session_invalid' });
  });

  it('rejects existing sessions when OWNER_EMAIL no longer matches', async () => {
    const { sessionToken } = await issueSession();
    const changedOwner = { ...testEnv, OWNER_EMAIL: 'new-owner@example.com' } as WorkerEnv;
    // The new owner's object has no such session, and the identity check would also fail.
    expect((await call('/drive/status', { token: sessionToken, workerEnv: changedOwner })).status).toBe(401);
  });
});

describe('Question bank through the Worker', () => {
  it.each(['/bank/meta', '/bank/content'])('requires owner authorization for %s', async path => {
    expect((await call(path)).status).toBe(401);
    expect((await call(path, { token: 'stranger-id-token' })).status).toBe(401);
    const { sessionToken } = await issueSession();
    await call('/session/revoke', { method: 'POST', token: sessionToken });
    expect((await call(path, { token: sessionToken })).status).toBe(401);
  });

  it('requires owner authorization to register a bank file', async () => {
    expect((await call('/bank/source', { body: { fileId: BANK_FILE_ID } })).status).toBe(401);
    expect((await call('/bank/source', { token: 'stranger-id-token', body: { fileId: BANK_FILE_ID } })).status).toBe(401);
  });

  it('reports an unregistered bank and an unconfigured server Drive credential', async () => {
    const { sessionToken } = await issueSession();
    const missing = await call('/bank/meta', { token: sessionToken });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'bank_source_not_registered' });
    // The test environment has no GOOGLE_DRIVE_* secrets; nothing is faked.
    const unconfigured = await call('/bank/source', { token: sessionToken, body: { fileId: BANK_FILE_ID } });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({ error: 'drive_not_configured' });
  });

  it('registers the picked file and serves metadata and content with the server Drive credential', async () => {
    const { sessionToken } = await issueSession();
    const drive = fakeDrive();
    await injectBankClient(drive.client);
    const registered = await call('/bank/source', { token: sessionToken, body: { fileId: BANK_FILE_ID, fileName: 'MATH_QUESTION_BANK.json' } });
    expect(registered.status).toBe(200);
    const meta = await call('/bank/meta', { token: sessionToken });
    expect(meta.status).toBe(200);
    expect(await meta.json()).toEqual({ fileId: BANK_FILE_ID, fileName: 'MATH_QUESTION_BANK.json', meta: BANK_META });
    const content = await call('/bank/content', { token: sessionToken });
    expect(content.status).toBe(200);
    expect(await content.json()).toMatchObject({ fileId: BANK_FILE_ID, meta: { md5Checksum: 'abc' }, text: BANK_TEXT });
    expect(drive.driveRequests.some(path => path === `/drive/v3/files/${BANK_FILE_ID}?alt=media`)).toBe(true);
  });

  it('does not register a file the server credential cannot read, and validates file IDs', async () => {
    const { sessionToken } = await issueSession();
    await injectBankClient(fakeDrive({ status: 404 }).client);
    const denied = await call('/bank/source', { token: sessionToken, body: { fileId: BANK_FILE_ID } });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'bank_not_accessible' });
    expect((await call('/bank/source', { token: sessionToken, body: { fileId: '../root' } })).status).toBe(400);
    expect((await call('/bank/meta', { token: sessionToken })).status).toBe(404);
  });
});
