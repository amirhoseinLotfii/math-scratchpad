import { db } from './scratchpad-db';
import { LAST_EXPORT_KEY } from './chapter-bundle-service';

export interface StoragePersistenceStatus {
  persisted: boolean;
  daysSinceExport: number;
  requiresEvictionWarning: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

/**
 * Checks storage persistence and days since last export to evaluate data eviction risk.
 */
export async function checkStoragePersistenceStatus(): Promise<StoragePersistenceStatus> {
  let persisted = true;
  let usageBytes: number | undefined;
  let quotaBytes: number | undefined;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    if (navigator.storage.persisted) {
      try {
        persisted = await navigator.storage.persisted();
      } catch {
        persisted = false;
      }
    }

    if (navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        usageBytes = estimate.usage;
        quotaBytes = estimate.quota;
      } catch {
        // ignore
      }
    }
  }

  // Check last export timestamp
  let daysSinceExport = 0;
  try {
    const record = await db.app_meta.get(LAST_EXPORT_KEY);
    if (record && typeof record.value === 'string') {
      const lastExportMs = Date.parse(record.value);
      if (!Number.isNaN(lastExportMs)) {
        daysSinceExport = Math.floor((Date.now() - lastExportMs) / (1000 * 60 * 60 * 24));
      } else {
        daysSinceExport = 999;
      }
    } else {
      // Never exported
      daysSinceExport = 999;
    }
  } catch {
    daysSinceExport = 0;
  }

  const requiresEvictionWarning = !persisted || daysSinceExport > 7;

  return {
    persisted,
    daysSinceExport,
    requiresEvictionWarning,
    usageBytes,
    quotaBytes
  };
}

/**
 * Requests persistent storage permission from the browser.
 * Must only be called from an explicit user gesture (e.g. click).
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
