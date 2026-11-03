import { afterEach, describe, expect, it, vi } from 'vitest';
import { env, reset, runInDurableObject } from 'cloudflare:test';
import fc from 'fast-check';
import { learnEventSchema, type LearnEvent } from '../../src/sync/events';
import {
  buildProgressProjection,
  buildSyncManifest,
  formatTehran,
  groupEventsByUtcMonth,
  mergeJsonlEventContent,
  mergeUniqueEvents,
  serializeJsonlEvents,
  sha256Hex,
  type SequencedLearnEvent,
} from '../src/drive-projection';
import { DriveMirrorError, GoogleDriveClient } from '../src/google-drive';
import { createApp, type IdTokenVerifier } from '../src/index';
import type { GoogleIdentity, WorkerEnv } from '../src/env';

const OWNER_EMAIL = 'amirhoseinlotfalizadeprogramer@gmail.com';
const ALLOWED_ORIGIN = 'https://amirhoseinlotfii.github.io';
const testEnv = env as unknown as WorkerEnv;
const owner: GoogleIdentity = { sub: 'test-owner', email: OWNER_EMAIL, email_verified: true };
const validVerifier: IdTokenVerifier = async token => {
  if (token !== 'valid-test-token') throw new Error('invalid_token');
  return owner;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

function makeEvent(index: number, overrides: Partial<LearnEvent> = {}): LearnEvent {
  const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
  return {
    id: uuid(index),
    schema: 1,
    isTest: false,
    ts: new Date(Date.UTC(2026, 10, 2, 0, 0, index % 60)).toISOString(),
    deviceId: uuid(99_999),
    bankVersion: 'v21',
    session: 'test-session',
    chapter: 1,
    lesson: '1.1',
    section: '1.1',
    concept: 'relations',
    type: 'lesson_open',
    ...overrides,
  };
}

function sequenced(index: number, event: LearnEvent = makeEvent(index)): SequencedLearnEvent {
  return { seq: index, event };
}

function makeClient(fetcher: typeof fetch, email = OWNER_EMAIL) {
  const workerEnv = {
    OWNER_EMAIL: email,
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_DRIVE_CLIENT_SECRET: 'not-a-real-secret',
    GOOGLE_DRIVE_REFRESH_TOKEN: 'not-a-real-token',
  } as WorkerEnv;
  return new GoogleDriveClient(workerEnv, fetcher, () => Date.UTC(2026, 10, 2));
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function withGoogleAuth(
  handleDrive: (url: URL, init: RequestInit) => Promise<Response> | Response,
  identity: { email: string; email_verified: boolean } = { email: OWNER_EMAIL, email_verified: true },
): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const params = new URLSearchParams(String(init.body ?? ''));
      expect(params.get('grant_type')).toBe('refresh_token');
      expect(params.get('refresh_token')).toBe('not-a-real-token');
      return jsonResponse({ access_token: 'test-access-token', expires_in: 3600 });
    }
    if (url.href === 'https://www.googleapis.com/oauth2/v3/userinfo') {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-access-token');
      return jsonResponse(identity);
    }
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-access-token');
    return handleDrive(url, init);
  }) as typeof fetch;
}

