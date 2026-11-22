import type { DriveBank } from '../../../domain/entities/drive-bank.types';
import {
  declaredVersionNumber,
  isRecord,
  isTimestamp,
  LESSON_PROGRESS_PREFIX,
  LESSON_PROGRESS_SCHEMA,
  lessonProgressStorageKey,
  MAX_RECORD_LENGTH,
  type LessonProgressState,
} from './progress-types';

/** Copy stable progress into a revised bank version while retaining every older record. */
export function migratePreviousProgress(
  bank: DriveBank,
  bankVersion: string,
  storage: Storage,
  now: string,
  ops: {
    read: (bank: DriveBank, bankVersion: string, storage?: Storage, now?: string) => LessonProgressState;
    save: (bank: DriveBank, bankVersion: string, state: LessonProgressState, storage?: Storage) => { saved: boolean; message: string };
  },
): LessonProgressState | undefined {
  const prefix = `${LESSON_PROGRESS_PREFIX}:${encodeURIComponent(bank.bank_id)}:`;
  const currentKey = lessonProgressStorageKey(bank.bank_id, bankVersion);
  const candidates: Array<{ key: string; version: string; updatedAt: string }> = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix) || key === currentKey) continue;
      const raw = storage.getItem(key);
      if (!raw || raw.length > MAX_RECORD_LENGTH) continue;
      const value: unknown = JSON.parse(raw);
      if (!isRecord(value) || value.schemaVersion !== LESSON_PROGRESS_SCHEMA || value.bankId !== bank.bank_id || typeof value.bankVersion !== 'string' || value.bankVersion === bankVersion) continue;
      candidates.push({ key, version: value.bankVersion, updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : '' });
    }
  } catch { return undefined; }
  candidates.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  for (const candidate of candidates) {
    const currentVersionNumber = declaredVersionNumber(bank.version);
    const previousVersionNumber = declaredVersionNumber(candidate.version);
    if (currentVersionNumber === undefined || previousVersionNumber === undefined || currentVersionNumber <= previousVersionNumber) continue;
    const previous = ops.read(bank, candidate.version, storage, now);
    if (previous.persistenceBlocked || (!Object.keys(previous.progressById).length && !previous.lessonPanelEvents.length)) continue;
    const migrated: LessonProgressState = { ...previous, bankVersion, found: true };
    const result = ops.save(bank, bankVersion, migrated, storage);
    if (result.saved) return migrated;
  }
  return undefined;
}
