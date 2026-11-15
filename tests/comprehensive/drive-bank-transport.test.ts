import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BANK_SCHEMA,
  EMPTY_BANK,
  driveError,
  metaFingerprint,
  readDriveMeta,
  readPrivateBank,
  readPrivateBankText,
} from '../../src/features/drive-bank/drive-bank';
import { getConfig, saveConfig, requestToken, pickFile, DRIVE_SCOPE } from '../../src/features/drive-bank/google';
import { GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID } from '../../src/features/drive-bank/drive-config';
import { permittedAccount } from '../../src/features/drive-bank/identity';

const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, mode: 'math', source: '1+2', ...extra });
const bank = (extra: Record<string, unknown> = {}) => ({
  schema_version: BANK_SCHEMA,
  bank_id: 'B1',
  version: 'v1',
  questions: [q('Q01')],
  ...extra,
});
const INVALID = 'Invalid bank',
  KEY = 'answer-like content was removed';
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete window.google;
});

describe('Drive HTTP helpers', () => {
  const meta = {
    id: 'abcdefghij12',
    name: 'b.json',
    mimeType: 'application/json',
    md5Checksum: 'm',
    headRevisionId: 'r',
    version: '1',
    size: '10',
    modifiedTime: 't',
  };
  it.each([
    [401, 'expired'],
    [403, '(403)'],
    [404, '(404)'],
    [429, '429'],
    [500, '500'],
    [503, '503'],
    [418, '(418)'],
  ])('driveError %i', (code, text) => expect(driveError(code, 'X').message).toContain(text));
  it.each(['short', 'has space 12345', '../../etc/passwd', 'a'.repeat(151)])('rejects invalid file id %j without fetching', async (id) => {
    const f = vi.spyOn(globalThis, 'fetch');
    await expect(readDriveMeta(id, 't')).rejects.toThrow('Invalid Google Drive file ID');
    await expect(readPrivateBankText(id, 't')).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it('sends bearer token, no-store and requests only metadata fields', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(meta)));
    await readDriveMeta(meta.id, 'TOK');
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain(`/files/${meta.id}?fields=`);
    expect(String(url)).not.toContain('alt=media');
    expect(init).toMatchObject({ headers: { Authorization: 'Bearer TOK' }, cache: 'no-store' });
  });
  it('rejects trashed files and Google Docs', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...meta, trashed: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...meta, mimeType: 'application/vnd.google-apps.document' })));
    await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('Google Drive trash');
    await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('Google Doc');
  });
  it('maps HTTP errors for metadata and content', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('denied access (403)');
    await expect(readPrivateBankText(meta.id, 't')).rejects.toThrow('(404)');
  });
  it('readPrivateBank parses downloaded text', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(bank())))
      .mockResolvedValueOnce(new Response(''));
    expect(await readPrivateBank(meta.id, 't')).toMatchObject({ bank_id: 'B1' });
    expect(await readPrivateBank(meta.id, 't')).toBe(EMPTY_BANK);
  });
  it('metaFingerprint changes when any revision field changes', () => {
    const base = metaFingerprint(meta);
    for (const k of ['md5Checksum', 'headRevisionId', 'version', 'size', 'modifiedTime', 'id'] as const)
      expect(metaFingerprint({ ...meta, [k]: 'changed' })).not.toBe(base);
    expect(metaFingerprint({ ...meta, name: 'renamed' })).toBe(base);
  });
});

