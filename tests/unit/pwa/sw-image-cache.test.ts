import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheImageWithResult } from '../../../src/pwa/sw-image-cache';

afterEach(() => vi.unstubAllGlobals());

describe('service worker image cache reporting', () => {
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
