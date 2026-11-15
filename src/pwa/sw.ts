/// <reference lib="webworker" />
import { cacheImage, imageCacheStatus, readCachedImage } from './sw-image-cache';
import { serviceWorkerRoute } from './sw-routing';

declare const BUILD_SHA: string;
declare const PRECACHE_PATHS: string[];
const worker = self as unknown as ServiceWorkerGlobalScope;
const shellPrefix = 'ms-shell-';
const shell = shellPrefix + BUILD_SHA;
const shellPaths = new Set(PRECACHE_PATHS);
const scope = new URL(worker.registration.scope);
const indexUrl = new URL('index.html', scope).href;
const cacheNames = async () => (await caches.keys()).filter((name) => name.startsWith(shellPrefix));

worker.addEventListener('install', (event) => {
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
      const older = (await cacheNames()).filter((name) => name !== shell);
      const previous = older.pop();
      await Promise.all(older.map((name) => caches.delete(name)));
      if (!previous) await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('fetch', (event) => {
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
      const response = await cacheImage(request);
      const readable = response.ok && response.type !== 'opaque';
      if (!readable || !response.headers.get('content-type')?.startsWith('image/')) {
        throw new Error('Image response unavailable');
      }
    } catch {
      failed.push({ url, reason: 'image_unavailable' });
    }
    source.postMessage({ type: 'CACHE_PROGRESS', done: index + 1, total: urls.length, failed });
  }
}

worker.addEventListener('message', (event) => {
  const source = event.source;
  if (!source || !('type' in source) || source.type !== 'window' || new URL(source.url).origin !== scope.origin) return;
  const data = event.data as { type?: unknown; urls?: unknown } | null;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') event.waitUntil(worker.skipWaiting());
  else if (data.type === 'GET_VERSION') source.postMessage({ type: 'VERSION', sha: BUILD_SHA });
  else if (data.type === 'CACHE_STATUS') {
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
        return !url.username && !url.password && (url.origin === scope.origin || url.protocol === 'https:');
      } catch {
        return false;
      }
    });
    event.waitUntil(cacheImageList(source, [...new Set(urls)]));
  }
});
