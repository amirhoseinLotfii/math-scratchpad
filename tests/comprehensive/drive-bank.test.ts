import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK_SCHEMA, EMPTY_BANK, ARCHIVE_KEY, archiveSession, bankDocument, driveError, metaFingerprint, parseBankText, readArchive, readDriveMeta, readPrivateBank, readPrivateBankText, snapshotVersion, validateBank, MAX_QUESTIONS_PER_BANK, MAX_BANK_TEXT_LENGTH } from '../../src/features/drive-bank/drive-bank';
import { getConfig, saveConfig, requestToken, pickFile, DRIVE_SCOPE } from '../../src/features/drive-bank/google';
import { GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID } from '../../src/features/drive-bank/drive-config';
import { permittedAccount } from '../../src/features/drive-bank/identity';
import { initialState } from '../../src/store';
import { serialize, validateSession } from '../../src/persistence';
import { MAX_SESSION_EXERCISES } from '../../src/model';

const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, mode: 'math', source: '1+2', ...extra });
const bank = (extra: Record<string, unknown> = {}) => ({ schema_version: BANK_SCHEMA, bank_id: 'B1', version: 'v1', questions: [q('Q01')], ...extra });
const INVALID = 'Invalid bank', KEY = 'answer-like content was removed';
const v23Text = readFileSync('data/MATH_QUESTION_BANK_v23.json', 'utf8');
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); delete window.google; });

describe('validateBank: top level', () => {
  it('accepts a minimal valid bank and an empty question list', () => { expect(validateBank(bank()).questions).toHaveLength(1); expect(validateBank(bank({ questions: [] })).questions).toEqual([]); });
  it.each([null, undefined, 1, 'x', [], [bank()]])('rejects non-object %j', v => expect(() => validateBank(v)).toThrow('JSON object'));
  it.each([
    ['missing schema_version', { schema_version: undefined }], ['wrong schema_version', { schema_version: 'math-scratchpad.bank/2.0' }],
    ['missing bank_id', { bank_id: undefined }], ['bank_id with space', { bank_id: 'B 1' }], ['bank_id with slash', { bank_id: 'a/b' }], ['bank_id too long', { bank_id: 'a'.repeat(81) }], ['empty bank_id', { bank_id: '' }], ['numeric bank_id', { bank_id: 5 }],
    ['missing version', { version: undefined }], ['numeric version', { version: 3 }], ['version with unicode', { version: 'نسخه' }],
    ['questions not array', { questions: {} }],
  ])('rejects %s', (_, patch) => expect(() => validateBank(bank(patch))).toThrow(INVALID));
  it('accepts a complete chapter bank beyond one session and ids with . - _', () => { expect(validateBank(bank({ bank_id: 'GEN-2026.10_28', questions: Array.from({ length: 101 }, (_, i) => q(`Q-${i}.a_b`)) })).questions).toHaveLength(101); });
  it('rejects a bank above the explicit chapter question limit', () => { expect(() => validateBank(bank({ questions: Array.from({ length: MAX_QUESTIONS_PER_BANK + 1 }, (_, i) => q(`Q${i}`)) }))).toThrow(`up to ${MAX_QUESTIONS_PER_BANK} questions`); });
  it('preserves chapter metadata only when it names every parsed lesson', () => {
    const lesson = { id: 'PC-1.1', book: 'OpenStax Precalculus 2e', section: '1.1', title: 'توابع و تابع‌نما', concepts: [] };
    const chapter = { id: 'PC-1', number: 1, title: 'توابع', source: 'OpenStax Precalculus 2e', pdfPages: '17–168', lessonIds: ['PC-1.1'] };
    expect(validateBank(bank({ lessons: [lesson], chapter })).chapter).toEqual(chapter);
    const invalid = validateBank(bank({ lessons: [lesson], chapter: { ...chapter, lessonIds: ['PC-9.9'] } }));
    expect(invalid.chapter).toBeUndefined();
    expect(invalid.parseWarnings?.join(' ')).toContain('chapter: invalid chapter metadata');
  });
  it('loads, archives, serializes, and restores a 73-question lesson section', () => {
    const parsed = validateBank(bank({ questions: Array.from({ length: 73 }, (_, i) => q(`PC-1.1-P${String(i + 1).padStart(2, '0')}`)) }));
    const state = initialState(); state.doc = bankDocument(parsed, 'section-v1');
    expect(validateSession(JSON.parse(serialize(state))).doc.exercises).toHaveLength(73);
    archiveSession(state);
    expect(validateSession(JSON.parse(readArchive()[0].data)).doc.exercises).toHaveLength(73);
  });
  it('drops unknown fields from output', () => { const out = validateBank(bank({ extra: 1, questions: [q('Q1', { note: 'x' })] })); expect(out).not.toHaveProperty('extra'); expect(out.questions[0]).not.toHaveProperty('note'); });
});

