import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/storage/scratchpad-db';
import {
  assertNetworkAllowed,
  getCachedStorageMode,
  getStorageMode,
  initStorageMode,
  isNetworkAllowed,
  setStorageMode
} from '../../src/sync/mode-gate';

describe('Mode Gate & Zero-Network Guard - UT-07', () => {
  beforeEach(async () => {
    await db.app_meta.clear();
    await setStorageMode('offline');
  });

  it('defaults to offline mode and denies network calls', async () => {
    const mode = await initStorageMode();
    expect(mode).toBe('offline');
    expect(isNetworkAllowed()).toBe(false);
    expect(getCachedStorageMode()).toBe('offline');

    expect(() => assertNetworkAllowed('https://www.googleapis.com/drive/v3/about')).toThrow(
      /Network request blocked in offline mode/
    );
  });

  it('permits network calls only when switched to online mode', async () => {
    await setStorageMode('online');
    expect(await getStorageMode()).toBe('online');
    expect(isNetworkAllowed()).toBe(true);

    expect(() => assertNetworkAllowed('https://www.googleapis.com/drive/v3/about')).not.toThrow();
  });

  it('guarantees zero network calls when offline (UT-07)', () => {
    setStorageMode('offline');
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    // Simulate an adapter checking the gate before calling fetch
    const safeDriveProbe = () => {
      assertNetworkAllowed('https://www.googleapis.com/drive/v3/about');
      return fetch('https://www.googleapis.com/drive/v3/about');
    };

    expect(() => safeDriveProbe()).toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
