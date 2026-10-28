import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { BANK_SCHEMA, EMPTY_BANK, ARCHIVE_KEY, archiveSession, bankDocument, driveError, metaFingerprint, parseBankText, readArchive, readDriveMeta, readPrivateBank, readPrivateBankText, snapshotVersion, validateBank } from '../../src/features/drive-bank/drive-bank';
import { getConfig, saveConfig, requestToken, pickFile, DRIVE_SCOPE } from '../../src/features/drive-bank/google';
import { GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID } from '../../src/features/drive-bank/drive-config';
import { permittedAccount } from '../../src/features/drive-bank/identity';
import { initialState } from '../../src/store';
import { validateSession } from '../../src/persistence';

const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, mode: 'math', source: '1+2', ...extra });
const bank = (extra: Record<string, unknown> = {}) => ({ schema_version: BANK_SCHEMA, bank_id: 'B1', version: 'v1', questions: [q('Q01')], ...extra });
const INVALID = 'شناسه، نسخه یا ساختار بانک معتبر نیست.', BADQ = 'متن، قالب یا شناسهٔ سؤال معتبر نیست.', KEY = 'بانک سؤال نباید پاسخ یا کلید داشته باشد.';
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); delete window.google; });

describe('validateBank: top level', () => {
  it('accepts a minimal valid bank and an empty question list', () => { expect(validateBank(bank()).questions).toHaveLength(1); expect(validateBank(bank({ questions: [] })).questions).toEqual([]); });
  it.each([null, undefined, 1, 'x', [], [bank()]])('rejects non-object %j', v => expect(() => validateBank(v)).toThrow('ساختار بانک معتبر نیست.'));
  it.each([
    ['missing schema_version', { schema_version: undefined }], ['wrong schema_version', { schema_version: 'math-scratchpad.bank/2.0' }],
    ['missing bank_id', { bank_id: undefined }], ['bank_id with space', { bank_id: 'B 1' }], ['bank_id with slash', { bank_id: 'a/b' }], ['bank_id too long', { bank_id: 'a'.repeat(81) }], ['empty bank_id', { bank_id: '' }], ['numeric bank_id', { bank_id: 5 }],
    ['missing version', { version: undefined }], ['numeric version', { version: 3 }], ['version with unicode', { version: 'نسخه' }],
    ['questions not array', { questions: {} }], ['41 questions', { questions: Array.from({ length: 41 }, (_, i) => q(`Q${i}`)) }],
  ])('rejects %s', (_, patch) => expect(() => validateBank(bank(patch))).toThrow(INVALID));
  it('accepts exactly 40 questions and ids with . - _', () => { expect(validateBank(bank({ bank_id: 'GEN-2026.10_28', questions: Array.from({ length: 40 }, (_, i) => q(`Q-${i}.a_b`)) })).questions).toHaveLength(40); });
  it('drops unknown fields from output', () => { const out = validateBank(bank({ extra: 1, questions: [q('Q1', { note: 'x' })] })); expect(out).not.toHaveProperty('extra'); expect(out.questions[0]).not.toHaveProperty('note'); });
});

