import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { validateBank, snapshotVersion, bankCacheStorageKey } from '../../../src/features/drive-bank/drive-bank';
import {
  OFFLINE_BANK_DB_NAME,
  OFFLINE_BANK_STORE,
  listOfflineBanks,
  readOfflineBank,
  resetOfflineBankCacheForTests,
  saveOfflineBank,
} from '../../../src/pwa/offline-bank-cache';

function bank(bankId: string, version = 'v1') {
  return validateBank({
    schema_version: 'math-scratchpad.bank/1.0',
    bank_id: bankId,
    version,
    questions: [{ id: 'Q01', mode: 'math', source: '1+2' }],
  });
}

async function insertRecord(value: unknown) {
  const db = await openDB(OFFLINE_BANK_DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(OFFLINE_BANK_STORE, { keyPath: 'fileId' });
    },
  });
  await db.put(OFFLINE_BANK_STORE, value as never);
  db.close();
}

afterEach(async () => {
  await resetOfflineBankCacheForTests();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('separate offline bank cache', () => {
  it('stores several verified banks in its own database and leaves the old cache byte-identical', async () => {
    const legacyKey = bankCacheStorageKey('legacy-file');
    const legacyBytes = '{"schemaVersion":1,"synthetic":"unchanged"}';
    localStorage.setItem(legacyKey, legacyBytes);

    const first = bank('chapter-a');
    const second = bank('chapter-b');
    await saveOfflineBank('file-a', first, await snapshotVersion(first), 'fp-a');
    await saveOfflineBank('file-b', second, await snapshotVersion(second), 'fp-b');

    const result = await listOfflineBanks();
    expect(result.banks.map((record) => record.fileId).sort()).toEqual(['file-a', 'file-b']);
    expect(result.banks.find((record) => record.fileId === 'file-b')).toMatchObject({
      fileId: 'file-b',
      bankId: 'chapter-b',
      declaredVersion: 'v1',
      sizeChars: JSON.stringify(second).length,
    });
    expect(await readOfflineBank('file-a')).toMatchObject({ fileId: 'file-a', bank: { bank_id: 'chapter-a' }, fingerprint: 'fp-a' });
    expect(localStorage.getItem(legacyKey)).toBe(legacyBytes);
    expect(localStorage.getItem('math-scratchpad-offline-v1')).toBeNull();
  });

  it('ignores an invalid record, reports it, and leaves its bytes untouched', async () => {
    const corrupt = { schemaVersion: 1, fileId: 'broken', bankId: 'broken', bank: { bad: true } };
    await insertRecord(corrupt);

    await expect(readOfflineBank('broken')).resolves.toBeNull();
    const db = await openDB(OFFLINE_BANK_DB_NAME, 1);
    await expect(db.get(OFFLINE_BANK_STORE, 'broken')).resolves.toEqual(corrupt);
    db.close();
    await expect(listOfflineBanks()).resolves.toMatchObject({ banks: [], corruptCount: 1 });
  });

  it('refuses a mismatched version without replacing the last verified copy', async () => {
    const verified = bank('chapter-a', 'v1');
    const originalVersion = await snapshotVersion(verified);
    await saveOfflineBank('file-a', verified, originalVersion, 'fp-a');

    await expect(saveOfflineBank('file-a', bank('chapter-a', 'v2'), originalVersion, 'fp-b')).rejects.toThrow('version did not match');
    await expect(readOfflineBank('file-a')).resolves.toMatchObject({ contentVersion: originalVersion, fingerprint: 'fp-a' });
  });

  it('skips a new IndexedDB copy when less than twice its estimated size remains', async () => {
    const storage = { estimate: vi.fn().mockResolvedValue({ quota: 100, usage: 99 }) };
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
    const verified = bank('chapter-a');

    await expect(saveOfflineBank('file-a', verified, await snapshotVersion(verified), 'fp-a')).resolves.toEqual({
      saved: false,
      reason: 'quota',
    });
    await expect(readOfflineBank('file-a')).resolves.toBeNull();
    expect(storage.estimate).toHaveBeenCalledOnce();
  });
});
