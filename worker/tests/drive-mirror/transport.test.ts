import { describe, expect, it } from 'vitest';
import { type LearnEvent } from '../../../shared/contracts/learn-event';
import { mergeJsonlEventContent, serializeJsonlEvents, sha256Hex } from '../../src/drive-projection';
import { DriveMirrorError } from '../../src/google-drive';
import { snapshotName } from '../../src/immutable-snapshot';
import { makeEvent, sequenced, makeClient, jsonResponse, withGoogleAuth } from '../helpers/drive-mirror';
describe('transport', () => {
  it('writes and reads back a content-addressed snapshot without depending on ETag or PATCH', async () => {
    const logicalName = 'events_2026-11.jsonl';
    const content = '{"id":"event-1"}\n';
    const physicalName = await snapshotName(logicalName, content);
    const requests: Array<{ path: string; method: string; query: string }> = [];
    let created = false;
    let storedContent = '';
    const fetcher = withGoogleAuth((url, init) => {
      const method = init.method ?? 'GET';
      requests.push({ path: url.pathname, method, query: url.search });
      if (url.pathname === '/drive/v3/files' && method === 'GET') {
        return jsonResponse({
          files: created ? [{ id: 'snapshot-1', name: physicalName, mimeType: 'application/x-ndjson', parents: ['events-folder'] }] : [],
        });
      }
      if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
        expect(String(init.body)).toContain(physicalName);
        expect(String(init.body)).toContain('"msOwner":"math-scratchpad"');
        expect(String(init.body)).toContain('"msKind":"events"');
        created = true;
        storedContent = content;
        return jsonResponse({
          id: 'snapshot-1',
          name: physicalName,
          mimeType: 'application/x-ndjson',
          parents: ['events-folder'],
          appProperties: { msOwner: 'math-scratchpad', msKind: 'events' },
        });
      }
      if (url.pathname === '/drive/v3/files/snapshot-1' && url.searchParams.get('alt') === 'media') {
        return new Response(storedContent, { status: 200 });
      }
      throw new Error(`Unexpected Drive request: ${method} ${url.pathname}`);
    });
    const saved = await makeClient(fetcher).writeImmutableTextFile({
      logicalName,
      parentId: 'events-folder',
      mimeType: 'application/x-ndjson',
      content,
    });
    expect(saved).toMatchObject({ id: 'snapshot-1', name: physicalName, sha256: await sha256Hex(content) });
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
    expect(requests.filter((request) => request.path === '/drive/v3/files/snapshot-1').map((request) => request.query)).toContain(
      '?alt=media',
    );
  });

  it('uses resumable uploads above 5 MB and verifies the created file metadata', async () => {
    const content = 'x'.repeat(5 * 1024 * 1024 + 1);
    const requests: Array<{
      path: string;
      method: string;
      uploadLength?: string;
      ifMatch?: string;
      bodyLength: number;
      metadata?: string;
    }> = [];
    const fetcher = withGoogleAuth((url, init) => {
      const headers = new Headers(init.headers);
      const body = typeof init.body === 'string' ? init.body : '';
      requests.push({
        path: url.pathname,
        method: init.method ?? 'GET',
        uploadLength: headers.get('X-Upload-Content-Length') ?? undefined,
        ifMatch: headers.get('If-Match') ?? undefined,
        bodyLength: body.length,
        metadata: url.pathname === '/upload/drive/v3/files' && init.method === 'POST' ? body : undefined,
      });
      if (url.pathname === '/drive/v3/files' && init.method === 'GET') return jsonResponse({ files: [] });
      if (url.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
        expect(headers.get('X-Upload-Content-Type')).toBe('application/x-ndjson');
        return new Response(null, {
          status: 200,
          headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test-upload' },
        });
      }
      if (url.searchParams.get('upload_id') === 'test-upload' && init.method === 'PUT') {
        return jsonResponse(
          {
            id: 'large-file',
            name: 'events_2026-11.jsonl',
            mimeType: 'application/x-ndjson',
            parents: ['events-folder'],
            appProperties: { msOwner: 'math-scratchpad', msKind: 'events' },
          },
          200,
          { ETag: '"large-v1"' },
        );
      }
      throw new Error(`Unexpected Drive request: ${init.method ?? 'GET'} ${url.pathname}`);
    });
    const client = makeClient(fetcher);
    const saved = await client.upsertTextFile({
      name: 'events_2026-11.jsonl',
      parentId: 'events-folder',
      mimeType: 'application/x-ndjson',
      desiredContent: content,
      mergeContent: (_remote, desired) => desired,
    });
    expect(saved).toEqual({ id: 'large-file', etag: '"large-v1"', content });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'POST', 'PUT']);
    expect(requests[1]).toMatchObject({ uploadLength: String(5 * 1024 * 1024 + 1), bodyLength: expect.any(Number) });
    expect(JSON.parse(requests[1].metadata!).appProperties).toEqual({ msOwner: 'math-scratchpad', msKind: 'events' });
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
      name: 'events_2026-11.jsonl',
      parentId: 'events-folder',
      mimeType: 'application/x-ndjson',
      knownFile: { id: 'file-1', etag: '"v1"' },
      desiredContent: desired,
      mergeContent: mergeJsonlEventContent,
    });
    const rows = remoteContent
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as LearnEvent);
    expect(conditions).toEqual(['"v1"', '"v2"']);
    expect(rows.map((event) => event.id)).toEqual([concurrent.id, base.id]);
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
        return new Response(null, {
          status: 200,
          headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=update-1' },
        });
      }
      if (url.searchParams.get('upload_id') === 'update-1') {
        expect(init.method).toBe('PUT');
        expect(init.body).toBe(content);
        return new Response(null, { status: 200, headers: { ETag: '"v2"' } });
      }
      throw new Error(`Unexpected Drive request: ${url.pathname}`);
    });
    const saved = await makeClient(fetcher).upsertTextFile({
      name: 'events_2026-11.jsonl',
      parentId: 'events-folder',
      mimeType: 'application/x-ndjson',
      knownFile: { id: 'file-1', etag: '"v1"' },
      desiredContent: content,
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
    await expect(
      client.upsertTextFile({
        name: 'events_2026-11.jsonl',
        parentId: 'events-folder',
        mimeType: 'application/x-ndjson',
        knownFile: { id: 'file-1', etag: '"v0"' },
        desiredContent: '{"id":"new"}\n',
        mergeContent: (remote, desired) => remote + desired,
      }),
    ).rejects.toMatchObject({ code: 'etag_conflict' });
    expect(writes).toBe(3);
  });

  it.each([
    [401, 'reauthorization_required'],
    [403, 'permission_denied'],
    [429, 'quota_exceeded'],
    [503, 'network_error'],
  ] as const)('maps Drive HTTP %i to a sanitized status code', async (status, code) => {
    const client = makeClient(withGoogleAuth(() => new Response(null, { status })));
    await expect(client.ensureRootFolder('Math_Project')).rejects.toBeInstanceOf(DriveMirrorError);
    await expect(client.ensureRootFolder('Math_Project')).rejects.toMatchObject({ code });
  });
});
