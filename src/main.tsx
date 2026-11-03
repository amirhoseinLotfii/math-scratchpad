import { createRoot } from 'react-dom/client';
import { Provider } from './app/store-provider';
import { App } from './App';
import { createPersistentStore } from './features/session/persistence/persistent-store';
import { initializeLearningStorage } from './sync/browser-db';
import { BrowserSyncRuntime, setDefaultSyncRuntime } from './sync/runtime';
import './fonts.css';
import './styles/tokens.css';
import './styles/globals.css';
import './styles.css';
const root = document.getElementById('math-scratchpad-redux');
if (!root) throw Error('Math Scratchpad root is missing.');
root.setAttribute('role', 'status');
root.textContent = 'Math Scratchpad is preparing your saved work…';

let appRuntime: ReturnType<typeof createPersistentStore> | undefined;
let syncRuntime: BrowserSyncRuntime | undefined;
void (async () => {
  const persistence = await initializeLearningStorage();
  appRuntime = createPersistentStore();
  if (!persistence.dbAvailable) {
    appRuntime.store.setState({ storageState: { kind: 'error', message: persistence.warning } });
  } else {
    syncRuntime = new BrowserSyncRuntime();
    setDefaultSyncRuntime(syncRuntime);
    await syncRuntime.start();
  }
  root.removeAttribute('role');
  root.textContent = '';
  createRoot(root).render(<Provider store={appRuntime!.store}><App /></Provider>);
})().catch(() => {
  root.setAttribute('role', 'alert');
  root.textContent = 'Math Scratchpad could not safely open saved work. Existing browser data was left untouched.';
});

if (import.meta.hot) import.meta.hot.dispose(() => { appRuntime?.dispose(); syncRuntime?.stop(); });
