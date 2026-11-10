import { createRoot } from 'react-dom/client';
import { Provider } from './app/store-provider';
import { App } from './App';
import { createPersistentStore } from './features/session/persistence/persistent-store';
import { initializeLearningStorage, initializeAuthenticatedServerStorage, refreshAuthenticatedServerStorage, getAuthenticatedServerStorage, updateAuthenticatedServerToken, prepareLocalLearningReset, completeLocalLearningReset } from './sync/browser-db';
import { getApiToken, hydrateWorkerSession } from './sync/worker-session';
import { ServerConnectionGate } from './sync/server-connection-gate';
import { BrowserSyncRuntime, setDefaultSyncRuntime } from './sync/runtime';
import { ReadingPositionProvider } from './features/progress/reading-position-context';
import { initializeReadingPositionSync } from './features/progress/reading-position-sync';
import { initializeThemePreference } from './shared/lib/ui-prefs';
import './fonts.css';
import './styles/globals.css';
import './styles.css';

const root = document.getElementById('math-scratchpad-redux');
if (!root) throw Error('Math Scratchpad root is missing.');
root.setAttribute('role', 'status');
root.textContent = 'Math Scratchpad is restoring your work from this browser…';

let appRuntime: ReturnType<typeof createPersistentStore> | undefined;
let syncRuntime: BrowserSyncRuntime | undefined;
let authenticatedStorageFlight: { token: string; promise: Promise<void> } | null = null;
let authenticatedStorageToken: string | undefined;
let localResetPending = false;

function flushAppDraft(): Promise<void> {
  return appRuntime?.flush() ?? Promise.resolve();
}
const isLocalTestOrDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  && !new URLSearchParams(location.search).has('serverMode');

async function connectAuthenticatedStorage(token: string): Promise<void> {
  if (authenticatedStorageToken === token && getAuthenticatedServerStorage()) return;
  if (authenticatedStorageFlight?.token === token) return authenticatedStorageFlight.promise;
  const promise = (async () => {
    if (localResetPending) {
      if (!syncRuntime) throw new Error('همگام‌سازی آماده نیست؛ دادهٔ قدیمی این دستگاه پاک شده و همگام‌سازی متوقف است.');
      if (await syncRuntime.hasCloudLearningData(token)) {
        throw new Error('دادهٔ محلی این دستگاه پاک شد. تا وقتی پاک‌سازی دادهٔ یادگیری ابر کامل نشود، این دستگاه همگام‌سازی نمی‌کند.');
      }
      completeLocalLearningReset();
      localResetPending = false;
    }
    if (getAuthenticatedServerStorage()) {
      updateAuthenticatedServerToken(token);
      await refreshAuthenticatedServerStorage(token);
    } else {
      await initializeAuthenticatedServerStorage(token);
    }
    syncRuntime?.setIdToken(token);
  })();
  authenticatedStorageFlight = { token, promise };
  try {
    await promise;
    authenticatedStorageToken = token;
  } finally {
    if (authenticatedStorageFlight?.promise === promise) authenticatedStorageFlight = null;
  }
}

function launchApp(showConnectionStatus = false) {
  root!.removeAttribute('role');
  root!.textContent = '';
  
  // Initialize reading position sync
  initializeReadingPositionSync();
  
  const app = (
    <ReadingPositionProvider>
      <Provider store={appRuntime!.store}>
        <App />
      </Provider>
    </ReadingPositionProvider>
  );
  
  createRoot(root!).render(showConnectionStatus
    ? <ServerConnectionGate
        tokenProvider={getApiToken}
        onAuthenticated={connectAuthenticatedStorage}
        flushPendingDraft={flushAppDraft}
      >{app}</ServerConnectionGate>
    : app);
}

void (async () => {
  // This one-time versioned cleanup runs on each browser before legacy data can hydrate or sync.
  localResetPending = import.meta.env.PROD ? await prepareLocalLearningReset() : false;
  initializeThemePreference();
  // Keep the durable browser database as the primary store in every environment.
  const persistence = await initializeLearningStorage();
  appRuntime = createPersistentStore();
  if (!persistence.dbAvailable) {
    appRuntime.store.setState({ storageState: { kind: 'error', message: persistence.warning } });
  }

  syncRuntime = new BrowserSyncRuntime();
  setDefaultSyncRuntime(syncRuntime);
  await syncRuntime.start();
  // A stored Worker session keeps sync working after the one-hour GIS ID token expires.
  await hydrateWorkerSession();
  const token = getApiToken();
  // Never push or pull while a browser is waiting for the cloud reset to finish.
  syncRuntime.setIdToken(localResetPending ? null : token ?? null);

  // Render from local data immediately. Sign-in is only needed to sync the
  // local outbox and learner records; a failed server connection never blocks editing.
  launchApp(!isLocalTestOrDevelopment);
})().catch(error => {
  root!.setAttribute('role', 'alert');
  root!.textContent = error instanceof Error
    ? error.message
    : 'Math Scratchpad could not restore its browser data.';
});

if (import.meta.hot) import.meta.hot.dispose(() => { appRuntime?.dispose(); syncRuntime?.stop(); });