describe('validateBank: questions', () => {
  it.each([
    ['bad id', q('Q 1')], ['empty id', q('')], ['numeric id', { ...q('x'), id: 1 }], ['bad mode', q('Q1', { mode: 'latex' })], ['missing mode', { id: 'Q1', source: '1' }],
    ['empty source', q('Q1', { source: '  ' })], ['source too long', q('Q1', { mode: 'text', source: 'a'.repeat(4001) })], ['numeric source', q('Q1', { source: 1 })],
    ['numeric prompt', q('Q1', { prompt: 3 })], ['prompt too long', q('Q1', { prompt: 'a'.repeat(4000) })],
  ])('rejects %s with a question path', (_, item) => expect(() => validateBank(bank({ questions: [item] }))).toThrow(/questions\[0\]/));
  it.each([null, 'x', [1]])('rejects non-object question %j with its index', item => expect(() => validateBank(bank({ questions: [item] }))).toThrow('questions[0]: a question must be a JSON object'));
  it('reports the question id, field, and math parser reason when question data is invalid', () => {
    expect(() => validateBank(bank({ questions: [q('Q-17', { mode: 'latex' })] }))).toThrow('questions[0] (Q-17): mode');
    expect(() => validateBank(bank({ questions: [q('Q-18', { source: '(1+2' })] }))).toThrow('questions[0] (Q-18): invalid math source. Close the parenthesis.');
  });
  it('keeps the first duplicate question id and reports later copies', () => { const out = validateBank(bank({ questions: [q('A', { prompt: 'first' }), q('A', { prompt: 'later' })] })); expect(out.questions).toHaveLength(1); expect(out.questions[0].prompt).toBe('first'); expect(out.parseWarnings?.join(' ')).toContain('duplicate question id A'); });
  it.each(['answer', 'answers', 'expected', 'solution', 'key', 'rubric', 'verification', 'ANSWER', 'Solution'])('strips forbidden question field %s and warns', k => { const out = validateBank(bank({ questions: [q('Q1', { [k]: '3' })] })); expect(out.questions[0]).not.toHaveProperty(k); expect(out.parseWarnings?.join(' ')).toContain(`questions[0].${k}`); });
  it('strips forbidden fields even when their value is empty or null', () => { const out = validateBank(bank({ questions: [q('Q1', { answer: null, solution: '' })] })); expect(out.questions[0]).not.toHaveProperty('answer'); expect(out.questions[0]).not.toHaveProperty('solution'); expect(out.parseWarnings).toHaveLength(2); });
  it('math mode sources must parse, text mode sources are free text', () => {
    expect(() => validateBank(bank({ questions: [q('Q1', { source: '(1+2' })] }))).toThrow('Close the parenthesis.');
    expect(validateBank(bank({ questions: [q('Q1', { mode: 'text', source: 'یک عدد [ ] بنویس |x|' })] })).questions[0].mode).toBe('text');
    expect(validateBank(bank({ questions: [q('Q1', { source: '۱+۲' })] })).questions[0].source).toBe('۱+۲');
  });
  it('keeps prompt only when it is a string', () => { expect(validateBank(bank({ questions: [q('Q1', { prompt: 'حل کن' })] })).questions[0].prompt).toBe('حل کن'); expect(validateBank(bank()).questions[0]).not.toHaveProperty('prompt'); });
  it('strips a top-level answers field and records a warning', () => { const out = validateBank(bank({ answers: { Q01: '3' } })); expect(out).not.toHaveProperty('answers'); expect(out.parseWarnings?.[0]).toContain('answers'); });
  it.each(['answer_key', 'answerKey', 'AnswerKey', 'ANSWER_KEY', 'final_answer', 'finalAnswer', 'FINAL-ANSWER', 'expected_value', 'expectedValue', 'solutions', 'solution.steps', 'keys', 'Key', 'model_solution', 'correctAnswer', 'student answer', 'rubric', 'Expected'])('strips answer-like field %j from a question', k => { const out = validateBank(bank({ questions: [q('Q1', { [k]: '3' })] })); expect(out.questions[0]).not.toHaveProperty(k); expect(out.parseWarnings?.length).toBeGreaterThan(0); });
  it('strips forbidden fields at any depth, including inside arrays', () => {
    const out = validateBank(bank({ meta: { notes: [{ deep: { answerKey: 1 } }] }, questions: [q('Q1', { extra: { solution: 'x' } })] }));
    expect(out.parseWarnings?.join(' ')).toContain('meta.notes[0].deep.answerKey');
    expect(out.parseWarnings?.join(' ')).toContain('questions[0].extra.solution');
  });
  it.each(['keyboard', 'keyword', 'monkey', 'turkey', 'keystroke', 'hotkeyHint', 'answered_count', 'expectedness', 'solver', 'source_note', 'prompt_hint'])('BUG-9 does not flag the harmless field %j', k => {
    expect(() => validateBank(bank({ [k]: 'x', questions: [q('Q1')] }))).not.toThrow();
  });
  it('BUG-9 forbidden word in a value (not a key) is fine', () => expect(validateBank(bank({ questions: [q('Q1', { mode: 'text', source: 'answer key solution expected' })] })).questions).toHaveLength(1));
  it('the real private bank v3 is still accepted', async () => {
    const fs = await import('node:fs'); const path = '/workspace/bank_v3.json';
    if (!fs.existsSync(path)) return; // private file, only present on the dev box
    const raw = JSON.parse(fs.readFileSync(path, 'utf8')); // local copy predates the schema_version line added on Drive
    const parsed = parseBankText(JSON.stringify({ schema_version: BANK_SCHEMA, ...raw })); expect(parsed).not.toBe(EMPTY_BANK); expect((parsed as { questions: unknown[] }).questions).toHaveLength(26);
  });
});

