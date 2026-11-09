import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGoogleIdToken, commitGoogleIdToken } from '../../src/sync/google-id-token';
import {
  ensureApiToken,
  exchangeIdTokenForWorkerSession,
  forgetWorkerSessionMemoryForTests,
  getApiToken,
  getWorkerSession,
  handleApiUnauthorized,
  hydrateWorkerSession,
  resetWorkerSessionForTests,
  revokeWorkerSession,
} from '../../src/sync/worker-session';
import { SYNC_API_ORIGIN } from '../../src/sync/sync-config';

const SESSION_A = `mss1.${'A'.repeat(43)}`;
const SESSION_B = `mss1.${'B'.repeat(43)}`;
const DAY = 24 * 60 * 60_000;

function idToken(expSeconds = Math.floor(Date.now() / 1000) + 3600): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds, email: 'owner@example.com' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

function workerFetch(sessions: string[] = [SESSION_A], expiresAt = Date.now() + 7 * DAY) {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const queue = [...sessions];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
    if (url === `${SYNC_API_ORIGIN}/session`) return Response.json({ sessionToken: queue.shift(), expiresAt }, { status: 201 });
    if (url === `${SYNC_API_ORIGIN}/session/revoke`) return Response.json({ revoked: 1 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

beforeEach(async () => { await resetWorkerSessionForTests(); });
afterEach(async () => {
  clearGoogleIdToken();
  localStorage.clear();
  await resetWorkerSessionForTests();
});

describe('Worker session client', () => {
  it('exchanges a fresh Google ID token for a session and prefers it for API calls', async () => {
    const { fetcher, calls } = workerFetch();
    await resetWorkerSessionForTests({ fetcher });
    const google = idToken();
    commitGoogleIdToken(google);
    expect(getApiToken()).toBe(google);
    const session = await exchangeIdTokenForWorkerSession(google);
    expect(session?.token).toBe(SESSION_A);
    expect(calls[0]).toEqual({ url: `${SYNC_API_ORIGIN}/session`, auth: `Bearer ${google}` });
    expect(getApiToken()).toBe(SESSION_A);
  });

  it('keeps the session in IndexedDB so it survives reload after the GIS token is gone', async () => {
    const { fetcher } = workerFetch();
    await resetWorkerSessionForTests({ fetcher });
    await exchangeIdTokenForWorkerSession(idToken());
    // Simulate a reload: drop memory, keep IndexedDB.
    forgetWorkerSessionMemoryForTests();
    expect(getWorkerSession()).toBeUndefined();
    await hydrateWorkerSession();
    expect(getWorkerSession()?.token).toBe(SESSION_A);
    clearGoogleIdToken();
    expect(localStorage.getItem('math-scratchpad-google-id-token-v1')).toBeNull();
    expect(await ensureApiToken()).toBe(SESSION_A);
  });

  it('does not use or keep an expired session', async () => {
    const { fetcher } = workerFetch([SESSION_A], Date.now() + 30_000);
    await resetWorkerSessionForTests({ fetcher });
    expect(await exchangeIdTokenForWorkerSession(idToken())).toBeUndefined();
    expect(getWorkerSession()).toBeUndefined();
    expect(await ensureApiToken()).toBeUndefined();
  });

  it('forgets a session the Worker rejected, and falls back to the GIS token', async () => {
    const { fetcher } = workerFetch();
    await resetWorkerSessionForTests({ fetcher });
    const google = idToken();
    commitGoogleIdToken(google);
    await exchangeIdTokenForWorkerSession(google);
    handleApiUnauthorized('header.not-a-session.signature');
    expect(getApiToken()).toBe(SESSION_A);
    handleApiUnauthorized(SESSION_A);
    expect(getWorkerSession()).toBeUndefined();
    expect(getApiToken()).toBe(google);
  });

  it('renews only near expiry and revokes the replaced session', async () => {
    const { fetcher, calls } = workerFetch([SESSION_A, SESSION_B], Date.now() + 12 * 60 * 60_000);
    await resetWorkerSessionForTests({ fetcher });
    await exchangeIdTokenForWorkerSession(idToken());
    expect(getWorkerSession()?.token).toBe(SESSION_A);
    // Less than a day left: a fresh GIS token mints a new session and revokes the old one.
    await exchangeIdTokenForWorkerSession(idToken());
    expect(getWorkerSession()?.token).toBe(SESSION_B);
    await vi.waitFor(() => expect(calls.some(call => call.url.endsWith('/session/revoke') && call.auth === `Bearer ${SESSION_A}`)).toBe(true));
  });

  it('logout revokes the session on the Worker and removes it from IndexedDB', async () => {
    const { fetcher, calls } = workerFetch();
    await resetWorkerSessionForTests({ fetcher });
    await exchangeIdTokenForWorkerSession(idToken());
    await revokeWorkerSession();
    expect(calls.at(-1)).toEqual({ url: `${SYNC_API_ORIGIN}/session/revoke`, auth: `Bearer ${SESSION_A}` });
    expect(getWorkerSession()).toBeUndefined();
    await hydrateWorkerSession();
    expect(getWorkerSession()).toBeUndefined();
  });
});
