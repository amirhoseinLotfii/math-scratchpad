export async function registerOfflineWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;
  if (location.pathname.endsWith('/standalone.html') || new URLSearchParams(location.search).get('no-sw') === '1') return undefined;
  const script = new URL('sw.js', document.baseURI);
  return navigator.serviceWorker.register(script, { scope: './', updateViaCache: 'none' });
}
