import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBankViaWorker } from '../../src/features/drive-bank/worker-bank';
import { SYNC_API_ORIGIN } from '../../src/sync/sync-config';
import { exchangeIdTokenForWorkerSession, getWorkerSession, resetWorkerSessionForTests } from '../../src/sync/worker-session';

const SESSION = `mss1.${'C'.repeat(43)}`;
const FILE_ID = 'bankFile_0123456789';
const META = { id: FILE_ID, name: 'MATH_QUESTION_BANK.json', mimeType: 'application/json', md5Checksum: 'abc' };

async function withSession() {
  await resetWorkerSessionForTests({
    fetcher: (async () => Response.json({ sessionToken: SESSION, expiresAt: Date.now() + 7 * 86_400_000 }, { status: 201 })) as unknown as typeof fetch,
  });
  await exchangeIdTokenForWorkerSession('header.payload.signature');
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetWorkerSessionForTests();
});

describe('question bank through the Worker', () => {
  it('falls back (undefined) without a session and never calls the Worker', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await readBankViaWorker(FILE_ID, '', false)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers the picked file once when the Worker has none, then reads with the session', async () => {
    await withSession();
    let registered = false;
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      requests.push(`${init.method ?? 'GET'} ${url.replace(SYNC_API_ORIGIN, '')}`);
      expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${SESSION}`);
      if (url.endsWith('/bank/source')) {
        expect(JSON.parse(String(init.body))).toEqual({ fileId: FILE_ID, fileName: 'MATH_QUESTION_BANK.json' });
        registered = true;
        return Response.json({ fileId: FILE_ID, meta: META });
      }
      if (!registered) return Response.json({ error: 'bank_source_not_registered' }, { status: 404 });
      return Response.json({ fileId: FILE_ID, fileName: META.name, meta: META, text: '{"x":1}' });
    }));
    expect(await readBankViaWorker(FILE_ID, 'MATH_QUESTION_BANK.json', true)).toEqual({ fileId: FILE_ID, meta: META, text: '{"x":1}' });
    expect(requests).toEqual(['GET /bank/content', 'POST /bank/source', 'GET /bank/content']);
  });

  it('returns undefined when the Worker cannot read Drive, so the client Drive token is used', async () => {
    await withSession();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'drive_not_configured' }, { status: 503 })));
    expect(await readBankViaWorker(FILE_ID, '', false)).toBeUndefined();
  });

  it('forgets a rejected session', async () => {
    await withSession();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'session_invalid' }, { status: 401 })));
    expect(await readBankViaWorker(FILE_ID, '', false)).toBeUndefined();
    await vi.waitFor(() => expect(getWorkerSession()).toBeUndefined());
  });

  it('reports bank file problems instead of silently falling back', async () => {
    await withSession();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bank_trashed' }, { status: 422 })));
    await expect(readBankViaWorker(FILE_ID, '', false)).rejects.toThrow('trash');
  });
});