describe('parseBankText', () => {
  it('empty, whitespace and BOM-only files are EMPTY_BANK', () => { for (const t of ['', '  \n', '\uFEFF', '\uFEFF  ']) expect(parseBankText(t)).toBe(EMPTY_BANK); });
  it('accepts a BOM-prefixed JSON bank', () => expect(parseBankText('\uFEFF' + JSON.stringify(bank()))).not.toBe(EMPTY_BANK));
  it.each(['{', 'not json', '{"a":1,}', "{'a':1}"])('invalid JSON %j gives an English error', t => expect(() => parseBankText(t)).toThrow('not valid JSON'));
  it('accepts the bounded expanded lesson bank while rejecting files over the new limit', () => {
    expect(parseBankText(v23Text)).not.toBe(EMPTY_BANK);
    expect(v23Text.length).toBeLessThanOrEqual(MAX_BANK_TEXT_LENGTH);
    expect(() => parseBankText(' '.repeat(MAX_BANK_TEXT_LENGTH + 1))).toThrow('too large');
  });
  it('reproduces the missing schema_version incident', () => { const b: Record<string, unknown> = bank(); delete b.schema_version; expect(() => parseBankText(JSON.stringify(b))).toThrow(INVALID); });
  it('the bracket incident file (N2c-PL02 with [ ]) is now accepted, while a truly bad question still rejects the whole file', () => {
    expect(parseBankText(JSON.stringify(bank({ questions: [q('A'), q('N2c-PL02', { source: '20-[3\\times(5-2)]' })] })))).not.toBe(EMPTY_BANK);
    expect(() => parseBankText(JSON.stringify(bank({ questions: [q('A'), q('B', { source: 'x_1' })] })))).toThrow('Unsupported input near _1');
  });
});

