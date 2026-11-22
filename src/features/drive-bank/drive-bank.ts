import type { DriveBankChapter } from '../../domain/entities/drive-bank.types';

export type {
  ArchivedSession,
  BankQuestion,
  CachedBank,
  DriveBank,
  DriveBankChapter,
  DriveMeta,
} from '../../domain/entities/drive-bank.types';

export type BankChapter = DriveBankChapter;

export { findForbiddenKey, forbiddenKey } from './model/bank-sanitization';
export {
  BANK_SCHEMA,
  EMPTY_BANK,
  MAX_QUESTIONS_PER_BANK,
  parseBankText,
  snapshotVersion,
  validateBank,
} from './model/bank-validator';
export {
  ARCHIVE_KEY,
  archiveSession,
  BANK_CACHE_PREFIX,
  bankCacheStorageKey,
  bankDocument,
  readArchive,
  readBankCache,
  saveBankCache,
} from './model/bank-session';
export {
  driveError,
  metaFingerprint,
  readDriveMeta,
  readPrivateBank,
  readPrivateBankText,
} from './api/drive-client';
