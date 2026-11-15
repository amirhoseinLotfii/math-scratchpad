import { getAuthenticatedServerStorage } from '../sync/browser-db';
import { getDefaultSyncRuntime, type SyncStatus } from '../sync/runtime';
import { SERVER_STORAGE_BUDGET_EVENT } from '../sync/server-storage';

export const GATE_STATUS_EVENT = 'math-scratchpad:gate-status';
export type GateReason = 'checking' | 'online' | 'offline' | 'needs_login' | 'error' | 'local_only';
export type PwaState = 'offline' | 'queued' | 'syncing' | 'synced' | 'needs_login' | 'error' | 'update_ready' | 'checking';
export type ConnectivitySnapshot = {
  online: boolean;
  gate: { kind: 'checking' | 'online' | 'blocked'; reason: GateReason };
  sync: Pick<SyncStatus, 'phase' | 'pending' | 'quarantined' | 'lastSyncedAt' | 'lastError'>;
  pendingStateKeys: number;
  oversizedCount: number;
  shellReady: boolean;
  updateReady: boolean;
  sha: string;
  imageCount: number;
  imageBytes: number;
};
export type DerivedPwaStatus = { state: PwaState; queued: number; label: string };

const EMPTY_SYNC: ConnectivitySnapshot['sync'] = { phase: 'idle', pending: 0, quarantined: 0 };
const EMPTY: ConnectivitySnapshot = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  gate: { kind: 'checking', reason: 'checking' },
  sync: EMPTY_SYNC,
  pendingStateKeys: 0,
  oversizedCount: 0,
  shellReady: false,
  updateReady: false,
  sha: '',
  imageCount: 0,
  imageBytes: 0,
};

let snapshot = EMPTY;
const listeners = new Set<() => void>();
let runtimeUnsubscribe: (() => void) | undefined;
let pollTimer = 0;
let registration: ServiceWorkerRegistration | undefined;
let registrationUpdateListener: (() => void) | undefined;

