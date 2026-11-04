import { createRoot } from 'react-dom/client';
import { Provider } from './app/store-provider';
import { App } from './App';
import { createPersistentStore } from './features/session/persistence/persistent-store';
import { initializeLearningStorage, initializeAuthenticatedServerStorage, refreshAuthenticatedServerStorage, getAuthenticatedServerStorage, updateAuthenticatedServerToken } from './sync/browser-db';
import { getGoogleIdToken } from './sync/google-id-token';
import { ServerConnectionGate } from './sync/server-connection-gate';
import { BrowserSyncRuntime, setDefaultSyncRuntime } from './sync/runtime';
import './fonts.css';
import './styles/tokens.css';
import './styles/globals.css';
import './styles.css';

const root = document.getElementById('math-scratchpad-redux');
if (!root) throw Error('Math Scratchpad root is missing.');
root.setAttribute('role', 'status');
root.textContent = 'Math Scratchpad is restoring your work from this browser…';

let appRuntime: ReturnType<typeof createPersistentStore> | undefined;
let syncRuntime: BrowserSyncRuntime | undefined;
const isLocalTestOrDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  && !new URLSearchParams(location.search).has('serverMode');

async function connectAuthenticatedStorage(token: string): Promise<void> {
  if (getAuthenticatedServerStorage()) {
    updateAuthenticatedServerToken(token);
    await refreshAuthenticatedServerStorage(token);
  } else {
    await initializeAuthenticatedServerStorage(token);
  }
  syncRuntime?.setIdToken(token);
}

function launchApp(showConnectionStatus = false) {
  root!.removeAttribute('role');
  root!.textContent = '';
  const app = <Provider store={appRuntime!.store}><App /></Provider>;
  createRoot(root!).render(showConnectionStatus
    ? <ServerConnectionGate
        tokenProvider={getGoogleIdToken}
        onAuthenticated={connectAuthenticatedStorage}
        flushPendingDraft={() => appRuntime!.flush()}
      >{app}</ServerConnectionGate>
    : app);
}

void (async () => {
  // Keep the durable browser database as the primary store in every environment.
  const persistence = await initializeLearningStorage();
  appRuntime = createPersistentStore();
  if (!persistence.dbAvailable) {
    appRuntime.store.setState({ storageState: { kind: 'error', message: persistence.warning } });
  }

  syncRuntime = new BrowserSyncRuntime();
  setDefaultSyncRuntime(syncRuntime);
  await syncRuntime.start();
  const token = getGoogleIdToken();
  syncRuntime.setIdToken(token ?? null);

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