describe('Drive event mapping and projections', () => {
  it('groups by UTC month in sequence order and writes each complete event as one JSONL line', () => {
    const previousMonth = sequenced(2, makeEvent(2, { ts: '2026-10-31T23:59:59.000Z', userAnswer: 'x = 4', steps: ['subtract 2', 'divide by 3'] }));
    const currentMonth = sequenced(1, makeEvent(1, { ts: '2026-11-01T00:00:00.000Z', questionText: 'Find the domain.', verdict: 'submitted', verdictSource: 'none' }));
    const groups = groupEventsByUtcMonth([previousMonth, currentMonth]);
    expect([...groups.keys()]).toEqual(['2026-11', '2026-10']);
    expect(serializeJsonlEvents(groups.get('2026-10')!)).toBe(`${JSON.stringify(previousMonth.event)}\n`);
    expect(JSON.parse(serializeJsonlEvents(groups.get('2026-11')!))).toMatchObject({
      id: currentMonth.event.id, questionText: 'Find the domain.', verdictSource: 'none',
    });
  });

  it('merges event JSONL idempotently and rejects reused IDs with changed answers', () => {
    const first = makeEvent(1, { userAnswer: '2', verdict: 'correct', verdictSource: 'checker' });
    const second = makeEvent(2, { userAnswer: '3', verdict: 'submitted', verdictSource: 'none' });
    const remote = serializeJsonlEvents([sequenced(1, first)]);
    const desired = serializeJsonlEvents([sequenced(1, first), sequenced(2, second)]);
    const merged = mergeJsonlEventContent(remote, desired);
    expect(merged.trim().split('\n').map(line => JSON.parse(line))).toEqual([first, second]);
    expect(mergeJsonlEventContent(merged, desired)).toBe(merged);
    const staleUnclassified = serializeJsonlEvents([sequenced(3, makeEvent(3, { isTest: undefined }))]);
    expect(mergeJsonlEventContent(staleUnclassified, desired)).toBe(merged);
    expect(() => mergeJsonlEventContent(remote, serializeJsonlEvents([sequenced(1, { ...first, userAnswer: 'wrong' })]))).toThrow('event_id_conflict');
  });

  it('deduplication is commutative and idempotent across generated event sets', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 30 }), { maxLength: 50 }), indexes => {
      const events = indexes.map(index => makeEvent(index));
      const forward = mergeUniqueEvents(events);
      const reverse = mergeUniqueEvents([...events].reverse());
      expect(forward).toEqual(reverse);
      expect(mergeUniqueEvents(forward, events)).toEqual(forward);
    }), { numRuns: 100 });
  });

  it('projects the latest learner position, gate result, completion, and bank version', () => {
    const events = [
      sequenced(1, makeEvent(1, { type: 'chunk_open', itemId: 'concept-1' })),
      sequenced(2, makeEvent(2, { type: 'gate_attempt' })),
      sequenced(3, makeEvent(3, { type: 'gate_failed' })),
      sequenced(4, makeEvent(4, { type: 'gate_passed' })),
      sequenced(5, makeEvent(5, { type: 'section_complete' })),
      sequenced(6, makeEvent(6, { type: 'lesson_complete' })),
    ];
    const projection = buildProgressProjection(events, new Date('2026-11-02T00:00:00.000Z'));
    expect(projection).toMatchObject({
      currentPosition: { chapter: 1, lesson: '1.1', section: '1.1', chunkId: 'concept-1' },
      gateStatusBySection: { '1:1.1:1.1': 'passed' },
      completedSections: ['1:1.1:1.1'],
      completedLessons: ['1:1.1'],
      unlockedSections: ['1:1.1:1.1'],
      bankVersion: 'v21',
      lastEventId: events[5].event.id,
      lastSeq: 6,
      updatedAtUtc: '2026-11-02T00:00:00.000Z',
      updatedAtTehran: '2026-11-02T03:30:00+03:30',
    });
  });

  it('stores tagged test events but excludes test and unclassified events from learner progress', () => {
    const realEvent = makeEvent(1, { type: 'chunk_open', itemId: 'concept-1' });
    const testEvent = learnEventSchema.parse(makeEvent(2, {
      isTest: true, type: 'section_complete', section: '99.99', lesson: '99.99', itemId: 'live-check',
    }));
    const unclassifiedEvent = learnEventSchema.parse(makeEvent(3, {
      isTest: undefined, type: 'chunk_open', itemId: 'unclassified-preview',
    }));
    const projection = buildProgressProjection([
      sequenced(1, realEvent), sequenced(2, testEvent), sequenced(3, unclassifiedEvent),
    ]);
    expect(projection).toMatchObject({
      currentPosition: { chapter: 1, lesson: '1.1', section: '1.1', chunkId: 'concept-1' },
      completedSections: [],
      lastEventId: realEvent.id,
      lastSeq: 1,
    });
    expect(serializeJsonlEvents([sequenced(1, realEvent), sequenced(2, testEvent)])).toContain('"isTest":true');
  });

  it('uses Tehran local timestamps and hashes exactly the exported file contents', async () => {
    expect(formatTehran(new Date('2026-06-01T00:00:00.000Z'))).toBe('2026-06-01T03:30:00+03:30');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const event = sequenced(1);
    const progressContent = '{"lastSeq":1}\n';
    const eventContent = serializeJsonlEvents([event]);
    const manifest = await buildSyncManifest({
      events: [event], eventFiles: [{ path: 'events/events_2026-11.jsonl', content: eventContent }],
      progressContent, now: new Date('2026-11-02T00:00:00.000Z'),
    });
    expect(manifest).toMatchObject({ lastSeq: 1, lastEventId: event.event.id, lastSuccessAtTehran: '2026-11-02T03:30:00+03:30' });
    expect(manifest.files).toEqual([
      { path: 'events/events_2026-11.jsonl', sha256: await sha256Hex(eventContent) },
      { path: 'state/progress.json', sha256: await sha256Hex(progressContent) },
    ]);
  });

  it('keeps and serializes a 50,000-event month without dropping or duplicating events', () => {
    const events: SequencedLearnEvent[] = Array.from({ length: 50_000 }, (_, index) => {
      const event = makeEvent(index + 1, { ts: '2026-11-02T00:00:00.000Z' });
      return { seq: index + 1, event };
    });
    const started = performance.now();
    const groups = groupEventsByUtcMonth(events);
    const content = serializeJsonlEvents(groups.get('2026-11')!);
    const projection = buildProgressProjection(events);
    const elapsedMs = performance.now() - started;
    expect(content.split('\n').filter(Boolean)).toHaveLength(50_000);
    expect(projection.lastSeq).toBe(50_000);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 15_000);
});