function commit(next: ConnectivitySnapshot): void {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function derivePwaStatus(value: ConnectivitySnapshot): DerivedPwaStatus {
  const queued = value.sync.pending + value.pendingStateKeys;
  let state: PwaState = 'checking';
  if (value.updateReady) state = 'update_ready';
  else if (value.oversizedCount > 0 || value.sync.phase === 'error' || value.gate.reason === 'error') state = 'error';
  else if (!value.online || value.gate.reason === 'offline') state = queued ? 'queued' : 'offline';
  else if (value.gate.reason === 'needs_login' || value.sync.phase === 'needs-auth') state = 'needs_login';
  else if (value.sync.phase === 'syncing') state = 'syncing';
  else if (queued > 0 || value.sync.phase === 'queued' || value.sync.phase === 'retrying') state = 'queued';
  else if (value.sync.phase === 'synced' && value.gate.kind === 'online') state = 'synced';

  const labels: Record<PwaState, string> = {
    offline: 'آفلاین',
    queued: `در صف: ${new Intl.NumberFormat('fa-IR').format(queued)}`,
    syncing: 'در حال همگام‌سازی…',
    synced: 'همگام شد',
    needs_login: 'نیاز به ورود',
    error: 'خطای همگام‌سازی',
    update_ready: 'نسخهٔ جدید',
    checking: 'در حال بررسی…',
  };
  return { state, queued, label: labels[state] };
}

function publish(): void {
  const sync = getDefaultSyncRuntime()?.getSnapshot() ?? EMPTY_SYNC;
  const storage = getAuthenticatedServerStorage();
  const next: ConnectivitySnapshot = {
    ...snapshot,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    sync: {
      phase: sync.phase,
      pending: sync.pending,
      quarantined: sync.quarantined,
      lastSyncedAt: sync.lastSyncedAt,
      lastError: sync.lastError,
    },
    pendingStateKeys: storage?.pendingKeyCount ?? 0,
    oversizedCount: storage?.getOversizedState().size ?? 0,
  };
  commit(next);
}

function handleGateStatus(event: Event): void {
  const detail = (event as CustomEvent<ConnectivitySnapshot['gate']>).detail;
  if (!detail || !['checking', 'online', 'blocked'].includes(detail.kind)) return;
  commit({ ...snapshot, gate: detail });
  publish();
}

function handleWorkerMessage(event: MessageEvent): void {
  const data = event.data as {
    type?: string;
    sha?: string;
    shell?: { sha?: string; complete?: boolean };
    images?: { count?: number; bytes?: number };
  };
  if (data?.type === 'VERSION' && typeof data.sha === 'string') commit({ ...snapshot, sha: data.sha });
  if (data?.type === 'CACHE_STATUS') {
    commit({
      ...snapshot,
      sha: data.shell?.sha ?? snapshot.sha,
      shellReady: data.shell?.complete === true,
      imageCount: data.images?.count ?? 0,
      imageBytes: data.images?.bytes ?? 0,
    });
  }
  publish();
}

function refreshWorkerStatus(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker
    .getRegistration()
    .then((next) => {
      if (registration && registrationUpdateListener) registration.removeEventListener('updatefound', registrationUpdateListener);
      registration = next;
      const updateReady = !!next?.waiting;
      commit({ ...snapshot, updateReady });
      const worker = next?.active ?? navigator.serviceWorker.controller;
      worker?.postMessage({ type: 'GET_VERSION' });
      worker?.postMessage({ type: 'CACHE_STATUS' });
      if (next?.installing) {
        const installing = next.installing;
        const onStateChange = () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) refreshWorkerStatus();
        };
        installing.addEventListener('statechange', onStateChange, { once: true });
      }
      if (next) {
        registrationUpdateListener = () => refreshWorkerStatus();
        next.addEventListener('updatefound', registrationUpdateListener);
      }
    })
    .catch(() => {});
}

function start(): void {
  if (typeof window === 'undefined') return;
  const onNetworkChange = () => publish();
  window.addEventListener('online', onNetworkChange);
  window.addEventListener('offline', onNetworkChange);
  window.addEventListener(GATE_STATUS_EVENT, handleGateStatus);
  window.addEventListener(SERVER_STORAGE_BUDGET_EVENT, onNetworkChange);
  runtimeUnsubscribe = getDefaultSyncRuntime()?.subscribe(publish);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    navigator.serviceWorker.addEventListener('controllerchange', refreshWorkerStatus);
    void navigator.serviceWorker.ready.then(refreshWorkerStatus).catch(() => {});
  }
  pollTimer = window.setInterval(publish, 750);
  publish();
  stopCurrent = () => {
    window.removeEventListener('online', onNetworkChange);
    window.removeEventListener('offline', onNetworkChange);
    window.removeEventListener(GATE_STATUS_EVENT, handleGateStatus);
    window.removeEventListener(SERVER_STORAGE_BUDGET_EVENT, onNetworkChange);
    runtimeUnsubscribe?.();
    runtimeUnsubscribe = undefined;
    window.clearInterval(pollTimer);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', refreshWorkerStatus);
    }
    if (registration && registrationUpdateListener) registration.removeEventListener('updatefound', registrationUpdateListener);
    registration = undefined;
    registrationUpdateListener = undefined;
  };
}

let stopCurrent: (() => void) | undefined;

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopCurrent?.();
      stopCurrent = undefined;
    }
  };
}

export function getConnectivitySnapshot(): ConnectivitySnapshot {
  return snapshot;
}

export function getServerRenderedConnectivitySnapshot(): ConnectivitySnapshot {
  return EMPTY;
}

export function requestServiceWorkerUpdateCheck(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve();
  return navigator.serviceWorker
    .getRegistration()
    .then((registered) => registered?.update())
    .then(() => undefined);
}
