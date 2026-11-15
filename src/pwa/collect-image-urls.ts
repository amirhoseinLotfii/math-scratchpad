import type { DriveBank } from '../features/drive-bank/bank-types';
import { hasCredentialQuery } from './image-safety';

export function collectImageUrls(banks: readonly DriveBank[], baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const urls = new Set<string>();
  for (const bank of banks) {
    for (const lesson of bank.lessons ?? []) {
      for (const concept of lesson.concepts) {
        for (const block of concept.blocks) {
          if (block.type !== 'image') continue;
          try {
            const url = new URL(block.src, base);
            if (url.username || url.password || hasCredentialQuery(url) || (url.origin !== base.origin && url.protocol !== 'https:'))
              continue;
            urls.add(url.href);
          } catch {
            // Invalid optional images are left to the existing fallback card.
          }
        }
      }
    }
  }
  return [...urls];
}

export function requestImageCache(banks: readonly DriveBank[]): number {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 0;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return 0;
  const urls = collectImageUrls(banks, document.baseURI);
  for (let offset = 0; offset < urls.length; offset += 300) {
    controller.postMessage({ type: 'CACHE_IMAGES', urls: urls.slice(offset, offset + 300) });
  }
  return urls.length;
}