describe('Google Drive REST client', () => {
  it('refreshes the app token, verifies the exact owner, and refuses another account before Drive access', async () => {
    const fetcher = withGoogleAuth(() => { throw new Error('Drive must not be called'); }, { email: 'other@example.com', email_verified: true });
    const client = makeClient(fetcher);
    await expect(client.ensureRootFolder('Math_Project')).rejects.toMatchObject({ code: 'account_mismatch' });
  });

  it('creates files inside the requested private folder and never calls Drive sharing APIs', async () => {
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    const fetcher = withGoogleAuth((url, init) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? init.body : undefined;
      requests.push({ path: url.pathname, method, body });
      if (url.pathname === '/drive/v3/files' && method === 'GET') return jsonResponse({ files: [] });
      if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
        expect(body).toContain('name');
        return jsonResponse({ id: 'new-file', name: 'events_2026-11.jsonl', mimeType: 'application/x-ndjson', parents: ['events-folder'] }, 200, { ETag: '"v1"' });
      }
      throw new Error(`Unexpected Drive request: ${method} ${url.pathname}`);
    });
    const client = makeClient(fetcher);
    const saved = await client.upsertTextFile({
      name: 'events_2026-11.jsonl', parentId: 'events-folder', mimeType: 'application/x-ndjson',
      desiredContent: '{"id":"event-1"}\n', mergeContent: (remote, desired) => remote + desired,
    });
    expect(saved).toEqual({ id: 'new-file', etag: '"v1"', content: '{"id":"event-1"}\n' });
    expect(requests.some(request => request.path.endsWith('/permissions'))).toBe(false);
    expect(requests.at(-1)?.body).toContain('events-folder');
  });

  it('uses resumable uploads above 5 MB and verifies the created file metadata', async () => {
    const content = 'x'.repeat(5 * 1024 * 1024 + 1);
    const requests: Array<{ path: string; method: string; uploadLength?: string; ifMatch?: string; bodyLength: number }> = [];
    const fetcher = withGoogleAuth((url, init) => {
      const headers = new Headers(init.headers);
      const body = typeof init.body === 'string' ? init.body : '';
      requests.push({
        path: url.pathname,
        method: init.method ?? 'GET',
        uploadLength: headers.get('X-Upload-Content-Length') ?? undefined,
        ifMatch: headers.get('If-Match') ?? undefined,
        bodyLength: body.length,
      });
      if (url.pathname === '/drive/v3/files' && init.method === 'GET') return jsonResponse({ files: [] });
      if (url.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
        expect(headers.get('X-Upload-Content-Type')).toBe('application/x-ndjson');
        return new Response(null, { status: 200, headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test-upload' } });
      }
      if (url.searchParams.get('upload_id') === 'test-upload' && init.method === 'PUT') {
        return jsonResponse({ id: 'large-file', name: 'events_2026-11.jsonl', mimeType: 'application/x-ndjson', parents: ['events-folder'] }, 200, { ETag: '"large-v1"' });
      }
      throw new Error(`Unexpected Drive request: ${init.method ?? 'GET'} ${url.pathname}`);
    });
    const client = makeClient(fetcher);
    const saved = await client.upsertTextFile({
      name: 'events_2026-11.jsonl', parentId: 'events-folder', mimeType: 'application/x-ndjson',
      desiredContent: content, mergeContent: (_remote, desired) => desired,
    });
    expect(saved).toEqual({ id: 'large-file', etag: '"large-v1"', content });
    expect(requests.map(request => request.method)).toEqual(['GET', 'POST', 'PUT']);
    expect(requests[1]).toMatchObject({ uploadLength: String(5 * 1024 * 1024 + 1), bodyLength: expect.any(Number) });
    expect(requests[2]).toMatchObject({ bodyLength: content.length });
  });

  it('re-reads after an ETag conflict, merges concurrent events, and conditionally retries', async () => {
    const base = makeEvent(1, { userAnswer: 'learner answer' });
    const concurrent = makeEvent(2, { userAnswer: 'another device answer' });
    const desired = serializeJsonlEvents([sequenced(1, base)]);
    let remoteContent = serializeJsonlEvents([sequenced(2, concurrent)]);
    let currentEtag = '"v1"';
    let firstConflict = true;
    const conditions: string[] = [];
    const fetcher = withGoogleAuth((url, init) => {
      if (url.pathname === '/drive/v3/files/file-1' && url.searchParams.get('alt') === 'media') {
        return new Response(remoteContent, { headers: { ETag: currentEtag } });
      }
      if (url.pathname === '/upload/drive/v3/files/file-1' && init.method === 'PATCH') {
        const headers = new Headers(init.headers);
        conditions.push(headers.get('If-Match') ?? 'missing');
        if (firstConflict) {
          firstConflict = false;
          currentEtag = '"v2"';
          return new Response(null, { status: 412 });
        }
        expect(headers.get('If-Match')).toBe('"v2"');
        remoteContent = String(init.body);
        currentEtag = '"v3"';
        return new Response(null, { status: 200, headers: { ETag: currentEtag } });
      }
      throw new Error(`Unexpected Drive request: ${init.method ?? 'GET'} ${url.pathname}`);
    });
    const client = makeClient(fetcher);
    const saved = await client.upsertTextFile({
      name: 'events_2026-11.jsonl', parentId: 'events-folder', mimeType: 'application/x-ndjson',
      knownFile: { id: 'file-1', etag: '"v1"' }, desiredContent: desired, mergeContent: mergeJsonlEventContent,
    });
    const rows = remoteContent.trim().split('\n').map(line => JSON.parse(line) as LearnEvent);
    expect(conditions).toEqual(['"v1"', '"v2"']);
    expect(rows.map(event => event.id)).toEqual([concurrent.id, base.id]);
    expect(saved).toMatchObject({ id: 'file-1', etag: '"v3"' });
    expect(saved.content).toBe(remoteContent);
  });

  it('keeps If-Match on the resumable session when updating a large Drive file', async () => {
    const content = 'x'.repeat(5 * 1024 * 1024 + 1);
    let uploadHeaders: Headers | undefined;
    const fetcher = withGoogleAuth((url, init) => {
      if (url.pathname === '/upload/drive/v3/files/file-1' && url.searchParams.get('uploadType') === 'resumable') {
        uploadHeaders = new Headers(init.headers);
        expect(init.method).toBe('PATCH');
        return new Response(null, { status: 200, headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=update-1' } });
      }
      if (url.searchParams.get('upload_id') === 'update-1') {
        expect(init.method).toBe('PUT');
        expect(init.body).toBe(content);
        return new Response(null, { status: 200, headers: { ETag: '"v2"' } });
      }
      throw new Error(`Unexpected Drive request: ${url.pathname}`);
    });
    const saved = await makeClient(fetcher).upsertTextFile({
      name: 'events_2026-11.jsonl', parentId: 'events-folder', mimeType: 'application/x-ndjson',
      knownFile: { id: 'file-1', etag: '"v1"' }, desiredContent: content,
      mergeContent: (_remote, desired) => desired,
    });
    expect(uploadHeaders?.get('If-Match')).toBe('"v1"');
    expect(saved).toEqual({ id: 'file-1', etag: '"v2"', content });
  });

  it('stops after bounded repeated ETag conflicts instead of overwriting blindly', async () => {
    let version = 0;
    let writes = 0;
    const fetcher = withGoogleAuth((url, init) => {
      if (url.pathname === '/drive/v3/files/file-1' && url.searchParams.get('alt') === 'media') {
        return new Response('{"id":"kept"}\n', { headers: { ETag: `"v${version}"` } });
      }
      if (url.pathname === '/upload/drive/v3/files/file-1' && init.method === 'PATCH') {
        writes += 1;
        version += 1;
        return new Response(null, { status: 412 });
      }
      throw new Error(`Unexpected Drive request: ${url.pathname}`);
    });
    const client = makeClient(fetcher);
    await expect(client.upsertTextFile({
      name: 'events_2026-11.jsonl', parentId: 'events-folder', mimeType: 'application/x-ndjson',
      knownFile: { id: 'file-1', etag: '"v0"' }, desiredContent: '{"id":"new"}\n', mergeContent: (remote, desired) => remote + desired,
    })).rejects.toMatchObject({ code: 'etag_conflict' });
    expect(writes).toBe(3);
  });

  it.each([
    [401, 'reauthorization_required'], [403, 'permission_denied'], [429, 'quota_exceeded'], [503, 'network_error'],
  ] as const)('maps Drive HTTP %i to a sanitized status code', async (status, code) => {
    const client = makeClient(withGoogleAuth(() => new Response(null, { status })));
    await expect(client.ensureRootFolder('Math_Project')).rejects.toBeInstanceOf(DriveMirrorError);
    await expect(client.ensureRootFolder('Math_Project')).rejects.toMatchObject({ code });
  });
});

describe('authenticated Drive status endpoints', () => {
  function request(app: ReturnType<typeof createApp>, path: string, method = 'GET') {
    return app.fetch(new Request(`https://worker.test${path}`, {
      method,
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN },
    }), testEnv);
  }

  it('reports unconfigured Drive without exposing credentials, and rejects unauthenticated status reads', async () => {
    const app = createApp(validVerifier);
    const status = await request(app, '/drive/status');
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ status: 'not_configured', lastSyncedAt: null, pendingCount: 0, quarantinedCount: null, lastError: null });
    const sync = await request(app, '/drive/sync', 'POST');
    expect(sync.status).toBe(503);
    expect(await sync.json()).toMatchObject({ drive: { status: 'not_configured' } });
    const unauthorized = await app.fetch(new Request('https://worker.test/drive/status'), testEnv);
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.text()).not.toContain('refresh_token');
  });
});