describe('validateBank: questions', () => {
  it.each([
    ['bad id', q('Q 1')], ['empty id', q('')], ['numeric id', { ...q('x'), id: 1 }], ['bad mode', q('Q1', { mode: 'latex' })], ['missing mode', { id: 'Q1', source: '1' }],
    ['empty source', q('Q1', { source: '  ' })], ['source too long', q('Q1', { mode: 'text', source: 'a'.repeat(4001) })], ['numeric source', q('Q1', { source: 1 })],
    ['numeric prompt', q('Q1', { prompt: 3 })], ['prompt too long', q('Q1', { prompt: 'a'.repeat(4000) })],
  ])('rejects %s', (_, item) => expect(() => validateBank(bank({ questions: [item] }))).toThrow(BADQ));
  it.each([null, 'x', [1]])('rejects non-object question %j', item => expect(() => validateBank(bank({ questions: [item] }))).toThrow('ساختار سؤال معتبر نیست.'));
  it('rejects duplicate question ids', () => expect(() => validateBank(bank({ questions: [q('A'), q('A')] }))).toThrow(BADQ));
  it.each(['answer', 'answers', 'expected', 'solution', 'key', 'rubric', 'verification', 'ANSWER', 'Solution'])('rejects forbidden question field %s', k => expect(() => validateBank(bank({ questions: [q('Q1', { [k]: '3' })] }))).toThrow(KEY));
  it('rejects forbidden field even when its value is empty/null', () => expect(() => validateBank(bank({ questions: [q('Q1', { answer: null })] }))).toThrow(KEY));
  it('math mode sources must parse, text mode sources are free text', () => {
    expect(() => validateBank(bank({ questions: [q('Q1', { source: '(1+2' })] }))).toThrow('Close the parenthesis.');
    expect(validateBank(bank({ questions: [q('Q1', { mode: 'text', source: 'یک عدد [ ] بنویس |x|' })] })).questions[0].mode).toBe('text');
    expect(validateBank(bank({ questions: [q('Q1', { source: '۱+۲' })] })).questions[0].source).toBe('۱+۲');
  });
  it('keeps prompt only when it is a string', () => { expect(validateBank(bank({ questions: [q('Q1', { prompt: 'حل کن' })] })).questions[0].prompt).toBe('حل کن'); expect(validateBank(bank()).questions[0]).not.toHaveProperty('prompt'); });
  // BUG-9: forbidden-key check only looks at exact keys on each question. Top-level keys and variants are silently accepted (and dropped), so a bank with keys is not flagged.
  test.fails('BUG-9 rejects a top-level answers/key field', () => expect(() => validateBank(bank({ answers: { Q01: '3' } }))).toThrow(KEY));
  test.fails('BUG-9 rejects variant field names like answer_key / final_answer', () => expect(() => validateBank(bank({ questions: [q('Q1', { answer_key: '3' })] }))).toThrow(KEY));
});

describe('parseBankText', () => {
  it('empty, whitespace and BOM-only files are EMPTY_BANK', () => { for (const t of ['', '  \n', '\uFEFF', '\uFEFF  ']) expect(parseBankText(t)).toBe(EMPTY_BANK); });
  it('accepts a BOM-prefixed JSON bank', () => expect(parseBankText('\uFEFF' + JSON.stringify(bank()))).not.toBe(EMPTY_BANK));
  it.each(['{', 'not json', '{"a":1,}', "{'a':1}"])('invalid JSON %j gives the Persian JSON error', t => expect(() => parseBankText(t)).toThrow('JSON معتبر نیست'));
  it('rejects files over 1,000,000 characters before parsing', () => expect(() => parseBankText(' '.repeat(1000001))).toThrow('بیش از حد بزرگ'));
  it('reproduces the missing schema_version incident', () => { const b: Record<string, unknown> = bank(); delete b.schema_version; expect(() => parseBankText(JSON.stringify(b))).toThrow(INVALID); });
  it('reproduces the bracket incident: one bad question rejects the whole file', () => expect(() => parseBankText(JSON.stringify(bank({ questions: [q('A'), q('N2c-PL02', { source: '20-[3\\times(5-2)]' })] })))).toThrow('Unsupported input near ['));
});

describe('snapshotVersion and bankDocument', () => {
  it('is deterministic and changes with content', async () => {
    const a = validateBank(bank()); expect(await snapshotVersion(a)).toBe(await snapshotVersion(validateBank(bank())));
    expect(await snapshotVersion(a)).toMatch(/^v1-[0-9a-f]{16}$/);
    expect(await snapshotVersion(a)).not.toBe(await snapshotVersion(validateBank(bank({ questions: [q('Q01', { prompt: 'p' })] }))));
  });
  it('snapshot version stays within the session id limit and survives persistence', async () => {
    const b = validateBank(bank({ version: 'v'.repeat(80) })); const v = await snapshotVersion(b); const doc = bankDocument(b, v);
    expect(validateSession({ version: 2, doc }).doc.session?.bankVersion).toBe(v);
  });
  it('bankDocument makes one blank step per question with bank ids, and rejects empty banks', () => {
    const b = validateBank(bank({ questions: [q('A', { prompt: 'p' }), q('B', { mode: 'text', source: 'متن' })] })); const doc = bankDocument(b, 'x');
    expect(doc.exercises.map(e => [e.bankQuestionId, e.mode, e.steps.length])).toEqual([['A', 'math', 1], ['B', 'text', 1]]);
    expect(doc.exercises[0].prompt).toBe('p'); expect(doc.exerciseId).toBe(doc.exercises[0].id); expect(doc.session).toMatchObject({ bankId: 'B1', bankVersion: 'x' });
    expect(() => bankDocument(validateBank(bank({ questions: [] })), 'x')).toThrow('هنوز سؤالی');
  });
});

