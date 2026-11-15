import { describe, expect, it, vi } from 'vitest';
import {
  clearControlReload,
  disableOfflineFeatures,
  isLocalPwaEscapeHatch,
  markControlReload,
  parsePwaControl,
  readPwaControl,
} from '../../../src/pwa/kill-switch';
import { CONTROL_RELOAD_KEY } from '../../../src/pwa/kill-switch';
import { destroyOfflineWorker } from '../../../src/pwa/sw-kill';

describe('offline kill switch', () => {
  it('parses valid control data and ignores invalid content', () => {
    expect(parsePwaControl('{"swEnabled":false}')).toBe(false);
    expect(parsePwaControl('{"swEnabled":true}')).toBe(true);
    expect(parsePwaControl('{"swEnabled":"false"}')).toBeUndefined();
    expect(parsePwaControl('invalid')).toBeUndefined();
  });

  it('fetches the control file without using an HTTP cache', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"swEnabled":false}'));
    await expect(readPwaControl(fetcher, '/pwa-control.json')).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledWith('/pwa-control.json', { cache: 'no-store', credentials: 'same-origin' });
  });

  it('recognizes only the explicit local escape hatch', () => {
    expect(isLocalPwaEscapeHatch('?no-sw=1')).toBe(true);
    expect(isLocalPwaEscapeHatch('?no-sw=0')).toBe(false);
    expect(isLocalPwaEscapeHatch('?other=1')).toBe(false);
  });

  it('unregisters only in-scope workers and deletes only app caches', async () => {
    const registrations = [
      { scope: 'https://example.test/math-scratchpad/', unregister: vi.fn() },
      { scope: 'https://example.test/other/', unregister: vi.fn() },
      { scope: 'https://elsewhere.test/math-scratchpad/', unregister: vi.fn() },
    ] as unknown as ServiceWorkerRegistration[];
    const serviceWorkers = { getRegistrations: vi.fn().mockResolvedValue(registrations) };
    const deleted: string[] = [];
    const names = ['ms-shell-a', 'ms-images-v1', 'unrelated-cache'];
    const cacheStorage = {
      keys: vi.fn().mockResolvedValue(names),
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return true;
      }),
    };
    const userData = { localStorage: ['sentinel=value'], indexedDb: ['record:byte-identical'] };
    const before = structuredClone(userData);

    await disableOfflineFeatures('https://example.test/math-scratchpad/', serviceWorkers, cacheStorage);

    expect(registrations[0].unregister).toHaveBeenCalledOnce();
    expect(registrations[1].unregister).not.toHaveBeenCalled();
    expect(registrations[2].unregister).not.toHaveBeenCalled();
    expect(deleted).toEqual(['ms-shell-a', 'ms-images-v1']);
    expect(userData).toEqual(before);
  });

  it('prevents a remote kill flag from reloading forever', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    expect(markControlReload(storage)).toBe(true);
    expect(markControlReload(storage)).toBe(false);
    clearControlReload(storage);
    expect(values.has(CONTROL_RELOAD_KEY)).toBe(false);
  });

  it('self-destructs by clearing app caches, unregistering, and reloading in-scope clients', async () => {
    const names = ['ms-shell-a', 'ms-images-v1', 'unrelated-cache'];
    const deleted: string[] = [];
    const cacheStorage = {
      keys: vi.fn().mockResolvedValue(names),
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return true;
      }),
    };
    const unregister = vi.fn().mockResolvedValue(true);
    const clients = [
      { url: 'https://example.test/math-scratchpad/?x=1', navigate: vi.fn().mockResolvedValue(null) },
      { url: 'https://example.test/other/', navigate: vi.fn().mockResolvedValue(null) },
    ];
    const windows = { matchAll: vi.fn().mockResolvedValue(clients) };

    await destroyOfflineWorker({ scopeUrl: 'https://example.test/math-scratchpad/', cacheStorage, unregister, windows });

    expect(deleted).toEqual(['ms-shell-a', 'ms-images-v1']);
    expect(unregister).toHaveBeenCalledOnce();
    expect(clients[0].navigate).toHaveBeenCalledWith('https://example.test/math-scratchpad/?x=1&no-sw=1');
    expect(clients[1].navigate).not.toHaveBeenCalled();
  });
});
