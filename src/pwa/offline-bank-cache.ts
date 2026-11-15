import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { snapshotVersion, validateBank, type DriveBank } from '../features/drive-bank/drive-bank';

export const OFFLINE_BANK_DB_NAME = 'math-scratchpad-offline-v1';
export const OFFLINE_BANK_STORE = 'banks';
const OFFLINE_BANK_DB_VERSION = 1;
const MAX_OFFLINE_BANK_CHARS = 2_000_000;

export type OfflineBankRecord = {
  schemaVersion: 1;
  fileId: string;
  bankId: string;
  declaredVersion: string;
  contentVersion: string;
  fingerprint: string;
  bank: unknown;
  savedAt: string;
  sizeChars: number;
};

export type CachedOfflineBank = Omit<OfflineBankRecord, 'bank'> & { bank: DriveBank };
export type OfflineBankList = { banks: CachedOfflineBank[]; corruptCount: number };

interface OfflineBankDatabase extends DBSchema {
  banks: { key: string; value: OfflineBankRecord };
}

let dbPromise: Promise<IDBPDatabase<OfflineBankDatabase>> | undefined;

function database(): Promise<IDBPDatabase<OfflineBankDatabase>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineBankDatabase>(OFFLINE_BANK_DB_NAME, OFFLINE_BANK_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(OFFLINE_BANK_STORE)) db.createObjectStore(OFFLINE_BANK_STORE, { keyPath: 'fileId' });
      },
      blocked() {
        // A newer tab can finish opening after the current offline cache connection closes.
      },
    }).then((db) => {
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      return db;
    });
  }
  return dbPromise;
}

function isRecord(value: unknown): value is OfflineBankRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<OfflineBankRecord>;
  return (
    record.schemaVersion === 1 &&
    typeof record.fileId === 'string' &&
    typeof record.bankId === 'string' &&
    typeof record.declaredVersion === 'string' &&
    typeof record.contentVersion === 'string' &&
    typeof record.fingerprint === 'string' &&
    typeof record.savedAt === 'string' &&
    typeof record.sizeChars === 'number' &&
    'bank' in record
  );
}

async function validateRecord(value: unknown): Promise<CachedOfflineBank | null> {
  if (!isRecord(value)) return null;
  try {
    const bank = validateBank(value.bank);
    if (
      bank.bank_id !== value.bankId ||
      bank.version !== value.declaredVersion ||
      (await snapshotVersion(bank)) !== value.contentVersion ||
      JSON.stringify(bank).length !== value.sizeChars
    )
      return null;
    return { ...value, bank };
  } catch {
    // Corrupt records are ignored and left unchanged for inspection or replacement.
    return null;
  }
}

async function hasTwoBankSizesAvailable(bytes: number): Promise<boolean> {
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate?.quota === undefined) return true;
    return estimate.quota - (estimate.usage ?? 0) >= bytes * 2;
  } catch {
    return true;
  }
}

export async function saveOfflineBank(
  fileId: string,
  input: DriveBank,
  contentVersion: string,
  fingerprint: string,
): Promise<{ saved: true } | { saved: false; reason: 'quota' }> {
  if (!fileId) throw new Error('A Drive file id is required to cache a bank.');
  const bank = validateBank(input);
  if ((await snapshotVersion(bank)) !== contentVersion) throw new Error('The offline bank version did not match the verified content.');
  const bankText = JSON.stringify(bank);
  if (bankText.length > MAX_OFFLINE_BANK_CHARS) throw new Error('This bank is too large for the offline bank cache.');
  const bytes = new TextEncoder().encode(bankText).byteLength;
  if (!(await hasTwoBankSizesAvailable(bytes))) return { saved: false, reason: 'quota' };

  const record: OfflineBankRecord = {
    schemaVersion: 1,
    fileId,
    bankId: bank.bank_id,
    declaredVersion: bank.version,
    contentVersion,
    fingerprint,
    bank,
    savedAt: new Date().toISOString(),
    sizeChars: bankText.length,
  };
  const db = await database();
  await db.put(OFFLINE_BANK_STORE, record);
  const saved = await readOfflineBank(fileId);
  if (!saved || saved.contentVersion !== contentVersion || saved.fingerprint !== fingerprint)
    throw new Error('The offline bank cache could not be verified.');
  return { saved: true };
}

export async function readOfflineBank(fileId: string): Promise<CachedOfflineBank | null> {
  return validateRecord(await (await database()).get(OFFLINE_BANK_STORE, fileId));
}

export async function listOfflineBanks(): Promise<OfflineBankList> {
  const records = await (await database()).getAll(OFFLINE_BANK_STORE);
  const validated = await Promise.all(records.map(validateRecord));
  const banks = validated
    .filter((record): record is CachedOfflineBank => record !== null)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt) || left.bankId.localeCompare(right.bankId));
  return { banks, corruptCount: records.length - banks.length };
}

export async function resetOfflineBankCacheForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = undefined;
  await deleteDB(OFFLINE_BANK_DB_NAME);
}