describe('archive', () => {
  it('readArchive handles missing, corrupt and malformed storage', () => {
    expect(readArchive()).toEqual([]);
    localStorage.setItem(ARCHIVE_KEY, '{bad'); expect(() => readArchive()).toThrow();
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify([{ id: 1 }])); expect(() => readArchive()).toThrow('قابل خواندن نیستند');
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify({})); expect(() => readArchive()).toThrow();
  });
  it('does not duplicate identical snapshots and keeps the data restorable', () => {
    const s = initialState(); archiveSession(s); archiveSession(s); expect(readArchive()).toHaveLength(1);
    expect(() => validateSession(JSON.parse(readArchive()[0].data))).not.toThrow();
  });
});

describe('Drive HTTP helpers', () => {
  const meta = { id: 'abcdefghij12', name: 'b.json', mimeType: 'application/json', md5Checksum: 'm', headRevisionId: 'r', version: '1', size: '10', modifiedTime: 't' };
  it.each([[401, 'منقضی'], [403, '۴۰۳'], [404, '۴۰۴'], [429, '429'], [500, '500'], [503, '503'], [418, '(418)']])('driveError %i', (code, text) => expect(driveError(code, 'X').message).toContain(text));
  it.each(['short', 'has space 12345', '../../etc/passwd', 'a'.repeat(151)])('rejects invalid file id %j without fetching', async id => {
    const f = vi.spyOn(globalThis, 'fetch'); await expect(readDriveMeta(id, 't')).rejects.toThrow('شناسهٔ فایل Drive معتبر نیست.'); await expect(readPrivateBankText(id, 't')).rejects.toThrow(); expect(f).not.toHaveBeenCalled();
  });
  it('sends bearer token, no-store and requests only metadata fields', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(meta)));
    await readDriveMeta(meta.id, 'TOK'); const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain(`/files/${meta.id}?fields=`); expect(String(url)).not.toContain('alt=media');
    expect(init).toMatchObject({ headers: { Authorization: 'Bearer TOK' }, cache: 'no-store' });
  });
  it('rejects trashed files and Google Docs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ ...meta, trashed: true }))).mockResolvedValueOnce(new Response(JSON.stringify({ ...meta, mimeType: 'application/vnd.google-apps.document' })));
    await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('سطل زباله'); await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('Google Doc');
  });
  it('maps HTTP errors for metadata and content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('۴۰۳'); await expect(readPrivateBankText(meta.id, 't')).rejects.toThrow('۴۰۴');
  });
  it('readPrivateBank parses downloaded text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(bank()))).mockResolvedValueOnce(new Response(''));
    expect(await readPrivateBank(meta.id, 't')).toMatchObject({ bank_id: 'B1' }); expect(await readPrivateBank(meta.id, 't')).toBe(EMPTY_BANK);
  });
  it('metaFingerprint changes when any revision field changes', () => {
    const base = metaFingerprint(meta);
    for (const k of ['md5Checksum', 'headRevisionId', 'version', 'size', 'modifiedTime', 'id'] as const) expect(metaFingerprint({ ...meta, [k]: 'changed' })).not.toBe(base);
    expect(metaFingerprint({ ...meta, name: 'renamed' })).toBe(base);
  });
});

