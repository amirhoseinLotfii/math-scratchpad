/// <reference lib="webworker" />
import { cacheImage, cacheImageWithResult, imageCacheStatus, readCachedImage } from './sw-image-cache';
import { serviceWorkerRoute } from './sw-routing';
import { hasCredentialQuery } from './image-safety';
import { shellCachesToDelete } from './sw-shell-cleanup';
import { destroyOfflineWorker } from './sw-kill';

declare const BUILD_SHA: string;
declare const PRECACHE_PATHS: string[];
declare const MIN_DATA_SCHEMA: number;
declare const PWA_KILL_SWITCH: boolean;
const worker = self as unknown as ServiceWorkerGlobalScope;
const shellPrefix = 'ms-shell-';
const clientVersionsCache = 'ms-client-versions-v1';
const shell = shellPrefix + BUILD_SHA;
const shellPaths = new Set(PRECACHE_PATHS);
const scope = new URL(worker.registration.scope);
const indexUrl = new URL('index.html', scope).href;
const cacheNames = async () => (await caches.keys()).filter((name) => name.startsWith(shellPrefix));

function clientVersionRequest(clientId: string): Request {
  return new Request(new URL(`__client_versions__/${encodeURIComponent(clientId)}`, scope));
}

async function clientVersionState() {
  const clients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const alive = new Set(clients.map((client) => client.id));
  const cache = await caches.open(clientVersionsCache);
  const keys = await cache.keys();
  const inUseShas = new Set<string>();
  let hasClientReports = false;
  for (const request of keys) {
    const clientId = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1) ?? '');
    if (!alive.has(clientId)) {
      await cache.delete(request);
      continue;
    }
    const response = await cache.match(request);
    const value = (await response?.json().catch(() => null)) as { sha?: unknown } | null;
    if (typeof value?.sha === 'string') {
      hasClientReports = true;
      inUseShas.add(value.sha);
    }
  }
  return { inUseShas, hasClientReports };
}

async function cleanupShellCaches(): Promise<void> {
  const names = await caches.keys();
  const state = await clientVersionState();
  const obsolete = shellCachesToDelete(names, shell, state.inUseShas, state.hasClientReports);
  await Promise.all(obsolete.map((name) => caches.delete(name)));
}

async function requestClientVersions(): Promise<void> {
  const clients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'REQUEST_CLIENT_VERSION' }));
  await new Promise((resolve) => setTimeout(resolve, 100));
}

worker.addEventListener('install', (event) => {
  if (PWA_KILL_SWITCH) {
    worker.skipWaiting();
    return;
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(shell);
      try {
        await cache.addAll(PRECACHE_PATHS.map((path) => new Request(new URL(path, scope), { cache: 'reload' })));
      } catch (error) {
        await caches.delete(shell);
        throw error;
      }
    })(),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (PWA_KILL_SWITCH) {
        await destroyOfflineWorker({
          scopeUrl: scope.href,
          cacheStorage: caches,
          unregister: () => worker.registration.unregister(),
          windows: worker.clients,
        });
        return;
      }
      await requestClientVersions();
      await cleanupShellCaches();
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('fetch', (event) => {
  if (PWA_KILL_SWITCH) return;
  const request = event.request;
  const route = serviceWorkerRoute(request, scope, shellPaths);
  if (route === 'network') return;
  if (route === 'image') {
    const cached = readCachedImage(request);
    const network = cacheImage(request).catch(() => undefined);
    event.waitUntil(network.then(() => undefined));
    event.respondWith((async () => (await cached) ?? (await network) ?? Response.error())());
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(shell);
      const key = route === 'navigation' ? indexUrl : new URL(new URL(request.url).pathname, scope.origin).href;
      const active = await cache.match(key);
      if (active && route === 'navigation' && new URL(request.url).pathname !== scope.pathname) {
        const html = await active.text();
        const head = html.replace('<head>', `<head><base href="${scope.pathname}">`);
        return new Response(head, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      if (active) return active;
      if (route === 'shell-asset') {
        const previous = (await cacheNames()).filter((name) => name !== shell).at(-1);
        const oldAsset = previous ? await (await caches.open(previous)).match(key) : undefined;
        if (oldAsset) return oldAsset;
      }
      return fetch(request);
    })(),
  );
});

async function cacheImageList(source: Client, urls: string[]) {
  const failed: Array<{ url: string; reason: string }> = [];
  for (const [index, url] of urls.entries()) {
    try {
      const request = new Request(url, { mode: 'cors', credentials: 'omit' });
      const result = await cacheImageWithResult(request);
      if (!result.cached) failed.push({ url, reason: result.reason });
    } catch {
      failed.push({ url, reason: 'network_error' });
    }
    source.postMessage({ type: 'CACHE_PROGRESS', done: index + 1, total: urls.length, failed });
  }
}

worker.addEventListener('message', (event) => {
  const source = event.source;
  if (!source || !('type' in source) || source.type !== 'window' || new URL(source.url).origin !== scope.origin) return;
  const data = event.data as { type?: unknown; urls?: unknown; sha?: unknown } | null;
  if (!data || typeof data !== 'object') return;
  if (PWA_KILL_SWITCH) {
    if (data.type === 'GET_VERSION') {
      const reply = { type: 'VERSION', sha: BUILD_SHA, minDataSchema: MIN_DATA_SCHEMA, killSwitch: true };
      source.postMessage(reply);
      event.ports[0]?.postMessage(reply);
    } else if (data.type === 'SKIP_WAITING') {
      worker.skipWaiting();
    }
    return;
  }
  if (data.type === 'SKIP_WAITING') event.waitUntil(worker.skipWaiting());
  else if (data.type === 'GET_VERSION') {
    const reply = { type: 'VERSION', sha: BUILD_SHA, minDataSchema: MIN_DATA_SCHEMA, killSwitch: false };
    source.postMessage(reply);
    event.ports[0]?.postMessage(reply);
  } else if (data.type === 'CLIENT_VERSION' && typeof data.sha === 'string' && data.sha.length <= 80) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(clientVersionsCache);
        await cache.put(clientVersionRequest(source.id), new Response(JSON.stringify({ sha: data.sha })));
        await cleanupShellCaches();
      })(),
    );
  } else if (data.type === 'CACHE_STATUS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(shell);
        const keys = await cache.keys();
        source.postMessage({
          type: 'CACHE_STATUS',
          shell: { sha: BUILD_SHA, complete: keys.length >= PRECACHE_PATHS.length },
          images: await imageCacheStatus(),
        });
      })(),
    );
  } else if (data.type === 'CACHE_IMAGES' && Array.isArray(data.urls) && data.urls.length <= 300) {
    const urls = data.urls.filter((value): value is string => {
      if (typeof value !== 'string' || value.length > 2000) return false;
      try {
        const url = new URL(value);
        return !url.username && !url.password && !hasCredentialQuery(url) && (url.origin === scope.origin || url.protocol === 'https:');
      } catch {
        return false;
      }
    });
    event.waitUntil(cacheImageList(source, [...new Set(urls)]));
  }
});