describe('snapshotVersion and bankDocument', () => {
  it('is deterministic and changes with content', async () => {
    const a = validateBank(bank()); expect(await snapshotVersion(a)).toBe(await snapshotVersion(validateBank(bank())));
    expect(await snapshotVersion(a)).toMatch(/^v1-[0-9a-f]{16}$/);
    expect(await snapshotVersion(a)).not.toBe(await snapshotVersion(validateBank(bank({ questions: [q('Q01', { prompt: 'p' })] }))));
    expect(await snapshotVersion(a)).toBe(await snapshotVersion({ ...a, parseWarnings: ['dev-only notice'] }));
  });
  it('snapshot version stays within the session id limit and survives persistence', async () => {
    const b = validateBank(bank({ version: 'v'.repeat(80) })); const v = await snapshotVersion(b); const doc = bankDocument(b, v);
    expect(validateSession({ version: 2, doc }).doc.session?.bankVersion).toBe(v);
  });
  it('bankDocument makes one blank step per question with bank ids, and rejects empty banks', () => {
    const b = validateBank(bank({ questions: [q('A', { prompt: 'p' }), q('B', { mode: 'text', source: 'متن' })] })); const doc = bankDocument(b, 'x');
    expect(doc.exercises.map(e => [e.bankQuestionId, e.mode, e.steps.length])).toEqual([['A', 'math', 1], ['B', 'text', 1]]);
    expect(doc.exercises[0].prompt).toBe('p'); expect(doc.exerciseId).toBe(doc.exercises[0].id); expect(doc.session).toMatchObject({ bankId: 'B1', bankVersion: 'x' });
    expect(() => bankDocument(validateBank(bank({ questions: [] })), 'x')).toThrow('No practice questions');
  });
  it('enforces the per-session cap while permitting a complete chapter bank', () => {
    const questions = Array.from({ length: MAX_SESSION_EXERCISES + 1 }, (_, index) => q(`Q${String(index).padStart(3, '0')}`));
    const b = validateBank(bank({ questions }));
    expect(() => bankDocument(b, 'x')).toThrow(`at most ${MAX_SESSION_EXERCISES} questions`);
    expect(bankDocument(b, 'x', b.questions.slice(0, MAX_SESSION_EXERCISES)).exercises).toHaveLength(MAX_SESSION_EXERCISES);
  });
  it('keeps Learn-stage checks out of the main Practice session while preserving default-practice banks', () => {
    const b = validateBank({ ...bank(),
      lessons: [{ id: 'LESSON', book: 'Book', section: '1.1', title: 'Lesson', concepts: [{ id: 'CONCEPT', title: 'Concept', blocks: [], checkQuestionIds: ['CHECK'] }] }],
      questions: [q('CHECK', { lessonId: 'LESSON', conceptId: 'CONCEPT', stage: 'learn' }), q('PRACTICE', { stage: 'practice' }), q('LEGACY')],
    });
    expect(bankDocument(b, 'x').exercises.map(exercise => exercise.bankQuestionId)).toEqual(['PRACTICE', 'LEGACY']);
  });
});

describe('archive', () => {
  it('readArchive handles missing, corrupt and malformed storage', () => {
    expect(readArchive()).toEqual([]);
    localStorage.setItem(ARCHIVE_KEY, '{bad'); expect(() => readArchive()).toThrow();
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify([{ id: 1 }])); expect(() => readArchive()).toThrow('Saved sessions could not be read');
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify({})); expect(() => readArchive()).toThrow();
  });
  it('does not duplicate identical snapshots and keeps the data restorable', () => {
    const s = initialState(); archiveSession(s); archiveSession(s); expect(readArchive()).toHaveLength(1);
    expect(() => validateSession(JSON.parse(readArchive()[0].data))).not.toThrow();
  });
});

