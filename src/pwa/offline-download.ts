import { refreshRegisteredOfflineBank, type RegisteredBankRefresh } from '../features/drive-bank/refresh-offline-bank';
import type { DriveBank } from '../features/drive-bank/bank-types';
import { listOfflineBanks } from './offline-bank-cache';
import { collectImageUrls } from './collect-image-urls';
import { requestPersistentStorage } from './storage-persistence';

export const MIN_FREE_IMAGE_BYTES = 50_000_000;
const WORKER_TIMEOUT_MS = 60_000;
const IMAGE_BATCH_SIZE = 300;

export type OfflineDownloadProgress = {
  phase: 'bank' | 'shell' | 'images';
  done: number;
  total: number;
};

export type OfflineImageFailure = { url: string; reason: string };
export type OfflineDownloadSummary = {
  shellReady: boolean;
  banksCached: number;
  imagesOk: number;
  failed: OfflineImageFailure[];
  persistenceGranted: boolean | null;
  bankRefresh: RegisteredBankRefresh;
  bankWarning?: string;
  quotaLimited: boolean;
};

type WorkerMessage = {
  type?: string;
  complete?: boolean;
  done?: number;
  total?: number;
  failed?: OfflineImageFailure[];
  failures?: Array<{ path: string; reason: string }>;
  cached?: number;
};

function serviceWorker(): ServiceWorker | undefined {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.controller ?? undefined;
}

function requestWorker<T extends WorkerMessage>(worker: ServiceWorker, message: Record<string, unknown>, onProgress?: (value: T) => void) {
  return new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('Service worker did not finish the offline download request.'));
    }, WORKER_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<T>) => {
      const value = event.data;
      if (value?.type === 'CACHE_PROGRESS' || value?.type === 'SHELL_PROGRESS') {
        onProgress?.(value);
        return;
      }
      if (value?.type === 'CACHE_DONE' || value?.type === 'SHELL_DONE') {
        window.clearTimeout(timeout);
        channel.port1.close();
        resolve(value);
      }
    };
    channel.port1.onmessageerror = () => {
      window.clearTimeout(timeout);
      channel.port1.close();
      reject(new Error('Service worker returned an unreadable offline download result.'));
    };
    worker.postMessage(message, [channel.port2]);
  });
}

async function remainingStorageBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate?.quota === undefined) return null;
    return Math.max(0, estimate.quota - (estimate.usage ?? 0));
  } catch {
    return null;
  }
}

function cachedBanks(banks: readonly { bank: DriveBank }[]): DriveBank[] {
  return banks.map(({ bank }) => bank);
}

function bankRefreshWarning(status: RegisteredBankRefresh): string | undefined {
  if (status === 'unavailable') {
    return 'بانک انتخاب‌شده تازه نشد؛ از نسخهٔ ذخیره‌شده استفاده شد.';
  }
  if (status === 'empty') return 'فایل بانک انتخاب‌شده خالی است.';
  return undefined;
}

export async function downloadEverythingForOffline(onProgress: (progress: OfflineDownloadProgress) => void = () => undefined) {
  const persistenceGranted = await requestPersistentStorage();
  let bankRefresh: RegisteredBankRefresh = 'unavailable';
  let bankWarning: string | undefined;
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      bankRefresh = await refreshRegisteredOfflineBank();
      bankWarning = bankRefreshWarning(bankRefresh);
    } catch (error) {
      if (error instanceof Error) bankWarning = error.message;
      else bankWarning = 'نسخهٔ تازهٔ بانک ذخیره نشد؛ کپی قبلی حفظ شد.';
    }
  }

  onProgress({ phase: 'bank', done: 1, total: 1 });
  const banks = await listOfflineBanks();
  if (banks.corruptCount > 0) {
    bankWarning = 'بعضی رکوردهای بانک آفلاین تأیید نشدند و دست‌نخورده ماندند.';
  }
  const images = collectImageUrls(cachedBanks(banks.banks), document.baseURI);
  const worker = serviceWorker();
  if (!worker) {
    return {
      shellReady: false,
      banksCached: banks.banks.length,
      imagesOk: 0,
      failed: images.map((url) => ({ url, reason: 'service_worker_unavailable' })),
      persistenceGranted,
      bankRefresh,
      bankWarning,
      quotaLimited: false,
    } satisfies OfflineDownloadSummary;
  }

  let shellReady = false;
  const failed: OfflineImageFailure[] = [];
  try {
    const shell = await requestWorker<WorkerMessage>(worker, { type: 'CACHE_SHELL' }, (progress) =>
      onProgress({ phase: 'shell', done: progress.done ?? 0, total: progress.total ?? 0 }),
    );
    shellReady = shell.complete === true;
    for (const item of shell.failures ?? []) {
      failed.push({ url: new URL(item.path, document.baseURI).href, reason: `shell_${item.reason}` });
    }
  } catch {
    shellReady = false;
  }

  let imagesOk = 0;
  let quotaLimited = false;
  const availableBytes = await remainingStorageBytes();
  if (availableBytes !== null && availableBytes < MIN_FREE_IMAGE_BYTES) {
    quotaLimited = true;
    failed.push(...images.map((url) => ({ url, reason: 'quota' })));
    onProgress({ phase: 'images', done: images.length, total: images.length });
  } else {
    for (let offset = 0; offset < images.length; offset += IMAGE_BATCH_SIZE) {
      const batch = images.slice(offset, offset + IMAGE_BATCH_SIZE);
      try {
        const result = await requestWorker<WorkerMessage>(worker, { type: 'CACHE_IMAGES', urls: batch }, (progress) => {
          onProgress({ phase: 'images', done: offset + (progress.done ?? 0), total: images.length });
        });
        const batchFailures = result.failed ?? [];
        failed.push(...batchFailures);
        imagesOk += Math.max(0, batch.length - batchFailures.length);
        quotaLimited ||= batchFailures.some((item) => item.reason === 'quota');
      } catch {
        failed.push(...batch.map((url) => ({ url, reason: 'service_worker_error' })));
      }
    }
  }
  return {
    shellReady,
    banksCached: banks.banks.length,
    imagesOk,
    failed,
    persistenceGranted,
    bankRefresh,
    bankWarning,
    quotaLimited,
  } satisfies OfflineDownloadSummary;
}
