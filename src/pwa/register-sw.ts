import { clearControlReload, disableOfflineFeatures, isLocalPwaEscapeHatch, markControlReload, readPwaControl } from './kill-switch';
import { startUpdateDetection } from './update-controller';

export async function registerOfflineWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;
  if (location.pathname.endsWith('/standalone.html')) return undefined;
  const scope = new URL('./', document.baseURI).href;
  if (isLocalPwaEscapeHatch(location.search)) {
    await disableOfflineFeatures(scope, navigator.serviceWorker, caches).catch(() => undefined);
    return undefined;
  }
  if (navigator.onLine) {
    const controlUrl = new URL('pwa-control.json', document.baseURI);
    controlUrl.searchParams.set('_', String(Date.now()));
    const enabled = await readPwaControl(fetch, controlUrl.href);
    if (enabled === false) {
      await disableOfflineFeatures(scope, navigator.serviceWorker, caches).catch(() => undefined);
      try {
        if (markControlReload(sessionStorage)) location.reload();
      } catch {
        /* The service worker is already disabled; session storage only prevents reload loops. */
      }
      return undefined;
    }
    try {
      clearControlReload(sessionStorage);
    } catch {
      /* The normal registration path is still safe when session storage is disabled. */
    }
  }
  const script = new URL('sw.js', document.baseURI);
  const registration = await navigator.serviceWorker.register(script, { scope: './', updateViaCache: 'none' });
  startUpdateDetection(registration);
  return registration;
}
