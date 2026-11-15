import { deleteOwnedCaches } from './cache-utils';

export async function destroyOfflineWorker(options: {
  scopeUrl: string;
  cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>;
  unregister: () => Promise<boolean>;
  windows: Pick<Clients, 'matchAll'>;
}): Promise<void> {
  await deleteOwnedCaches(options.cacheStorage);
  await options.unregister();
  const scope = new URL(options.scopeUrl);
  const clients = await options.windows.matchAll({ type: 'window', includeUncontrolled: true });
  const inScope = clients.filter((client) => {
    const url = new URL(client.url);
    return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  });
  await Promise.all(
    inScope.map((client) => {
      const target = new URL(client.url);
      target.searchParams.set('no-sw', '1');
      return client.navigate(target.href).catch(() => undefined);
    }),
  );
}
