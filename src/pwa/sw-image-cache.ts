export const IMAGE_CACHE = 'ms-images-v1';
const MAX_IMAGES = 300;
const MAX_BYTES = 60_000_000;

type ImageEntry = { url: string; bytes: number; usedAt: number };
const metadataKey = new URL('__offline-image-index', self.location.href).href;
let writes: Promise<unknown> = Promise.resolve();

async function imageIndex(cache: Cache): Promise<ImageEntry[]> {
  const stored = await cache.match(metadataKey);
  if (!stored) return [];
  try {
    return (await stored.json()) as ImageEntry[];
  } catch {
    return [];
  }
}

async function writeIndex(cache: Cache, entries: ImageEntry[]) {
  await cache.put(metadataKey, Response.json(entries));
}

export async function cacheImage(request: Request) {
  const response = await fetch(request);
  if (response.status !== 200 || !['basic', 'cors'].includes(response.type)) return response;
  if (!(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) return response;
  const copy = response.clone();
  const requestedBytes = Number(copy.headers.get('content-length'));
  if (requestedBytes > MAX_BYTES) return response;
  const bytes = requestedBytes > 0 ? requestedBytes : (await copy.clone().blob()).size;
  if (bytes > MAX_BYTES) return response;

  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const entries = (await imageIndex(cache)).filter((item) => item.url !== request.url);
      entries.push({ url: request.url, bytes, usedAt: Date.now() });
      entries.sort((a, b) => a.usedAt - b.usedAt);
      let total = entries.reduce((sum, item) => sum + item.bytes, 0);
      while (entries.length > MAX_IMAGES || total > MAX_BYTES) {
        const entry = entries.shift()!;
        total -= entry.bytes;
        await cache.delete(entry.url);
      }
      await cache.put(request, copy);
      await writeIndex(cache, entries);
    });
  writes = write;
  await write.catch(() => undefined);
  return response;
}

export async function readCachedImage(request: Request) {
  const cache = await caches.open(IMAGE_CACHE);
  const response = await cache.match(request);
  if (!response) return undefined;
  const touch = writes
    .catch(() => undefined)
    .then(async () => {
      const entries = await imageIndex(cache);
      const item = entries.find((entry) => entry.url === request.url);
      if (item) {
        item.usedAt = Date.now();
        await writeIndex(cache, entries);
      }
    });
  writes = touch;
  void touch.catch(() => undefined);
  return response;
}

export async function imageCacheStatus() {
  const entries = await imageIndex(await caches.open(IMAGE_CACHE));
  return { count: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0) };
}
