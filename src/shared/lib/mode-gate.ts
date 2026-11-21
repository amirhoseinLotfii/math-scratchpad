import { db } from '../../storage/scratchpad-db';

export type StorageMode = 'offline' | 'online';

export const STORAGE_MODE_KEY = 'storage_mode';
export const MODE_CHANGED_EVENT = 'math-scratchpad:mode-changed';

let currentMode: StorageMode = 'offline';
let isInitialized = false;

/**
 * Initializes the storage mode from Dexie app_meta.
 * Defaults to 'offline' if not set.
 */
export async function initStorageMode(): Promise<StorageMode> {
  try {
    const record = await db.app_meta.get(STORAGE_MODE_KEY);
    if (record && (record.value === 'online' || record.value === 'offline')) {
      currentMode = record.value;
    } else {
      currentMode = 'offline';
      await db.app_meta.put({
        key: STORAGE_MODE_KEY,
        value: 'offline',
        updatedAtIso: new Date().toISOString()
      });
    }
  } catch {
    currentMode = 'offline';
  }
  isInitialized = true;
  return currentMode;
}

export function getCachedStorageMode(): StorageMode {
  return currentMode;
}

export async function getStorageMode(): Promise<StorageMode> {
  if (!isInitialized) {
    return await initStorageMode();
  }
  return currentMode;
}

/**
 * Sets the active storage mode and persists it in Dexie app_meta.
 * Dispatches an event for UI and sync listeners.
 */
export async function setStorageMode(mode: StorageMode): Promise<void> {
  currentMode = mode;
  isInitialized = true;

  await db.app_meta.put({
    key: STORAGE_MODE_KEY,
    value: mode,
    updatedAtIso: new Date().toISOString()
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MODE_CHANGED_EVENT, { detail: { mode } }));
  }
}

/**
 * Guard that verifies if outbound network calls are permissible.
 * In 'offline' mode, absolutely ZERO network requests are allowed.
 */
export function isNetworkAllowed(): boolean {
  return currentMode === 'online';
}

/**
 * Throws an explicit error if a network request is attempted while offline.
 */
export function assertNetworkAllowed(targetUrl: string = ''): void {
  if (!isNetworkAllowed()) {
    throw new Error(
      `[ModeGate] Network request blocked in offline mode. URL: ${targetUrl || 'unspecified'}`
    );
  }
}
