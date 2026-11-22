import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import { API_UNAUTHORIZED_EVENT } from '../api-unauthorized';
import { SYNC_API_ORIGIN } from '../sync-config';
import { recordGoogleAuthDiagnostic } from './google-auth-diagnostics';
import { GoogleAuthError } from './google-auth-errors';
import { ensureGoogleIdToken, getGoogleIdToken, subscribeGoogleIdToken } from './google-id-token';

export const WORKER_SESSION_DB_NAME = 'math-scratchpad-auth-v1';
const STORE = 'session';
const RECORD_KEY = 'worker-session';
const CHANNEL_NAME = 'math-scratchpad-worker-session-v1';
export const WORKER_SESSION_EVENT = 'math-scratchpad:worker-session-changed';
const USABLE_SKEW_MS = 60_000;
const RENEW_BEFORE_MS = 24 * 60 * 60_000;
const SESSION_REQUEST_TIMEOUT_MS = 10_000;
const SESSION_PATTERN = /^mss1\.[A-Za-z0-9_-]{43}$/;

export type WorkerSession = { token: string; expiresAt: number };

let cached: WorkerSession | undefined;
let hydrated: Promise<void> | undefined;
let issueFlight: Promise<WorkerSession | undefined> | undefined;
let dbPromise: Promise<IDBPDatabase> | undefined;
let channel: BroadcastChannel | undefined;
let fetcher: typeof fetch = (...args) => fetch(...args);
let lastIssueFailure: { code: 'session_rejected' | 'network_timeout' | 'network_error'; status?: number } | undefined;

export function isWorkerSessionToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith('mss1.');
}

function validRecord(value: unknown): WorkerSession | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as { token?: unknown; expiresAt?: unknown };
  if (typeof record.token !== 'string' || !SESSION_PATTERN.test(record.token)
    || typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)) return undefined;
  return { token: record.token, expiresAt: record.expiresAt };
}

function database(): Promise<IDBPDatabase> | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  dbPromise ??= openDB(WORKER_SESSION_DB_NAME, 1, {
    upgrade(db) { if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); },
  }).catch(error => { dbPromise = undefined; throw error; });
  return dbPromise;
}

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORKER_SESSION_EVENT));
}

function listenAcrossTabs(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => { hydrated = undefined; void hydrateWorkerSession().then(announce); };
  } catch { channel = undefined; }
}

function notifyTabs(): void {
  try { channel?.postMessage('changed'); } catch { /* Cross-tab notice is a hint only. */ }
}

async function persist(value: WorkerSession | undefined): Promise<void> {
  cached = value;
  try {
    const db = await database();
    if (db) {
      if (value) await db.put(STORE, value, RECORD_KEY);
      else await db.delete(STORE, RECORD_KEY);
    }
  } catch { /* The in-memory session still works for this page. */ }
  notifyTabs();
  announce();
}

export function hydrateWorkerSession(): Promise<void> {
  listenAcrossTabs();
  hydrated ??= (async () => {
    try {
      const db = await database();
      const stored = validRecord(await db?.get(STORE, RECORD_KEY));
      if (stored && stored.expiresAt > Date.now() + USABLE_SKEW_MS) cached = stored;
      else {
        cached = undefined;
        if (stored) await db?.delete(STORE, RECORD_KEY);
      }
    } catch { cached = undefined; }
  })();
  return hydrated;
}

export function getWorkerSession(): WorkerSession | undefined {
  if (cached && cached.expiresAt > Date.now() + USABLE_SKEW_MS) return cached;
  return undefined;
}

export function getApiToken(): string | undefined {
  return getWorkerSession()?.token ?? getGoogleIdToken();
}

