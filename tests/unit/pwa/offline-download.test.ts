import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveBank } from '../../../src/features/drive-bank/bank-types';

const refreshRegisteredOfflineBank = vi.hoisted(() => vi.fn());
const listOfflineBanks = vi.hoisted(() => vi.fn());
const collectImageUrls = vi.hoisted(() => vi.fn());
const requestPersistentStorage = vi.hoisted(() => vi.fn());

vi.mock('../../../src/features/drive-bank/refresh-offline-bank', () => ({ refreshRegisteredOfflineBank }));
vi.mock('../../../src/pwa/offline-bank-cache', () => ({ listOfflineBanks }));
vi.mock('../../../src/pwa/collect-image-urls', () => ({ collectImageUrls }));
vi.mock('../../../src/pwa/storage-persistence', () => ({ requestPersistentStorage }));

import { downloadEverythingForOffline } from '../../../src/pwa/offline-download';

class FakePort {
  onmessage?: (event: { data: unknown }) => void;
  onmessageerror?: () => void;
  peer?: FakePort;
  close() {}
  postMessage(data: unknown) {
    this.peer?.onmessage?.({ data });
  }
}

class FakeMessageChannel {
  port1 = new FakePort();
  port2 = new FakePort();
  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

const bank = {
  schema_version: 'math-scratchpad.bank/1.0',
  bank_id: 'synthetic-bank',
  version: 'v1',
  questions: [],
} satisfies DriveBank;

function workerFixture(failures: Array<{ url: string; reason: string }> = []) {
  const postMessage = vi.fn((message: { type: string; urls?: string[] }, ports?: FakePort[]) => {
    const port = ports?.[0];
    if (message.type === 'CACHE_SHELL') {
      port?.postMessage({ type: 'SHELL_PROGRESS', done: 1, total: 1 });
      port?.postMessage({ type: 'SHELL_DONE', complete: true, failures: [] });
    }
    if (message.type === 'CACHE_IMAGES') {
      port?.postMessage({ type: 'CACHE_PROGRESS', done: message.urls?.length ?? 0, total: message.urls?.length ?? 0, failed: failures });
      port?.postMessage({ type: 'CACHE_DONE', failed: failures });
    }
  });
  return { postMessage } as unknown as ServiceWorker;
}

function setStorage(usage: number, quota: number) {
  const storage = { persist: vi.fn().mockResolvedValue(true), estimate: vi.fn().mockResolvedValue({ usage, quota }) };
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
  return storage;
}

beforeEach(() => {
  vi.stubGlobal('MessageChannel', FakeMessageChannel);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  refreshRegisteredOfflineBank.mockResolvedValue('saved');
  listOfflineBanks.mockResolvedValue({ banks: [{ bank }], corruptCount: 0 });
  collectImageUrls.mockReturnValue(['https://cdn.example.test/lesson.png']);
  requestPersistentStorage.mockResolvedValue(true);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'storage');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('download everything for offline use', () => {
  it('requests persistence, repairs the shell, refreshes the registered bank, and reports image progress', async () => {
    const worker = workerFixture();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: worker } });
    const storage = setStorage(0, 100_000_000);
    const progress: Array<{ phase: string; done: number; total: number }> = [];

    const result = await downloadEverythingForOffline((value) => progress.push(value));

    expect(requestPersistentStorage).toHaveBeenCalledOnce();
    expect(refreshRegisteredOfflineBank).toHaveBeenCalledOnce();
    expect(storage.estimate).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'CACHE_SHELL' }, expect.any(Array));
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'CACHE_IMAGES', urls: ['https://cdn.example.test/lesson.png'] },
      expect.any(Array),
    );
    expect(result).toMatchObject({ shellReady: true, banksCached: 1, imagesOk: 1, failed: [], persistenceGranted: true });
    expect(progress.map((value) => value.phase)).toEqual(['bank', 'shell', 'images']);
  });

  it('stops image caching and reports quota when less than 50 MB remains', async () => {
    const worker = workerFixture();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: worker } });
    setStorage(60_000_000, 100_000_000);

    const result = await downloadEverythingForOffline();

    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'CACHE_IMAGES' }), expect.anything());
    expect(result).toMatchObject({ shellReady: true, quotaLimited: true, imagesOk: 0, failed: [{ reason: 'quota' }] });
  });
});
