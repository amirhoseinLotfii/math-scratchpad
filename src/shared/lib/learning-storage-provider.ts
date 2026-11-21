let activeStorage: Storage | undefined;

function localStorageIfAvailable(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function setActiveLearningStorage(storage: Storage | undefined): void {
  activeStorage = storage;
}

export function getActiveLearningStorage(): Storage | undefined {
  return activeStorage;
}

/** Uses the active IndexedDB-backed storage after bootstrap, falling back to localStorage in unit tests. */
export function getLearningStorageOrLocal(): Storage | undefined {
  return activeStorage ?? localStorageIfAvailable();
}
