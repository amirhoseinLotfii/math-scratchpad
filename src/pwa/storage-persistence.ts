import { getLearningStorage } from '../sync/browser-db';

const PERSIST_REQUESTED_KEY = 'math-scratchpad-persist-requested-v1';

type PersistentStorage = Pick<StorageManager, 'persist' | 'persisted'>;

function browserStorage(): PersistentStorage | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = browserStorage();
  if (!storage?.persist) return null;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

/** Ask only once after the first verified bank load; explicit user requests may retry. */
export async function requestPersistentStorageOnce(): Promise<boolean | null> {
  const storage = browserStorage();
  if (!storage?.persist) return null;
  try {
    if (storage.persisted && (await storage.persisted())) return true;
  } catch {
    /* Try the one-time request below. */
  }

  const store = getLearningStorage();
  try {
    if (store.getItem(PERSIST_REQUESTED_KEY) === '1') return storage.persisted ? await storage.persisted() : false;
    store.setItem(PERSIST_REQUESTED_KEY, '1');
  } catch {
    // Avoid repeated prompts even when persistent local storage itself is unavailable.
  }
  return requestPersistentStorage();
}
