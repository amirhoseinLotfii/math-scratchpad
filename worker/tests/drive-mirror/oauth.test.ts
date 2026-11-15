import { describe, expect, it, vi } from 'vitest';
import { GoogleDriveClient } from '../../src/google-drive';
import type { WorkerEnv } from '../../src/env';
import { OWNER_EMAIL, makeClient, jsonResponse, withGoogleAuth } from '../helpers/drive-mirror';
describe('Google Drive REST client', () => {
  it.each([
    [401, 'invalid_client'],
    [400, 'invalid_grant'],
    [400, 'unexpected_nonpublic_error'],
  ] as const)('records only an allowlisted OAuth error after HTTP %i (%s)', async (status, code) => {
    const client = makeClient((async () =>
      jsonResponse(
        {
          error: code,
          error_description: 'sensitive service response detail',
        },
        status,
      )) as typeof fetch);
    await expect(client.ensureRootFolder('Math_Project')).rejects.toMatchObject({ code: 'reauthorization_required' });
    expect(client.diagnosticStage).toBe(`oauth_refresh_http_${status}_${code === 'unexpected_nonpublic_error' ? 'unknown' : code}`);
    expect(client.diagnosticStage).not.toContain('sensitive');
  });

  it('binds native Cloudflare fetch to globalThis instead of the client receiver', async () => {
    const runtimeFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async function (
      this: unknown,
      input: RequestInfo | URL,
      _init?: RequestInit,
    ) {
      // workerd raises Illegal invocation when fetch is called as client.fetcher(...)
      // without first binding the original global receiver.
      expect(this).toBe(globalThis);
      const path = new URL(String(input)).pathname;
      if (path === '/token') return jsonResponse({ access_token: 'fake-access-token', expires_in: 3600 });
      if (path === '/drive/v3/about') return jsonResponse({ user: { emailAddress: OWNER_EMAIL, me: true } });
      return jsonResponse({
        files: [{ id: 'root-folder', name: 'Math_Project', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }],
      });
    });
    const client = new GoogleDriveClient({
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      GOOGLE_DRIVE_CLIENT_SECRET: 'dummy',
      GOOGLE_DRIVE_REFRESH_TOKEN: 'dummy',
      OWNER_EMAIL,
    } as WorkerEnv);
    expect(await client.ensureRootFolder('Math_Project')).toBe('root-folder');
    expect(runtimeFetch).toHaveBeenCalledTimes(3);
  });

  it.each(['oauth_refresh_fetch_rejected', 'drive_owner_verification_fetch_rejected', 'drive_folder_lookup_fetch_rejected'] as const)(
    'identifies the failed Google request stage without exposing credentials (%s)',
    async (failingStage) => {
      const fetcher = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === '/token') {
          if (failingStage === 'oauth_refresh_fetch_rejected') throw new TypeError('connection interrupted');
          return jsonResponse({ access_token: 'fake-access-token', expires_in: 3600 });
        }
        if (url.pathname === '/drive/v3/about') {
          if (failingStage === 'drive_owner_verification_fetch_rejected') throw new TypeError('connection interrupted');
          return jsonResponse({ user: { emailAddress: OWNER_EMAIL, me: true } });
        }
        throw new TypeError('connection interrupted');
      }) as typeof fetch;
      const client = makeClient(fetcher);
      await expect(client.ensureRootFolder('Math_Project')).rejects.toMatchObject({ code: 'network_error' });
      expect(client.diagnosticStage).toBe(failingStage);
    },
  );

  it.each([
    { status: 400, body: JSON.stringify({ error: { message: 'invalid query' } }), expected: 'drive_folder_lookup_http_400' },
    { status: 200, body: 'not-json', expected: 'drive_folder_lookup_http_200' },
  ])('reports a sanitized Drive lookup operation and HTTP status ($expected)', async ({ status, body, expected }) => {
    const fetcher = withGoogleAuth(() => new Response(body, { status }));
    const client = makeClient(fetcher);
    await expect(client.ensureRootFolder('Math_Project')).rejects.toMatchObject({ code: 'invalid_response' });
    expect(client.diagnosticStage).toBe(expected);
    expect(client.diagnosticStage).not.toContain('Math_Project');
    expect(client.diagnosticStage).not.toContain('invalid query');
  });

  it('refreshes the app token, verifies the exact owner, and refuses another account before Drive access', async () => {
    const fetcher = withGoogleAuth(
      () => {
        throw new Error('Drive must not be called');
      },
      { email: 'other@example.com', email_verified: true },
    );
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
        expect(body).toContain('"msOwner":"math-scratchpad"');
        expect(body).toContain('"msKind":"events"');
        return jsonResponse(
          {
            id: 'new-file',
            name: 'events_2026-11.jsonl',
            mimeType: 'application/x-ndjson',
            parents: ['events-folder'],
            appProperties: { msOwner: 'math-scratchpad', msKind: 'events' },
          },
          200,
          { ETag: '"v1"' },
        );
      }
      throw new Error(`Unexpected Drive request: ${method} ${url.pathname}`);
    });
    const client = makeClient(fetcher);
    const saved = await client.upsertTextFile({
      name: 'events_2026-11.jsonl',
      parentId: 'events-folder',
      mimeType: 'application/x-ndjson',
      desiredContent: '{"id":"event-1"}\n',
      mergeContent: (remote, desired) => remote + desired,
    });
    expect(saved).toEqual({ id: 'new-file', etag: '"v1"', content: '{"id":"event-1"}\n' });
    expect(requests.some((request) => request.path.endsWith('/permissions'))).toBe(false);
    expect(requests.at(-1)?.body).toContain('events-folder');
  });
});