describe('Drive HTTP helpers', () => {
  const meta = { id: 'abcdefghij12', name: 'b.json', mimeType: 'application/json', md5Checksum: 'm', headRevisionId: 'r', version: '1', size: '10', modifiedTime: 't' };
  it.each([[401, 'expired'], [403, '(403)'], [404, '(404)'], [429, '429'], [500, '500'], [503, '503'], [418, '(418)']])('driveError %i', (code, text) => expect(driveError(code, 'X').message).toContain(text));
  it.each(['short', 'has space 12345', '../../etc/passwd', 'a'.repeat(151)])('rejects invalid file id %j without fetching', async id => {
    const f = vi.spyOn(globalThis, 'fetch'); await expect(readDriveMeta(id, 't')).rejects.toThrow('Invalid Google Drive file ID'); await expect(readPrivateBankText(id, 't')).rejects.toThrow(); expect(f).not.toHaveBeenCalled();
  });
  it('sends bearer token, no-store and requests only metadata fields', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(meta)));
    await readDriveMeta(meta.id, 'TOK'); const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain(`/files/${meta.id}?fields=`); expect(String(url)).not.toContain('alt=media');
    expect(init).toMatchObject({ headers: { Authorization: 'Bearer TOK' }, cache: 'no-store' });
  });
  it('rejects trashed files and Google Docs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ ...meta, trashed: true }))).mockResolvedValueOnce(new Response(JSON.stringify({ ...meta, mimeType: 'application/vnd.google-apps.document' })));
    await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('Google Drive trash'); await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('Google Doc');
  });
  it('maps HTTP errors for metadata and content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(readDriveMeta(meta.id, 't')).rejects.toThrow('denied access (403)'); await expect(readPrivateBankText(meta.id, 't')).rejects.toThrow('(404)');
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
  it('requestToken reports when GIS is not loaded', () => { const done = vi.fn(); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('not ready'); });
  it('requestToken returns a token that expires a minute early, and asks for drive.file only', () => {
    const init = oauth({ access_token: 'A', expires_in: '3600' }); const done = vi.fn(); const t0 = Date.now(); requestToken('cid', { hint: 'h' }, done);
    const tok = done.mock.calls[0][0].token; expect(tok.accessToken).toBe('A'); expect(tok.expiresAt).toBeGreaterThanOrEqual(t0 + 3540000 - 5); expect(tok.expiresAt).toBeLessThanOrEqual(Date.now() + 3540000);
    expect(init.mock.calls[0][0]).toMatchObject({ client_id: 'cid', login_hint: 'h' }); expect((init.mock.calls[0][0] as unknown as { scope: string }).scope).toContain(DRIVE_SCOPE); expect((init.mock.calls[0][0] as unknown as { scope: string }).scope).not.toMatch(/auth\/drive(\s|$)/);
  });
  it('requestToken explains access_denied, other errors and a missing Drive grant', () => {
    let done = vi.fn(); oauth({ error: 'access_denied' }); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('test user');
    done = vi.fn(); oauth({ error: 'invalid_client' }); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('invalid_client');
    done = vi.fn(); oauth({ access_token: 'A' }, false); requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain('Drive');
  });
  it('requestToken maps popup errors', () => {
    for (const [type, text] of [['popup_closed', 'closed'], ['popup_failed_to_open', 'Pop-ups'], ['weird', 'failed']]) {
      const done = vi.fn(); window.google = { accounts: { oauth2: { initTokenClient: (cfg: { error_callback: (e: unknown) => void }) => ({ requestAccessToken: () => cfg.error_callback({ type }) }) } } };
      requestToken('c', {}, done); expect(done.mock.calls[0][0].error).toContain(text);
    }
  });
  it('pickFile reports a missing Picker, picked file and cancel', () => {
    let done = vi.fn(); pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0].error).toContain('Picker');
    const make = (result: unknown) => ({ ViewId: { DOCS: 'd' }, DocsViewMode: { LIST: 'l' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, DocsView: class { setMimeTypes() { return this; } setMode() { return this; } setQuery() { return this; } },
      PickerBuilder: class { cb: (d: unknown) => void = () => undefined; addView() { return this; } setOAuthToken() { return this; } setDeveloperKey(k: string) { expect(k).toBe(GOOGLE_API_KEY); return this; } setAppId(a: string) { expect(a).toBe(GOOGLE_APP_ID); return this; } setOrigin() { return this; } setLocale(locale: string) { expect(locale).toBe('en'); return this; } setTitle(title: string) { expect(title).toBe('Select MATH_QUESTION_BANK.json'); return this; } setCallback(cb: (d: unknown) => void) { this.cb = cb; return this; } build() { return { setVisible: () => this.cb(result) }; } } });
    done = vi.fn(); window.google = { picker: make({ action: 'picked', docs: [{ id: 'F1', name: 'n' }] }) }; pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0]).toEqual({ id: 'F1', name: 'n' });
    done = vi.fn(); window.google = { picker: make({ action: 'picked', docs: [] }) }; pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0].error).toBeTruthy();
    done = vi.fn(); window.google = { picker: make({ action: 'cancel' }) }; pickFile(getConfig(), 't', done); expect(done.mock.calls[0][0].error).toContain('canceled');
    done = vi.fn(); window.google = { picker: make({ action: 'loaded' }) }; pickFile(getConfig(), 't', done); expect(done).not.toHaveBeenCalled();
  });
  it('permittedAccount requires a verified, matching email', async () => {
    for (const p of [null, {}, { email: 'x@y.z' }, { email: 'x@y.z', email_verified: 'true' }, { email: 5, email_verified: true }]) expect(await permittedAccount(p)).toBe(false);
    expect(await permittedAccount({ email: 'someone@example.com', email_verified: true })).toBe(false);
  });
});
