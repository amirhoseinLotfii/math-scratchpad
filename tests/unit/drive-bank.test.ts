import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveSession, bankDocument, metaFingerprint, parseBankText, EMPTY_BANK, readDriveMeta, readArchive, readPrivateBank, snapshotVersion, validateBank } from '../../src/features/drive-bank/drive-bank';
import { initialState } from '../../src/store';
import { validateSession } from '../../src/persistence';
import { buildTutorExport } from '../../src/features/session/export/tutor-export';

const sample = { schema_version: 'math-scratchpad.bank/1.0', bank_id: 'S001', version: 'v1', questions: [{ id: 'Q01', mode: 'math', source: '1+2', prompt: 'حاصل را حساب کن.' }] };
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe('Drive question bank', () => {
  it('retains bank and question IDs across local persistence and tutor export', async () => {
    const bank = validateBank(sample), version = await snapshotVersion(bank), doc = bankDocument(bank, version);
    const saved = validateSession({ version: 2, doc });
    const result = buildTutorExport(saved.doc);
    expect(result.bank_id).toBe('S001'); expect(result.bank_version).toBe(version);
    expect(result.items[0].question_id).toBe('Q01');
  });
  it('changes the snapshot version when content changes even with the same declared version', async () => {
    expect(await snapshotVersion(validateBank(sample))).not.toBe(await snapshotVersion(validateBank({ ...sample, questions: [{ ...sample.questions[0], source: '1+3' }] })));
  });
  it('keeps the first duplicate ID and strips answer-like fields with warnings', () => {
    const duplicated = validateBank({ ...sample, questions: [sample.questions[0], sample.questions[0]] });
    expect(duplicated.questions).toHaveLength(1);
    expect(duplicated.parseWarnings?.join(' ')).toContain('duplicate question id Q01');
    const sanitized = validateBank({ ...sample, questions: [{ ...sample.questions[0], expected: '3' }] });
    expect(sanitized.questions[0]).not.toHaveProperty('expected');
    expect(sanitized.parseWarnings?.join(' ')).toContain('expected');
  });
  it('keeps earlier snapshots of the same session, and surfaces storage failures before switching', () => {
    const state = initialState(); archiveSession(state); state.doc.exercises[0].source = '1+2'; archiveSession(state);
    expect(readArchive()).toHaveLength(2);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
    expect(() => archiveSession(state)).toThrow('quota');
    expect(readArchive()).toHaveLength(2);
  });
  it('reads only the selected Drive file through an Authorization header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(sample), { status: 200 }));
    await readPrivateBank('privateFileId123', 'temporary-token');
    expect(fetchSpy).toHaveBeenCalledWith('https://www.googleapis.com/drive/v3/files/privateFileId123?alt=media', expect.objectContaining({ headers: { Authorization: 'Bearer temporary-token' }, cache: 'no-store' }));
  });
  it('treats an empty Drive file as "no questions yet" and gives a clear English JSON error', () => {
    expect(parseBankText('')).toBe(EMPTY_BANK); expect(parseBankText('\uFEFF  \n')).toBe(EMPTY_BANK);
    expect(() => parseBankText('{oops')).toThrow('The bank file is not valid JSON. The current session was not changed.');
  });
  it('detects content change from Drive metadata without downloading', async () => {
    const meta = { id: 'privateFileId123', name: 'MATH_QUESTION_BANK.json', mimeType: 'application/json', md5Checksum: 'a', headRevisionId: 'r1', version: '5' };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(meta), { status: 200 }));
    const got = await readDriveMeta('privateFileId123', 'tok');
    expect(String(spy.mock.calls[0][0])).toContain('fields=');
    expect(metaFingerprint(got)).toBe(metaFingerprint({ ...meta }));
    expect(metaFingerprint(got)).not.toBe(metaFingerprint({ ...meta, md5Checksum: 'b', headRevisionId: 'r2', version: '6' }));
  });
  it('maps Drive HTTP errors to clear English guidance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    await expect(readDriveMeta('privateFileId123', 'tok')).rejects.toThrow('Choose it again.');
  });
  it('does not archive a session while storage is conflicted', () => {
    const state = initialState(); state.storageState = { kind: 'conflict', message: 'conflict' };
    expect(() => archiveSession(state)).toThrow(); expect(readArchive()).toEqual([]);
  });
});
