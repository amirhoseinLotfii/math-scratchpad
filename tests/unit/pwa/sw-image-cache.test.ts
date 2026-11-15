import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheImageWithResult } from '../../../src/pwa/sw-image-cache';

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
  else Reflect.deleteProperty(navigator, 'storage');
});

describe('service worker image cache reporting', () => {
  it('skips a bulk image request before fetching when less than 50 MB remains', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ quota: 100_000_000, usage: 60_000_001 }) },
    });

    const result = await cacheImageWithResult(new Request('https://cdn.example.test/diagram.png'), { cacheOnly: true });

    expect(result).toMatchObject({ cached: false, reason: 'quota' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports an opaque cross-origin response as not CORS-readable', async () => {
    const opaque = new Response(null, { status: 200 });
    Object.defineProperty(opaque, 'type', { value: 'opaque' });
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('CORS blocked')).mockResolvedValueOnce(opaque);
    vi.stubGlobal('fetch', fetcher);

    const result = await cacheImageWithResult(new Request('https://cdn.example.test/private.png', { mode: 'cors' }));

    expect(result).toMatchObject({ cached: false, reason: 'not_cors_readable' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the network response usable while reporting a failed CacheStorage write', async () => {
    const response = new Response(new Uint8Array([1, 2]), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '2' },
    });
    Object.defineProperty(response, 'type', { value: 'basic' });
    response.clone = () => response;
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockRejectedValue(new DOMException('Storage is full', 'QuotaExceededError')),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });

    const result = await cacheImageWithResult(new Request('https://cdn.example.test/diagram.png'));

    expect(result).toMatchObject({ cached: false, reason: 'quota' });
    expect(result.response.status).toBe(200);
    expect(cache.put).toHaveBeenCalledOnce();
  });
});
