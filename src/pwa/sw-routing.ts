import { hasCredentialQuery } from './image-safety';

const networkOnly = new Set(['version.json', 'sw.js', 'precache-manifest.json', 'pwa-control.json']);
export type Route = 'navigation' | 'shell-asset' | 'image' | 'network';

export function serviceWorkerRoute(
  request: Pick<Request, 'url' | 'method' | 'headers' | 'mode' | 'destination' | 'credentials'>,
  scope: URL,
  precache: ReadonlySet<string>,
): Route {
  if (request.method !== 'GET' || request.headers.has('Authorization')) return 'network';
  const url = new URL(request.url);
  if (hasCredentialQuery(url)) return 'network';
  const inScope = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  if (url.origin !== scope.origin && request.credentials === 'include') return 'network';
  const path = inScope ? url.pathname.slice(scope.pathname.length) : '';
  if (networkOnly.has(path)) return 'network';
  if (inScope && request.mode === 'navigate') return 'navigation';
  if (inScope && precache.has(path)) return 'shell-asset';
  if (request.destination === 'image' && (inScope || (url.origin !== scope.origin && url.protocol === 'https:'))) return 'image';
  return 'network';
}