describe('Google config and auth helpers', () => {
  it('uses built-in identifiers and only stores fileId/fileName', () => {
    localStorage.setItem(
      'math-scratchpad-drive-config-v1',
      JSON.stringify({ clientId: 'old', apiKey: 'old', appId: '1', fileId: 'F', fileName: 'n', extra: 1 }),
    );
    expect(getConfig()).toEqual({ clientId: GOOGLE_CLIENT_ID, apiKey: GOOGLE_API_KEY, appId: GOOGLE_APP_ID, fileId: 'F', fileName: 'n' });
    saveConfig({ fileId: 'G', fileName: 'm', ...({ apiKey: 'leak' } as object) } as never);
    expect(JSON.parse(localStorage.getItem('math-scratchpad-drive-config-v1')!)).toEqual({ fileId: 'G', fileName: 'm' });
  });
  it('tolerates corrupt, null and wrongly-typed stored config', () => {
    for (const raw of ['{bad', 'null', '[]', JSON.stringify({ fileId: 5 })]) {
      localStorage.setItem('math-scratchpad-drive-config-v1', raw);
      expect(getConfig().fileId).toBe('');
    }
  });
  it('built-in identifiers have valid shapes', () => {
    expect(GOOGLE_CLIENT_ID).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
    expect(GOOGLE_APP_ID).toMatch(/^\d+$/);
    expect(GOOGLE_CLIENT_ID.startsWith(GOOGLE_APP_ID + '-')).toBe(true);
    expect(GOOGLE_API_KEY).toMatch(/^AIza[\w-]{35}$/);
  });
  const oauth = (resp: Record<string, unknown>, granted = true) => {
    const init = vi.fn((cfg: { callback: (r: unknown) => void }) => ({ requestAccessToken: () => cfg.callback(resp) }));
    window.google = { accounts: { oauth2: { initTokenClient: init, hasGrantedAllScopes: () => granted } } };
    return init;
  };
  it('requestToken reports when GIS is not loaded', () => {
    const done = vi.fn();
    requestToken('c', {}, done);
    expect(done.mock.calls[0][0].error).toContain('آماده نیست');
  });
  it('requestToken returns a token that expires a minute early, and asks for drive.file only', () => {
    const init = oauth({ access_token: 'A', expires_in: '3600' });
    const done = vi.fn();
    const t0 = Date.now();
    requestToken('cid', { hint: 'h' }, done);
    const tok = done.mock.calls[0][0].token;
    expect(tok.accessToken).toBe('A');
    expect(tok.expiresAt).toBeGreaterThanOrEqual(t0 + 3540000 - 5);
    expect(tok.expiresAt).toBeLessThanOrEqual(Date.now() + 3540000);
    expect(init.mock.calls[0][0]).toMatchObject({ client_id: 'cid', login_hint: 'h' });
    expect((init.mock.calls[0][0] as unknown as { scope: string }).scope).toContain(DRIVE_SCOPE);
    expect((init.mock.calls[0][0] as unknown as { scope: string }).scope).not.toMatch(/auth\/drive(\s|$)/);
  });
  it('requestToken explains access_denied, other errors and a missing Drive grant', () => {
    let done = vi.fn();
    oauth({ error: 'access_denied' });
    requestToken('c', {}, done);
    expect(done.mock.calls[0][0].error).toContain('test user');
    done = vi.fn();
    oauth({ error: 'invalid_client' });
    requestToken('c', {}, done);
    expect(done.mock.calls[0][0].error).toContain('invalid_client');
    done = vi.fn();
    oauth({ access_token: 'A' }, false);
    requestToken('c', {}, done);
    expect(done.mock.calls[0][0].error).toContain('Drive');
  });
  it('requestToken maps popup errors', () => {
    for (const [type, text] of [
      ['popup_closed', 'closed'],
      ['popup_failed_to_open', 'Pop-ups'],
      ['weird', 'failed'],
    ]) {
      const done = vi.fn();
      window.google = {
        accounts: {
          oauth2: {
            initTokenClient: (cfg: { error_callback: (e: unknown) => void }) => ({
              requestAccessToken: () => cfg.error_callback({ type }),
            }),
          },
        },
      };
      requestToken('c', {}, done);
      expect(done.mock.calls[0][0].error).toContain(text);
    }
  });
  it('pickFile reports a missing Picker, picked file and cancel', () => {
    let done = vi.fn();
    pickFile(getConfig(), 't', done);
    expect(done.mock.calls[0][0].error).toContain('Picker');
    const make = (result: unknown) => ({
      ViewId: { DOCS: 'd' },
      DocsViewMode: { LIST: 'l' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      DocsView: class {
        setMimeTypes() {
          return this;
        }
        setMode() {
          return this;
        }
        setQuery() {
          return this;
        }
      },
      PickerBuilder: class {
        cb: (d: unknown) => void = () => undefined;
        addView() {
          return this;
        }
        setOAuthToken() {
          return this;
        }
        setDeveloperKey(k: string) {
          expect(k).toBe(GOOGLE_API_KEY);
          return this;
        }
        setAppId(a: string) {
          expect(a).toBe(GOOGLE_APP_ID);
          return this;
        }
        setOrigin() {
          return this;
        }
        setLocale(locale: string) {
          expect(locale).toBe('en');
          return this;
        }
        setTitle(title: string) {
          expect(title).toBe('Select MATH_QUESTION_BANK.json');
          return this;
        }
        setCallback(cb: (d: unknown) => void) {
          this.cb = cb;
          return this;
        }
        build() {
          return { setVisible: () => this.cb(result) };
        }
      },
    });
    done = vi.fn();
    window.google = { picker: make({ action: 'picked', docs: [{ id: 'F1', name: 'n' }] }) };
    pickFile(getConfig(), 't', done);
    expect(done.mock.calls[0][0]).toEqual({ id: 'F1', name: 'n' });
    done = vi.fn();
    window.google = { picker: make({ action: 'picked', docs: [] }) };
    pickFile(getConfig(), 't', done);
    expect(done.mock.calls[0][0].error).toBeTruthy();
    done = vi.fn();
    window.google = { picker: make({ action: 'cancel' }) };
    pickFile(getConfig(), 't', done);
    expect(done.mock.calls[0][0].error).toContain('canceled');
    done = vi.fn();
    window.google = { picker: make({ action: 'loaded' }) };
    pickFile(getConfig(), 't', done);
    expect(done).not.toHaveBeenCalled();
  });
  it('permittedAccount requires a verified, matching email', async () => {
    for (const p of [null, {}, { email: 'x@y.z' }, { email: 'x@y.z', email_verified: 'true' }, { email: 5, email_verified: true }])
      expect(await permittedAccount(p)).toBe(false);
    expect(await permittedAccount({ email: 'someone@example.com', email_verified: true })).toBe(false);
  });
});
