import { deleteOwnedCaches } from './cache-utils';

export const CONTROL_RELOAD_KEY = 'ms-pwa-control-reloaded-v1';

export function parsePwaControl(raw: string): boolean | undefined {
  try {
    const value = JSON.parse(raw) as { swEnabled?: unknown };
    return typeof value.swEnabled === 'boolean' ? value.swEnabled : undefined;
  } catch {
    return undefined;
  }
}

export function isLocalPwaEscapeHatch(search: string): boolean {
  return new URLSearchParams(search).get('no-sw') === '1';
}

export async function readPwaControl(fetcher: typeof fetch, url: string): Promise<boolean | undefined> {
  try {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return undefined;
    return parsePwaControl(await response.text());
  } catch {
    return undefined;
  }
}

export async function disableOfflineFeatures(
  scopeUrl: string,
  serviceWorkers: Pick<ServiceWorkerContainer, 'getRegistrations'>,
  storage: Pick<CacheStorage, 'keys' | 'delete'>,
): Promise<void> {
  const scope = new URL(scopeUrl);
  const registrations = await serviceWorkers.getRegistrations();
  const inScope = registrations.filter((registration) => {
    const candidate = new URL(registration.scope);
    return candidate.origin === scope.origin && candidate.pathname.startsWith(scope.pathname);
  });
  await Promise.all(inScope.map((registration) => registration.unregister()));
  await deleteOwnedCaches(storage);
}

export function markControlReload(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): boolean {
  if (storage.getItem(CONTROL_RELOAD_KEY) === '1') return false;
  storage.setItem(CONTROL_RELOAD_KEY, '1');
  return true;
}

export function clearControlReload(storage: Pick<Storage, 'getItem' | 'removeItem'>): void {
  if (storage.getItem(CONTROL_RELOAD_KEY) === '1') storage.removeItem(CONTROL_RELOAD_KEY);
}
