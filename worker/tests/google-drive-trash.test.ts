import { describe, expect, it } from 'vitest';
import { GoogleDriveClient } from '../src/google-drive';
import type { WorkerEnv } from '../src/env';

const OWNER_EMAIL = 'amirhoseinlotfalizadeprogramer@gmail.com';
const FILE_ID = 'learning-event-1';
const PARENT_ID = 'events-folder';

function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

function batchResponse(status: number, payload: unknown): Response {
  const boundary = 'drive-batch-response-test';
  const body = [
    `--${boundary}\r\n`,
    'Content-Type: application/http\r\n',
    'Content-ID: <response-trash-learning-mirror>\r\n\r\n',
    `HTTP/1.1 ${status} ${status === 200 ? 'OK' : 'Forbidden'}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    `${JSON.stringify(payload)}\r\n`,
    `--${boundary}--\r\n`,
  ].join('');
  return new Response(body, { headers: { 'Content-Type': `multipart/mixed; boundary="${boundary}"` } });
}

function makeClient(fetchDrive: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://oauth2.googleapis.com/token') {
      return jsonResponse({ access_token: 'fake-access-token', expires_in: 3600 });
    }
    if (url.href === 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,me)') {
      return jsonResponse({ user: { emailAddress: OWNER_EMAIL, me: true } });
    }
    calls.push({ url, init });
    return fetchDrive(url, init);
  }) as typeof fetch;
  const env = {
    OWNER_EMAIL,
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_DRIVE_CLIENT_SECRET: 'not-a-real-secret',
    GOOGLE_DRIVE_REFRESH_TOKEN: 'not-a-real-token',
  } as WorkerEnv;
  return { client: new GoogleDriveClient(env, fetcher, () => Date.UTC(2026, 10, 12)), calls };
}

function fileMetadataResponse(trashed = false): Response {
  return jsonResponse({ id: FILE_ID, mimeType: 'application/x-ndjson', parents: [PARENT_ID], trashed });
}

describe('Google Drive learning mirror trash', () => {
  it('trashes a verified direct child through the supported Drive batch endpoint and verifies its result', async () => {
    const { client, calls } = makeClient(async (url, init) => {
      if (url.pathname === `/drive/v3/files/${FILE_ID}` && init.method === 'GET') return fileMetadataResponse();
      if (url.href === 'https://www.googleapis.com/batch/drive/v3' && init.method === 'POST') {
        const headers = new Headers(init.headers);
        expect(headers.get('Content-Type')).toMatch(/^multipart\/mixed; boundary=mathscratchpad_reset_/);
        const body = String(init.body);
        expect(body).toContain(`PATCH /drive/v3/files/${FILE_ID}?fields=id%2Ctrashed%2Cparents HTTP/1.1`);
        expect(body).toContain('{"trashed":true}');
        return batchResponse(200, { id: FILE_ID, trashed: true, parents: [PARENT_ID] });
      }
      throw new Error(`Unexpected Drive request: ${init.method} ${url.pathname}`);
    });

    await expect(client.trashFileInFolder(FILE_ID, PARENT_ID)).resolves.toBe(true);

    expect(calls.map(({ url, init }) => `${init.method} ${url.pathname}`)).toEqual([
      `GET /drive/v3/files/${FILE_ID}`,
      'POST /batch/drive/v3',
    ]);
  });

  it('does not issue a second trash request when the verified file is already trashed', async () => {
    const { client, calls } = makeClient(async (_url, init) => {
      expect(init.method).toBe('GET');
      return fileMetadataResponse(true);
    });

    await expect(client.trashFileInFolder(FILE_ID, PARENT_ID)).resolves.toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('maps a batch subrequest error to a sanitized Drive error and status stage', async () => {
    const { client } = makeClient(async (url, init) => {
      if (init.method === 'GET') return fileMetadataResponse();
      expect(url.href).toBe('https://www.googleapis.com/batch/drive/v3');
      return batchResponse(403, { error: { message: 'private service response detail' } });
    });

    await expect(client.trashFileInFolder(FILE_ID, PARENT_ID)).rejects.toMatchObject({ code: 'permission_denied' });
    expect(client.diagnosticStage).toBe('drive_trash_batch_http_403');
    expect(client.diagnosticStage).not.toContain('private');
  });

  it('records only an allowlisted transport cause when the Drive trash request is rejected', async () => {
    const failure = new TypeError('private request details and credentials');
    Object.defineProperty(failure, 'cause', {
      value: { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'private nested transport detail' },
    });
    const { client } = makeClient(async (_url, init) => {
      if (init.method === 'GET') return fileMetadataResponse();
      throw failure;
    });

    await expect(client.trashFileInFolder(FILE_ID, PARENT_ID)).rejects.toMatchObject({ code: 'network_error' });
    expect(client.diagnosticStage).toBe('drive_trash_fetch_rejected_connect_timeout');
    expect(client.diagnosticStage).not.toContain('private');
    expect(client.diagnosticStage).not.toContain('credentials');
  });

  it('rejects malformed batch responses instead of treating the file as trashed', async () => {
    const { client } = makeClient(async (url, init) => {
      if (init.method === 'GET') return fileMetadataResponse();
      expect(url.href).toBe('https://www.googleapis.com/batch/drive/v3');
      return jsonResponse({ id: FILE_ID, trashed: true, parents: [PARENT_ID] });
    });

    await expect(client.trashFileInFolder(FILE_ID, PARENT_ID)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(client.diagnosticStage).toBe('drive_trash_http_200');
  });

  it('refuses to trash a file outside the verified parent folder', async () => {
    const { client, calls } = makeClient(async (_url, init) => {
      expect(init.method).toBe('GET');
      return jsonResponse({ id: FILE_ID, mimeType: 'application/x-ndjson', parents: ['different-folder'], trashed: false });
    });

    await expect(client.trashFileInFolder(FILE_ID, PARENT_ID)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(calls).toHaveLength(1);
  });
});
