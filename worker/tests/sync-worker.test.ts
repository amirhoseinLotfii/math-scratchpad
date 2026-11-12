import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env, reset } from 'cloudflare:test';
import { generateKeyPair, SignJWT } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { verifyGoogleIdToken } from '../src/auth';
import { createApp, type IdTokenVerifier } from '../src/index';
import type { GoogleIdentity, WorkerEnv } from '../src/env';
import { DriveMirrorError } from '../src/google-drive';
import { LEARNING_RESET_EPOCH, LEARNING_RESET_EPOCH_HEADER } from '../../src/sync/learning-reset-epoch';

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
  it('does not let a Drive timeout prevent Notion mirror work', async () => {
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const { runInDurableObject } = await import('cloudflare:test');
    await runInDurableObject(stub, async instance => {
      const target = instance as unknown as {
        env: WorkerEnv;
        syncDrive: () => Promise<unknown>;
        syncNotion: () => Promise<unknown>;
        alarm: () => Promise<void>;
      };
      Object.assign(target.env, {
        GOOGLE_DRIVE_CLIENT_SECRET: 'test-not-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'test-not-token',
        NOTION_API_KEY: 'test-not-secret',
      });
      const calls: string[] = [];
      target.syncDrive = async () => { calls.push('drive'); throw new Error('timeout'); };
      target.syncNotion = async () => { calls.push('notion'); return {}; };
      await target.alarm();
      expect(calls).toContain('notion');
      expect(calls).toContain('drive');
    });
  });

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
      extraHeaders: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-math-scratchpad-reset-epoch',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain(LEARNING_RESET_EPOCH_HEADER);

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


  it('requires owner login and complete scope filters for the read-only reset preflight', async () => {
    const app = createApp(validVerifier);
    expect((await call(app, '/reset/preview?scope=all')).status).toBe(401);
    expect((await call(app, '/reset/preview?scope=unknown', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/preview?scope=section&lesson=L1', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/preview?scope=all&session=x', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/preview?scope=session&session=x&lesson=ignored', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/execute', { token: 'valid-test-token', body: {} })).status).toBe(404);
  });

  it('shows all-data reset impact but preserves the question bank config and server state', async () => {
    const app = createApp(validVerifier);
    await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } });
    await call(app, '/state', { token: 'valid-test-token', body: { key: 'math-scratchpad-drive-config-v1', value: '{"fileId":"bank-safe"}', revision: 0 } });
    await call(app, '/state', { token: 'valid-test-token', body: { key: 'math-scratchpad-session-v3', value: '{"draft":true}', revision: 0 } });
    const preview = await call(app, '/reset/preview?scope=all', { token: 'valid-test-token' });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      readOnly: true, canExecute: false, scope: 'all', matchingEvents: 1, totalEvents: 1,
      lastSeq: 1, protectedBankAndIdentityStateKeys: 1, sharedStateKeysRequiringSelectiveMerge: 1,
      requiresCloudReconciliation: true,
    });
    const saved = await (await call(app, '/state', { token: 'valid-test-token' })).json() as { records: { key: string; value: string }[] };
    expect(saved.records.some(x => x.key === 'math-scratchpad-drive-config-v1' && x.value.includes('bank-safe'))).toBe(true);
    expect(saved.records.some(x => x.key === 'math-scratchpad-session-v3')).toBe(true);
  });

  it('counts only the selected lesson or section without altering the event log', async () => {
    const app = createApp(validVerifier);
    const event = makeEvent();
    await call(app, '/events', { token: 'valid-test-token', body: { events: [event] } });
    const lesson = new URLSearchParams({ scope: 'lesson', bankVersion: event.bankVersion, lesson: event.lesson });
    expect(await (await call(app, `/reset/preview?${lesson}`, { token: 'valid-test-token' })).json()).toMatchObject({ scope: 'lesson', matchingEvents: 1, canExecute: false });
    const otherSection = new URLSearchParams({ scope: 'section', bankVersion: event.bankVersion, lesson: event.lesson, section: 'other-section' });
    expect(await (await call(app, `/reset/preview?${otherSection}`, { token: 'valid-test-token' })).json()).toMatchObject({ matchingEvents: 0 });
    expect((await (await call(app, '/snapshot', { token: 'valid-test-token' })).json() as { events: unknown[] }).events).toHaveLength(1);
  });

  it('persists the editor snapshot on the server with owner authentication and conflict protection', async () => {
    const app = createApp(validVerifier);
    const key = 'math-scratchpad-session-v3';
    expect((await call(app, '/state')).status).toBe(401);
    const empty = await call(app, '/state', { token: 'valid-test-token' });
    expect(await empty.json()).toMatchObject({ records: [], revision: 0 });
    const created = await call(app, '/state', {
      token: 'valid-test-token', body: { key, value: '{"draft":1}', revision: 0 },
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ key, revision: 1, updatedAt: expect.any(String) });
    const conflict = await call(app, '/state', {
      token: 'valid-test-token', body: { key, value: '{"draft":0}', revision: 0 },
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'state_conflict', revision: 1 });
    const fetched = await call(app, '/state', { token: 'valid-test-token' });
    expect(await fetched.json()).toMatchObject({ records: [{ key, value: '{"draft":1}', revision: 1, updatedAt: expect.any(String) }] });
    const updated = await call(app, '/state', {
      token: 'valid-test-token', body: { key, value: '{"draft":2}', revision: 1 },
    });
    expect(updated.status).toBe(200);
  });

  it('rejects writes from stale clients after reset and accepts the current reset epoch', async () => {
    const app = createApp(validVerifier);
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const resetId = crypto.randomUUID();
    const { runInDurableObject } = await import('cloudflare:test');
    await runInDurableObject(stub, instance => {
      const target = instance as unknown as {
        ctx: { storage: { sql: { exec: (sql: string, ...bindings: string[]) => unknown } } };
      };
      target.ctx.storage.sql.exec(
        "UPDATE learning_reset_control SET status = 'released', reset_id = ?, client_epoch = ? WHERE singleton = 1",
        resetId,
        LEARNING_RESET_EPOCH,
      );
    });

    const staleEvent = await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } });
    expect(staleEvent.status).toBe(426);
    expect(await staleEvent.json()).toMatchObject({ error: 'client_update_required' });
    const staleState = await call(app, '/state', {
      token: 'valid-test-token', body: { key: 'math-scratchpad-session-v3', value: 'old', revision: 0 },
    });
    expect(staleState.status).toBe(426);

    const currentHeaders = { [LEARNING_RESET_EPOCH_HEADER]: LEARNING_RESET_EPOCH };
    const currentEvent = await call(app, '/events', {
      token: 'valid-test-token', body: { events: [makeEvent()] }, extraHeaders: currentHeaders,
    });
    expect(currentEvent.status).toBe(200);
    const currentState = await call(app, '/state', {
      token: 'valid-test-token', body: { key: 'math-scratchpad-session-v3', value: 'new', revision: 0 },
      extraHeaders: currentHeaders,
    });
    expect(currentState.status).toBe(200);
  });

  it('records a sanitized Google Drive stage when coordinated reset cleanup fails', async () => {
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const { runInDurableObject } = await import('cloudflare:test');
    const resetId = crypto.randomUUID();
    await runInDurableObject(stub, async instance => {
      const target = instance as unknown as {
        env: WorkerEnv;
        driveClient?: { diagnosticStage: string; findFolderId: () => Promise<string | undefined> };
        executeLearningReset: (request: Request) => Promise<Response>;
        ctx: { storage: { sql: { exec<T>(sql: string, ...bindings: Array<string | number>): { toArray(): T[] } } } };
      };
      Object.assign(target.env, {
        GOOGLE_DRIVE_CLIENT_SECRET: 'test-drive-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'test-drive-refresh-token',
      });
      target.ctx.storage.sql.exec(
        'INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)',
        `preserved-on-failure-${resetId}`, JSON.stringify({ id: `preserved-on-failure-${resetId}` }), new Date().toISOString(),
      );
      target.driveClient = {
        diagnosticStage: 'drive_file_lookup_fetch_rejected',
        findFolderId: async () => { throw new DriveMirrorError('network_error'); },
      };

      const response = await target.executeLearningReset(new Request('https://event-store.internal/internal/learning-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }),
      }));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: 'learning_reset_incomplete', code: 'network_error',
        failureStage: 'drive_reset:drive_file_lookup_fetch_rejected', retryWithSameResetId: true,
      });
      expect(target.ctx.storage.sql.exec<{ failure_stage: string; error_code: string }>(
        "SELECT failure_stage, error_code FROM mirror_diagnostics WHERE destination = 'drive'",
      ).toArray()).toEqual([{ failure_stage: 'drive_reset:drive_file_lookup_fetch_rejected', error_code: 'network_error' }]);
      expect(target.ctx.storage.sql.exec<{ status: string }>(
        'SELECT status FROM learning_reset_control WHERE singleton = 1',
      ).toArray()).toEqual([{ status: 'running' }]);
      expect(target.ctx.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM learning_events',
      ).toArray()).toEqual([{ count: 1 }]);
    });
  });

  it('clears learning mirrors, preserves bank and identity data, and requires release before fresh writes', async () => {
    const app = createApp(validVerifier);
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const { runInDurableObject } = await import('cloudflare:test');
    const resetId = crypto.randomUUID();

    await runInDurableObject(stub, async instance => {
      const target = instance as unknown as {
        env: WorkerEnv;
        driveClient?: {
          diagnosticStage: string;
          readFileMetadata: (id: string, fields: string) => Promise<Record<string, unknown>>;
          listFilesInFolder: (parentId: string) => Promise<Array<{ id: string; name: string; mimeType: string; parents: string[] }>>;
          trashFileInFolder: (id: string, parentId: string) => Promise<boolean>;
        };
        executeLearningReset: (request: Request) => Promise<Response>;
        releaseLearningReset: (request: Request) => Promise<Response>;
        ctx: {
          storage: {
            sql: { exec<T>(sql: string, ...bindings: Array<string | number | null>): { one(): T; toArray(): T[] } };
            put: (key: string, value: unknown) => Promise<void>;
            get: <T>(key: string) => Promise<T | undefined>;
          };
        };
      };
      const originalBindings = {
        GOOGLE_CLIENT_ID: target.env.GOOGLE_CLIENT_ID,
        GOOGLE_DRIVE_CLIENT_SECRET: target.env.GOOGLE_DRIVE_CLIENT_SECRET,
        GOOGLE_DRIVE_REFRESH_TOKEN: target.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      };
      Object.assign(target.env, {
        GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        GOOGLE_DRIVE_CLIENT_SECRET: 'test-drive-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'test-drive-refresh-token',
      });

      try {
        const sql = target.ctx.storage.sql;
        const now = Date.now();
        const timestamp = new Date(now).toISOString();
        sql.exec('INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)', 'reset-event', '{"id":"reset-event","type":"attempt"}', timestamp);
        sql.exec('INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?)', 'math-scratchpad-device-id-v1', '"device-safe"', 1, timestamp);
        sql.exec('INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?)', 'math-scratchpad-drive-config-v1', '{"fileId":"bank-protected"}', 2, timestamp);
        sql.exec('INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?)', 'math-scratchpad-session-v3', '{"draft":true}', 3, timestamp);
        sql.exec('UPDATE app_state_meta SET revision = 3 WHERE singleton = 1');
        sql.exec('INSERT INTO bank_source (singleton, file_id, file_name, registered_at) VALUES (1, ?, ?, ?)', 'bank-protected', 'question-bank.json', timestamp);
        sql.exec('INSERT INTO auth_sessions (token_hash, email, sub, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', 'a'.repeat(64), OWNER_EMAIL, 'test-subject', now, now + 60_000);
        sql.exec('INSERT INTO notion_projections (projection_type, projection_key, projection_json) VALUES (?, ?, ?)', 'attempt', 'reset-event', '{"event":"reset-event"}');
        sql.exec('INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'attempt', 'reset-event', 'notion-page');
        sql.exec('INSERT INTO notion_state_queue (key, revision) VALUES (?, ?)', 'math-scratchpad-session-v3', 3);
        sql.exec('INSERT INTO notion_mistake_reviews (item_key, event_id, review_successes, last_review_event_id) VALUES (?, ?, ?, ?)', 'mistake-1', 'reset-event', 1, 'reset-event');
        sql.exec('INSERT INTO notion_session_mistakes (session_id, page_id) VALUES (?, ?)', 'session-1', 'notion-mistake-page');
        sql.exec('UPDATE notion_projection_meta SET last_seq = 1 WHERE singleton = 1');
        await target.ctx.storage.put('drive-mirror-state-v1', {
          status: 'synced', lastSeq: 1, pendingCount: 0,
          folders: { rootId: 'root-folder', syncId: 'sync-folder', eventsId: 'events-folder', stateId: 'state-folder', backupsId: 'backup-folder' },
          files: {}, fileHashes: {}, snapshots: {},
        });
        await target.ctx.storage.put('notion-mirror-state-v1', { status: 'synced', lastSeq: 1, pendingCount: 0 });

        const folderMetadata: Record<string, Record<string, unknown>> = {
          'root-folder': { id: 'root-folder', name: 'Math_Project', mimeType: 'application/vnd.google-apps.folder', parents: ['root'], trashed: false },
          'sync-folder': { id: 'sync-folder', name: '03_Sync', mimeType: 'application/vnd.google-apps.folder', parents: ['root-folder'], trashed: false },
          'events-folder': { id: 'events-folder', name: 'events', mimeType: 'application/vnd.google-apps.folder', parents: ['sync-folder'], trashed: false },
          'state-folder': { id: 'state-folder', name: 'state', mimeType: 'application/vnd.google-apps.folder', parents: ['sync-folder'], trashed: false },
          'backup-folder': { id: 'backup-folder', name: '06_Backups', mimeType: 'application/vnd.google-apps.folder', parents: ['root-folder'], trashed: false },
        };
        const child = (id: string, name: string, parentId: string, mimeType = 'application/json') => ({ id, name, mimeType, parents: [parentId] });
        const filesByFolder = new Map([
          ['events-folder', [
            child('mirror-events', 'events_2026-11.jsonl', 'events-folder', 'application/x-ndjson'),
            child('bank-protected', 'progress.json', 'events-folder'),
            child('course-source', 'lesson-source.pdf', 'events-folder', 'application/pdf'),
            child('nested-folder', 'nested', 'events-folder', 'application/vnd.google-apps.folder'),
          ]],
          ['state-folder', [
            child('mirror-progress', 'progress.json', 'state-folder'),
            child('unrelated-state', 'notes.txt', 'state-folder', 'text/plain'),
          ]],
          ['backup-folder', [child('mirror-backup', 'sync_backup_2026-11-12.json', 'backup-folder')]],
        ]);
        const trashed: Array<{ id: string; parentId: string }> = [];
        target.driveClient = {
          diagnosticStage: 'idle',
          readFileMetadata: async id => folderMetadata[id] ?? {},
          listFilesInFolder: async parentId => filesByFolder.get(parentId) ?? [],
          trashFileInFolder: async (id, parentId) => { trashed.push({ id, parentId }); return true; },
        };

        const response = await target.executeLearningReset(new Request('https://event-store.internal/internal/learning-reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }),
        }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          completed: true,
          releaseRequired: true,
          drive: { movedToTrash: 3, inspectedFiles: 6, preservedFiles: 3, protectedBankFileSkipped: true, foldersFound: 5 },
          cloud: {
            deletedLearningEvents: 1,
            deletedAppStateRecords: 1,
            deletedNotionProjectionRecords: 1,
            deletedNotionReferences: 1,
            deletedQueuedMirrorRecords: 3,
            bankSourceRecords: 1,
            activeAuthSessions: 1,
            preservedIdentityAndDriveConfigRecords: 2,
          },
          preserved: { bankSourceRecords: 1, activeAuthSessions: 1 },
        });
        expect(trashed).toEqual([
          { id: 'mirror-events', parentId: 'events-folder' },
          { id: 'mirror-progress', parentId: 'state-folder' },
          { id: 'mirror-backup', parentId: 'backup-folder' },
        ]);

        const count = (table: string) => Number(sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).one().count);
        expect(count('learning_events')).toBe(0);
        expect(count('notion_projections')).toBe(0);
        expect(count('notion_page_refs')).toBe(0);
        expect(count('notion_state_queue')).toBe(0);
        expect(count('notion_mistake_reviews')).toBe(0);
        expect(count('notion_session_mistakes')).toBe(0);
        expect(count('bank_source')).toBe(1);
        expect(count('auth_sessions')).toBe(1);
        expect(sql.exec<{ key: string; value: string }>('SELECT key, value FROM app_state ORDER BY key').toArray()).toEqual([
          { key: 'math-scratchpad-device-id-v1', value: '"device-safe"' },
          { key: 'math-scratchpad-drive-config-v1', value: '{"fileId":"bank-protected"}' },
        ]);
        expect(sql.exec<{ revision: number }>('SELECT revision FROM app_state_meta WHERE singleton = 1').one()).toEqual({ revision: 0 });
        expect(sql.exec<{ last_seq: number }>('SELECT last_seq FROM notion_projection_meta WHERE singleton = 1').one()).toEqual({ last_seq: 0 });
        expect(await target.ctx.storage.get('drive-mirror-state-v1')).toBeUndefined();
        expect(await target.ctx.storage.get('notion-mirror-state-v1')).toBeUndefined();
        expect(sql.exec<{ status: string }>('SELECT status FROM learning_reset_control WHERE singleton = 1').one()).toEqual({ status: 'awaiting_release' });

        const lockedWrite = await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } });
        expect(lockedWrite.status).toBe(503);
        const blockedRelease = await target.releaseLearningReset(new Request('https://event-store.internal/internal/learning-reset/release', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId: crypto.randomUUID() }),
        }));
        expect(blockedRelease.status).toBe(409);
        expect(sql.exec<{ status: string }>('SELECT status FROM learning_reset_control WHERE singleton = 1').one()).toEqual({ status: 'awaiting_release' });

        const release = await target.releaseLearningReset(new Request('https://event-store.internal/internal/learning-reset/release', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }),
        }));
        expect(release.status).toBe(200);
        expect(await release.json()).toMatchObject({ released: true });
        expect((await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } })).status).toBe(426);
        const freshWrite = await call(app, '/events', {
          token: 'valid-test-token', body: { events: [makeEvent()] },
          extraHeaders: { [LEARNING_RESET_EPOCH_HEADER]: LEARNING_RESET_EPOCH },
        });
        expect(freshWrite.status).toBe(200);
      } finally {
        Object.assign(target.env, originalBindings);
      }
    });
  });

  it('deletes only the explicitly requested server state key and rejects unrelated names', async () => {
    const app = createApp(validVerifier);
    const key = 'math-scratchpad-session-v3';
    await call(app, '/state', { token: 'valid-test-token', body: { key, value: 'temporary', revision: 0 } });
    const deleted = await call(app, '/state', {
      token: 'valid-test-token', body: { key, value: null, revision: 1 },
    });
    expect(deleted.status).toBe(200);
    const afterDelete = await call(app, '/state', { token: 'valid-test-token' });
    expect(await afterDelete.json()).toMatchObject({ records: [{ key, value: null, revision: 2 }], revision: 2 });
    const invalid = await call(app, '/state', {
      token: 'valid-test-token', body: { key: 'another-app-secret', value: 'x', revision: 0 },
    });
    expect(invalid.status).toBe(400);
  });

  it('validates the event schema before writing', async () => {
    const app = createApp(validVerifier);
    const response = await call(app, '/events', { token: 'valid-test-token', body: { events: [{ id: 'bad' }] } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_event' });
    const snapshot = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect(await snapshot.json()).toMatchObject({ events: [], cursor: 0, through: 0 });
  });

  it('accepts bounded legacy migration chunks and returns them in the private replay snapshot', async () => {
    const app = createApp(validVerifier);
    const migrationId = crypto.randomUUID();
    const event = {
      ...makeEvent(),
      bankVersion: 'migration-v1', session: `migration-${migrationId}`, chapter: 0,
      lesson: 'unknown', section: 'unknown', concept: 'legacy-storage', type: 'legacy_state_migration',
      itemId: 'math-scratchpad-session-v3',
      migrationChunk: { id: migrationId, key: 'math-scratchpad-session-v3', index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30=' },
    };
    const posted = await call(app, '/events', { method: 'POST', token: 'valid-test-token', body: { events: [event] } });
    expect(posted.status).toBe(200);
    const snapshot = await call(app, '/snapshot?limit=100', { token: 'valid-test-token' });
    const body = await snapshot.json() as { events: Array<{ event: { migrationChunk?: { id: string; data: string } } }> };
    expect(body.events).toContainEqual(expect.objectContaining({ event: expect.objectContaining({ migrationChunk: expect.objectContaining({ id: migrationId, data: 'e30=' }) }) }));
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
