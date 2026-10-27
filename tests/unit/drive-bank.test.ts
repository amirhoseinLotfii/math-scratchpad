import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveSession, bankDocument, findQuestionBank, readArchive, readPrivateBank, snapshotVersion, validateBank } from '../../src/features/drive-bank/drive-bank';
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
  it('rejects duplicate IDs and answer keys', () => {
    expect(() => validateBank({ ...sample, questions: [sample.questions[0], sample.questions[0]] })).toThrow();
    expect(() => validateBank({ ...sample, questions: [{ ...sample.questions[0], expected: '3' }] })).toThrow();
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
  it('refuses an ambiguous file name rather than selecting a random bank', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ files: [{ id: 'first' }, { id: 'second' }] }), { status: 200 }));
    await expect(findQuestionBank('temporary-token')).rejects.toThrow('دقیقاً یک فایل');
  });
  it('does not archive a session while storage is conflicted', () => {
    const state = initialState(); state.storageState = { kind: 'conflict', message: 'conflict' };
    expect(() => archiveSession(state)).toThrow(); expect(readArchive()).toEqual([]);
  });
});