describe('Google config and auth helpers', () => {
  it('uses built-in identifiers and only stores fileId/fileName', () => {
    localStorage.setItem('math-scratchpad-drive-config-v1', JSON.stringify({ clientId: 'old', apiKey: 'old', appId: '1', fileId: 'F', fileName: 'n', extra: 1 }));
    expect(getConfig()).toEqual({ clientId: GOOGLE_CLIENT_ID, apiKey: GOOGLE_API_KEY, appId: GOOGLE_APP_ID, fileId: 'F', fileName: 'n' });
    saveConfig({ fileId: 'G', fileName: 'm', ...({ apiKey: 'leak' } as object) } as never);
    expect(JSON.parse(localStorage.getItem('math-scratchpad-drive-config-v1')!)).toEqual({ fileId: 'G', fileName: 'm' });
  });
  it('tolerates corrupt, null and wrongly-typed stored config', () => {
    for (const raw of ['{bad', 'null', '[]', JSON.stringify({ fileId: 5 })]) { localStorage.setItem('math-scratchpad-drive-config-v1', raw); expect(getConfig().fileId).toBe(''); }
  });
  it('built-in identifiers have valid shapes', () => {
    expect(GOOGLE_CLIENT_ID).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/); expect(GOOGLE_APP_ID).toMatch(/^\d+$/); expect(GOOGLE_CLIENT_ID.startsWith(GOOGLE_APP_ID + '-')).toBe(true); expect(GOOGLE_API_KEY).toMatch(/^AIza[\w-]{35}$/);
  });
  const oauth = (resp: Record<string, unknown>, granted = true) => { const init = vi.fn((cfg: { callback: (r: unknown) => void }) => ({ requestAccessToken: () => cfg.callback(resp) })); window.google = { accounts: { oauth2: { initTokenClient: init, hasGrantedAllScopes: () => granted } } }; return init; };
  it('requestToken reports when GIS is not loaded', () => { const done = vi.fn(); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('آماده نیست'); });
  it('requestToken returns a token that expires a minute early, and asks for drive.file only', () => {
    const init = oauth({ access_token: 'A', expires_in: '3600' }); const done = vi.fn(); const t0 = Date.now(); requestToken('cid', { hint: 'h' }, done);
    const tok = done.mock.calls[0][0].token; expect(tok.accessToken).toBe('A'); expect(tok.expiresAt).toBeGreaterThanOrEqual(t0 + 3540000 - 5); expect(tok.expiresAt).toBeLessThanOrEqual(Date.now() + 3540000);
    expect(init.mock.calls[0][0]).toMatchObject({ client_id: 'cid', login_hint: 'h' }); expect((init.mock.calls[0][0] as unknown as { scope: string }).scope).toContain(DRIVE_SCOPE); expect((init.mock.calls[0][0] as unknown as { scope: string }).scope).not.toMatch(/auth\/drive(\s|$)/);
  });
  it('requestToken explains access_denied, other errors and a missing Drive grant', () => {
    let done = vi.fn(); oauth({ error: 'access_denied' }); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('Test users');
    done = vi.fn(); oauth({ error: 'invalid_client' }); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('invalid_client');
    done = vi.fn(); oauth({ access_token: 'A' }, false); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('Drive');
  });
  it('requestToken maps popup errors', () => {
    for (const [type, text] of [['popup_closed', 'بسته شد'], ['popup_failed_to_open', 'Pop-ups'], ['weird', 'انجام نشد']]) {
      const done = vi.fn(); window.google = { accounts: { oauth2: { initTokenClient: (cfg: { error_callback: (e: unknown) => void }) => ({ requestAccessToken: () => cfg.error_callback({ type }) }) } } };
      requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain(text);
    }
  });
  it('pickFile reports a missing Picker, picked file and cancel', () => {
    let done = vi.fn(); pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0].error).toContain('Picker');
    const make = (result: unknown) => ({ ViewId: { DOCS: 'd' }, DocsViewMode: { LIST: 'l' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, DocsView: class { setMimeTypes() { return this; } setMode() { return this; } setQuery() { return this; } },
      PickerBuilder: class { cb: (d: unknown) => void = () => undefined; addView() { return this; } setOAuthToken() { return this; } setDeveloperKey(k: string) { expect(k).toBe(GOOGLE_API_KEY); return this; } setAppId(a: string) { expect(a).toBe(GOOGLE_APP_ID); return this; } setOrigin() { return this; } setTitle() { return this; } setCallback(cb: (d: unknown) => void) { this.cb = cb; return this; } build() { return { setVisible: () => this.cb(result) }; } } });
    done = vi.fn(); window.google = { picker: make({ action: 'picked', docs: [{ id: 'F1', name: 'n' }] }) }; pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0]).toEqual({ id: 'F1', name: 'n' });
    done = vi.fn(); window.google = { picker: make({ action: 'picked', docs: [] }) }; pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0].error).toBeTruthy();
    done = vi.fn(); window.google = { picker: make({ action: 'cancel' }) }; pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0].error).toContain('لغو');
    done = vi.fn(); window.google = { picker: make({ action: 'loaded' }) }; pickFile(getConfig(), 't', done); expect(done).not.toHaveBeenCalled();
  });
  it('permittedAccount requires a verified, matching email', async () => {
    for (const p of [null, {}, { email: 'x@y.z' }, { email: 'x@y.z', email_verified: 'true' }, { email: 5, email_verified: true }]) expect(await permittedAccount(p)).toBe(false);
    expect(await permittedAccount({ email: 'someone@example.com', email_verified: true })).toBe(false);
  });
});
