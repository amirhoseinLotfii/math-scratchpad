import { APP_BUILD_SHA } from './build-identity';
import { disableOfflineFeatures } from './kill-switch';
import {
  clearCompletedReloadIntent,
  consumeReloadIntent,
  flushBeforeUpdate,
  publishUpdateReady,
  requestWorkerIdentity,
  RELOAD_INTENT_KEY,
  supportsWorkerSchema,
  UPDATE_CHANNEL_NAME,
  type WorkerIdentity,
} from './update-flow';
import { UPDATE_STATE_EVENT } from './update-contract';

const VISIBILITY_THROTTLE_MS = 10 * 60 * 1000;
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const UPDATE_ACTIVATION_TIMEOUT_MS = 15_000;
let currentRegistration: ServiceWorkerRegistration | undefined;
let stopCurrent: (() => void) | undefined;
let channel: BroadcastChannel | undefined;
let lastVisibleCheck = 0;
let killSwitchInProgress = false;

function announce(available: boolean, identity?: WorkerIdentity): void {
  window.dispatchEvent(
    new CustomEvent(UPDATE_STATE_EVENT, {
      detail: { available, sha: identity?.sha ?? '', minDataSchema: identity?.minDataSchema ?? 0 },
    }),
  );
  if (available && identity && channel) publishUpdateReady(channel, identity);
}

async function inspectWaiting(registration: ServiceWorkerRegistration): Promise<void> {
  const waiting = registration.waiting;
  if (!waiting) {
    announce(false);
    return;
  }
  const identity = await requestWorkerIdentity(waiting);
  if (!identity) return;
  if (identity.killSwitch) {
    announce(false, identity);
    if (killSwitchInProgress) return;
    killSwitchInProgress = true;
    const target = new URL(location.href);
    target.searchParams.set('no-sw', '1');
    await disableOfflineFeatures(registration.scope, navigator.serviceWorker, caches).catch(() => undefined);
    window.location.replace(target.href);
    return;
  }
  if (!supportsWorkerSchema(identity)) {
    console.warn(`Service worker ${identity.sha} requires data schema ${identity.minDataSchema}; this page supports ${1}.`);
    announce(false, identity);
    return;
  }
  announce(true, identity);
}

function reportClientVersion(registration = currentRegistration): void {
  if (!registration || !('serviceWorker' in navigator)) return;
  (navigator.serviceWorker.controller ?? registration.active)?.postMessage({ type: 'CLIENT_VERSION', sha: APP_BUILD_SHA });
}

function handleWorkerMessage(event: MessageEvent): void {
  const data = event.data as { type?: string } | null;
  if (data?.type !== 'REQUEST_CLIENT_VERSION') return;
  const source = event.source as ServiceWorker | null;
  source?.postMessage({ type: 'CLIENT_VERSION', sha: APP_BUILD_SHA });
}

function handleControllerChange(): void {
  reportClientVersion();
  try {
    if (consumeReloadIntent(sessionStorage)) window.location.reload();
  } catch {
    /* Storage restrictions must not block the app from switching controllers. */
  }
}

function handleBroadcast(event: MessageEvent): void {
  const data = event.data as { type?: string; sha?: string; minDataSchema?: number } | null;
  if (data?.type !== 'update-ready' || typeof data.sha !== 'string' || !Number.isSafeInteger(data.minDataSchema)) return;
  const identity = { sha: data.sha, minDataSchema: data.minDataSchema as number };
  if (supportsWorkerSchema(identity)) announce(true, identity);
}

function clearControllerListeners(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
    navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }
}

export function stopUpdateDetection(): void {
  stopCurrent?.();
  stopCurrent = undefined;
  currentRegistration = undefined;
  channel?.close();
  channel = undefined;
  clearControllerListeners();
}

export function startUpdateDetection(registration: ServiceWorkerRegistration): void {
  if (currentRegistration === registration) return;
  stopUpdateDetection();
  currentRegistration = registration;
  lastVisibleCheck = 0;
  try {
    clearCompletedReloadIntent(sessionStorage);
  } catch {
    /* Session storage is optional; the in-memory controller still works. */
  }

  const check = () =>
    void registration
      .update()
      .then(() => inspectWaiting(registration))
      .catch(() => undefined);
  const onOnline = () => check();
  const onVisibility = () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastVisibleCheck < VISIBILITY_THROTTLE_MS) return;
    lastVisibleCheck = Date.now();
    check();
  };
  const onUpdateFound = () => {
    const installing = registration.installing;
    if (!installing) return;
    const onStateChange = () => {
      if (installing.state === 'installed' && registration.waiting) void inspectWaiting(registration);
    };
    installing.addEventListener('statechange', onStateChange);
  };
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, UPDATE_INTERVAL_MS);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);
  registration.addEventListener('updatefound', onUpdateFound);
  navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
  navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
  channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(UPDATE_CHANNEL_NAME);
  channel?.addEventListener('message', handleBroadcast);
  reportClientVersion(registration);
  void inspectWaiting(registration);
  check();

  stopCurrent = () => {
    window.clearInterval(timer);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
    registration.removeEventListener('updatefound', onUpdateFound);
    channel?.removeEventListener('message', handleBroadcast);
    clearControllerListeners();
  };
}

export async function activateWaitingUpdate(registration = currentRegistration): Promise<void> {
  const waiting = registration?.waiting;
  if (!waiting) throw new Error('نسخهٔ جدید آماده نیست.');
  const identity = await requestWorkerIdentity(waiting);
  if (!identity) throw new Error('نسخهٔ جدید پاسخ نداد؛ دوباره بررسی کن.');
  if (!supportsWorkerSchema(identity)) throw new Error('این نسخه با ساختار دادهٔ این برنامه سازگار نیست.');
  await flushBeforeUpdate();
  const controllerChanged = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      reject(new Error('بارگذاری نسخهٔ جدید طول کشید؛ پاسخ‌ها ذخیره شده‌اند و می‌توانی دوباره تلاش کنی.'));
    }, UPDATE_ACTIVATION_TIMEOUT_MS);
    const changed = () => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', changed);
  });
  try {
    sessionStorage.setItem(RELOAD_INTENT_KEY, 'pending');
  } catch {
    /* The waiting worker can still activate; reload is then manual. */
  }
  channel?.postMessage({ type: 'update-reloading', sha: identity.sha });
  await waiting.postMessage({ type: 'SKIP_WAITING' });
  await controllerChanged;
}
