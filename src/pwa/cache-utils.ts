export const APP_CACHE_PREFIX = 'ms-';

export async function deleteOwnedCaches(storage: Pick<CacheStorage, 'keys' | 'delete'>): Promise<string[]> {
  const names = await storage.keys();
  const owned = names.filter((name) => name.startsWith(APP_CACHE_PREFIX));
  await Promise.all(owned.map((name) => storage.delete(name)));
  return owned;
}