export function exchangeIdTokenForWorkerSession(idToken: string): Promise<WorkerSession | undefined> {
  const current = getWorkerSession();
  if (current && current.expiresAt > Date.now() + RENEW_BEFORE_MS) return Promise.resolve(current);
  if (issueFlight) return issueFlight;
  issueFlight = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS);
    lastIssueFailure = undefined;
    try {
      const response = await fetcher(`${SYNC_API_ORIGIN}/session`, {
        method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${idToken}` }, signal: controller.signal,
      });
      if (response.status !== 201) {
        lastIssueFailure = { code: 'session_rejected', status: response.status };
        recordGoogleAuthDiagnostic('session_rejected', `http_${response.status}`);
        return undefined;
      }
      const issued = validRecord(await response.json().then(
        (value: { sessionToken?: unknown; expiresAt?: unknown }) => ({ token: value?.sessionToken, expiresAt: value?.expiresAt }),
      ));
      if (!issued || issued.expiresAt <= Date.now() + USABLE_SKEW_MS) {
        lastIssueFailure = { code: 'session_rejected', status: response.status };
        recordGoogleAuthDiagnostic('session_rejected', 'invalid_201_body');
        return undefined;
      }
      const previous = cached;
      await persist(issued);
      if (previous && previous.token !== issued.token) void revokeOnServer(previous.token);
      recordGoogleAuthDiagnostic('session_created', 'http_201');
      return issued;
    } catch {
      lastIssueFailure = controller.signal.aborted
        ? { code: 'network_timeout' }
        : { code: 'network_error' };
      recordGoogleAuthDiagnostic(lastIssueFailure.code);
      return undefined;
    } finally {
      clearTimeout(timeout);
      issueFlight = undefined;
    }
  })();
  return issueFlight;
}

export async function exchangeIdTokenForWorkerSessionOrThrow(idToken: string): Promise<WorkerSession> {
  const session = await exchangeIdTokenForWorkerSession(idToken);
  if (session) return session;
  const failure = lastIssueFailure ?? { code: 'session_rejected' as const };
  throw new GoogleAuthError(failure.code, failure.status);
}

export async function ensureWorkerSession(): Promise<WorkerSession | undefined> {
  await hydrateWorkerSession();
  const current = getWorkerSession();
  if (current) return current;
  const idToken = await ensureGoogleIdToken();
  if (!idToken) return undefined;
  return exchangeIdTokenForWorkerSessionOrThrow(idToken);
}

export async function ensureApiToken(): Promise<string | undefined> {
  await hydrateWorkerSession();
  const session = getWorkerSession();
  if (session) {
    const fresh = getGoogleIdToken();
    if (fresh && session.expiresAt <= Date.now() + RENEW_BEFORE_MS) void exchangeIdTokenForWorkerSession(fresh);
    return session.token;
  }
  const idToken = await ensureGoogleIdToken();
  if (!idToken) return undefined;
  return (await exchangeIdTokenForWorkerSession(idToken))?.token ?? idToken;
}

export async function subscribeApiToken(listener: (token: string) => void): Promise<() => void> {
  await hydrateWorkerSession();
  let active = true;
  let last = '';
  const deliver = (token: string | undefined) => {
    if (!active || !token || token === last) return;
    last = token;
    listener(token);
  };
  const onSessionChange = () => deliver(getWorkerSession()?.token);
  if (typeof window !== 'undefined') window.addEventListener(WORKER_SESSION_EVENT, onSessionChange);
  deliver(getWorkerSession()?.token);
  let unsubscribeGoogle: () => void = () => undefined;
  try {
    unsubscribeGoogle = await subscribeGoogleIdToken(idToken => {
      void exchangeIdTokenForWorkerSession(idToken).then(session => deliver(session?.token ?? getWorkerSession()?.token));
    });
  } catch (problem) {
    if (!getWorkerSession()) {
      active = false;
      if (typeof window !== 'undefined') window.removeEventListener(WORKER_SESSION_EVENT, onSessionChange);
      throw problem;
    }
  }
  return () => {
    active = false;
    unsubscribeGoogle();
    if (typeof window !== 'undefined') window.removeEventListener(WORKER_SESSION_EVENT, onSessionChange);
  };
}

export function handleApiUnauthorized(token: string | null | undefined): void {
  if (!isWorkerSessionToken(token) || cached?.token !== token) return;
  void persist(undefined);
}

if (typeof window !== 'undefined') {
  window.addEventListener(API_UNAUTHORIZED_EVENT, event => handleApiUnauthorized((event as CustomEvent<string>).detail));
}

async function revokeOnServer(token: string): Promise<void> {
  try {
    await fetcher(`${SYNC_API_ORIGIN}/session/revoke`, {
      method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* The server-side expiry still bounds an unrevoked session. */ }
}

export async function revokeWorkerSession(): Promise<void> {
  await hydrateWorkerSession();
  const current = cached;
  await persist(undefined);
  if (current) await revokeOnServer(current.token);
}

export async function resetWorkerSessionForTests(options: { fetcher?: typeof fetch } = {}): Promise<void> {
  cached = undefined;
  hydrated = undefined;
  issueFlight = undefined;
  fetcher = options.fetcher ?? ((...args) => fetch(...args));
  try { (await dbPromise)?.close(); } catch { /* ignore */ }
  dbPromise = undefined;
  try { await deleteDB(WORKER_SESSION_DB_NAME); } catch { /* ignore */ }
}

export function forgetWorkerSessionMemoryForTests(): void {
  cached = undefined;
  hydrated = undefined;
}