describe('Durable Object Drive mirror integration', () => {
  function makeMemoryDrive(options: { failProgressOnce?: boolean } = {}) {
    const contentByName = new Map<string, string>();
    const uploads: Array<{ name: string; parentId: string; content: string; knownFile?: { id: string; etag: string } }> = [];
    const client = {
      ensureRootFolder: async (name: string) => {
        expect(name).toBe('Math_Project');
        return 'root-folder';
      },
      ensureFolder: async (name: string, parentId: string) => {
        if (name === '03_Sync') expect(parentId).toBe('root-folder');
        if (name === 'events' || name === 'state') expect(parentId).toBe('sync-folder');
        return name === '03_Sync' ? 'sync-folder' : name === 'events' ? 'events-folder' : 'state-folder';
      },
      upsertTextFile: async (input: {
        name: string; parentId: string; desiredContent: string; knownFile?: { id: string; etag: string };
      }) => {
        if (options.failProgressOnce && input.name === 'progress.json') {
          options.failProgressOnce = false;
          throw new DriveMirrorError('quota_exceeded');
        }
        uploads.push({ name: input.name, parentId: input.parentId, content: input.desiredContent, knownFile: input.knownFile });
        const content = input.name.startsWith('events_') && contentByName.has(input.name)
          ? mergeJsonlEventContent(contentByName.get(input.name)!, input.desiredContent)
          : input.desiredContent;
        contentByName.set(input.name, content);
        return { id: `file-${input.name}`, etag: `"etag-${uploads.length}"`, content };
      },
    };
    return { client, contentByName, uploads };
  }

  async function appendForOwner(event: LearnEvent): Promise<void> {
    const app = createApp(validVerifier);
    const response = await app.fetch(new Request('https://worker.test/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    }), testEnv);
    expect(response.status).toBe(200);
  }

  async function runMirror(client: object) {
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    return runInDurableObject(stub, async instance => {
      const internals = instance as unknown as { driveClient?: object; performDriveSync: () => Promise<unknown> };
      internals.driveClient = client;
      return internals.performDriveSync();
    });
  }

  it('writes a complete event, progress projection, and hash manifest under the private sync folders', async () => {
    const event = makeEvent(1, {
      type: 'check_answer', questionText: 'What is the domain?', userAnswer: '{1, 2}',
      verdict: 'submitted', verdictSource: 'none', steps: ['read the ordered pairs'],
    });
    await appendForOwner(event);
    const drive = makeMemoryDrive();
    const status = await runMirror(drive.client) as { status: string; pendingCount: number };
    expect(status).toMatchObject({ status: 'synced', pendingCount: 0 });
    expect(drive.uploads.map(upload => upload.name)).toEqual([
      'events_2026-11.jsonl', 'progress.json', 'sync_manifest.json',
    ]);
    expect(drive.uploads[0].parentId).toBe('events-folder');
    expect(drive.uploads[1].parentId).toBe('state-folder');
    const savedEvent = JSON.parse(drive.contentByName.get('events_2026-11.jsonl')!.trim()) as LearnEvent;
    expect(savedEvent).toEqual(event);
    expect(JSON.parse(drive.contentByName.get('progress.json')!)).toMatchObject({
      currentPosition: { chapter: 1, lesson: '1.1', section: '1.1' }, lastEventId: event.id, lastSeq: 1,
    });
    expect(JSON.parse(drive.contentByName.get('sync_manifest.json')!)).toMatchObject({
      lastSeq: 1, lastEventId: event.id,
      files: expect.arrayContaining([
        expect.objectContaining({ path: 'events/events_2026-11.jsonl', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        expect.objectContaining({ path: 'state/progress.json', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      ]),
    });
    expect(drive.uploads.every(upload => !upload.name.includes('DriveSyncFiles'))).toBe(true);
  });

  it('quarantines unclassified events from Drive JSONL and progress while recording the skipped count', async () => {
    const live = makeEvent(1, { type: 'chunk_open', itemId: 'live-position' });
    const testEvent = makeEvent(2, { isTest: true, type: 'chunk_open', itemId: 'test-position' });
    const unclassified = makeEvent(3, { isTest: undefined, type: 'chunk_open', itemId: 'preview-unclassified' });
    await appendForOwner(live);
    await appendForOwner(testEvent);
    await appendForOwner(unclassified);

    const drive = makeMemoryDrive();
    const status = await runMirror(drive.client) as { status: string; pendingCount: number; quarantinedCount: number };
    expect(status).toMatchObject({ status: 'synced', pendingCount: 0, quarantinedCount: 1 });

    const eventLines = drive.contentByName.get('events_2026-11.jsonl')!.trim().split('\n');
    const savedEvents = eventLines.map(line => JSON.parse(line) as LearnEvent);
    expect(savedEvents.map(event => event.id)).toEqual([live.id, testEvent.id]);
    const progress = JSON.parse(drive.contentByName.get('progress.json')!);
    expect(progress).toMatchObject({ lastEventId: live.id, lastSeq: 1 });
    expect(progress.currentPosition.chunkId).toBe('live-position');
    expect(JSON.parse(drive.contentByName.get('sync_manifest.json')!)).toMatchObject({
      lastSeq: 3, lastEventId: unclassified.id, quarantinedEventCount: 1,
    });
  });

  it('recovers from a partial Drive failure without duplicating the event on retry', async () => {
    const event = makeEvent(1, { type: 'exercise_attempt', itemId: 'PC-1.1-L01', userAnswer: 'x=2', verdict: 'submitted', verdictSource: 'none' });
    await appendForOwner(event);
    const drive = makeMemoryDrive({ failProgressOnce: true });
    const failed = await runMirror(drive.client) as { status: string; lastError: string; pendingCount: number };
    expect(failed).toMatchObject({ status: 'error', lastError: 'quota_exceeded', pendingCount: 1 });
    expect(drive.contentByName.get('events_2026-11.jsonl')).toContain(event.id);

    const retried = await runMirror(drive.client) as { status: string; pendingCount: number };
    expect(retried).toMatchObject({ status: 'synced', pendingCount: 0 });
    const lines = drive.contentByName.get('events_2026-11.jsonl')!.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).id).toBe(event.id);
    expect(drive.uploads[1].knownFile).toMatchObject({ id: 'file-events_2026-11.jsonl' });
  });

  it('reads and syncs all 50,000 stored events across 500-row SQL pages', async () => {
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.transactionSync(() => {
        for (let index = 1; index <= 50_000; index += 1) {
          const event = makeEvent(index, { ts: '2026-11-02T00:00:00.000Z' });
          state.storage.sql.exec(
            'INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)',
            event.id, JSON.stringify(event), event.ts,
          );
        }
      });
    });
    const drive = makeMemoryDrive();
    const started = performance.now();
    const status = await runMirror(drive.client) as { status: string; pendingCount: number };
    const elapsedMs = performance.now() - started;
    const eventLines = drive.contentByName.get('events_2026-11.jsonl')!.trim().split('\n');
    expect(status).toMatchObject({ status: 'synced', pendingCount: 0 });
    expect(eventLines).toHaveLength(50_000);
    expect(JSON.parse(eventLines[0]).id).toBe(makeEvent(1).id);
    expect(JSON.parse(eventLines.at(-1)!).id).toBe(makeEvent(50_000).id);
    expect(JSON.parse(drive.contentByName.get('progress.json')!).lastSeq).toBe(50_000);
    expect(JSON.parse(drive.contentByName.get('sync_manifest.json')!).lastSeq).toBe(50_000);
    expect(elapsedMs).toBeLessThan(20_000);
  }, 60_000);
});
