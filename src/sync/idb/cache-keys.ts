import { isLearningStorageKey } from '../../../shared/contracts/storage-keys';

const DEVICE_ID_KEY = 'math-scratchpad-device-id-v1';
const BANK_CACHE_PREFIX = 'math-scratchpad-drive-bank-cache-v1:';

export function isIndexedDbCacheKey(key: string): boolean {
  return isLearningStorageKey(key) || key === DEVICE_ID_KEY || key.startsWith(BANK_CACHE_PREFIX);
}
