import type { Page } from '@playwright/test';

const DB_NAME = 'math-scratchpad-sync-v2';
const CACHE_STORE = 'cache';

export async function resetLearningDatabase(page: Page): Promise<void> {
  await page.evaluate(async dbName => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('A browser tab kept the test IndexedDB open during reset.'));
  }), DB_NAME);
}

export async function readLearningCache(page: Page, key: string): Promise<string | null> {
  return page.evaluate(async ({ dbName, storeName, recordKey }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(recordKey);
        request.onsuccess = () => resolve((request.result as { value?: string } | undefined)?.value ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, { dbName: DB_NAME, storeName: CACHE_STORE, recordKey: key });
}

export async function readOutboxCount(page: Page): Promise<number> {
  return page.evaluate(async dbName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, DB_NAME);
}

export async function readLegacyMigration(page: Page): Promise<unknown> {
  return page.evaluate(async dbName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('meta', 'readonly').objectStore('meta').get('legacy-migration-v1');
        request.onsuccess = () => resolve((request.result as { value?: unknown } | undefined)?.value ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, DB_NAME);
}

export async function readOutboxEvents(page: Page): Promise<Array<{ type?: string; steps?: string[] }>> {
  return page.evaluate(async dbName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Array<{ type?: string; steps?: string[] }>>((resolve, reject) => {
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => resolve((request.result as Array<{ event: { type?: string; steps?: string[] } }>).map(record => record.event));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, DB_NAME);
}

export async function writeLearningCacheFromOtherTab(page: Page, key: string, value: string) {
  await page.evaluate(async ({ dbName, storeName, recordKey, recordValue }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({ key: recordKey, value: recordValue, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const channel = new BroadcastChannel('math-scratchpad-learning-cache-v1');
    channel.postMessage({ key: recordKey, value: recordValue, updatedAt: new Date().toISOString() });
    channel.close();
  }, { dbName: DB_NAME, storeName: CACHE_STORE, recordKey: key, recordValue: value });
}
