import { createRoot } from 'react-dom/client';
import { Provider } from './app/store-provider';
import { App } from './App';
import { createPersistentStore } from './features/session/persistence/persistent-store';
import { initializeLearningStorage, initializeAuthenticatedServerStorage, clearLegacyBrowserLearningData, updateAuthenticatedServerToken } from './sync/browser-db';
import { mountGoogleIdButton } from './sync/google-id-token';
import { ServerConnectionGate } from './sync/server-connection-gate';
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
const isLocalTestOrDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  && !new URLSearchParams(location.search).has('serverMode');
let currentAuthToken: string | undefined;

function launchApp(serverOnly = false) {
  root!.removeAttribute('role');
  root!.textContent = '';
  const app = <Provider store={appRuntime!.store}><App /></Provider>;
  createRoot(root!).render(serverOnly
    ? <ServerConnectionGate tokenProvider={() => currentAuthToken}>{app}</ServerConnectionGate>
    : app);
}

if (isLocalTestOrDevelopment) {
  // Browser/e2e fixtures are isolated from the production owner account.
  void (async () => {
    const persistence = await initializeLearningStorage();
    appRuntime = createPersistentStore();
    if (!persistence.dbAvailable) appRuntime.store.setState({ storageState: { kind: 'error', message: persistence.warning } });
    else {
      syncRuntime = new BrowserSyncRuntime();
      setDefaultSyncRuntime(syncRuntime);
      await syncRuntime.start();
    }
    launchApp();
  })().catch(() => {
    root.setAttribute('role', 'alert');
    root.textContent = 'Math Scratchpad could not open its preview session.';
  });
} else {
  // The public site never opens a browser database and cannot edit until the
  // authenticated server snapshot has been successfully loaded.
  root.removeAttribute('role');
  root.innerHTML = '';
  const wrapper = document.createElement('section');
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', 'ورود امن به Math Scratchpad');
  wrapper.style.cssText = 'max-width:460px;margin:12vh auto;padding:24px;color:#eee;background:#202326;border:1px solid #40464b;border-radius:16px;direction:rtl;text-align:center';
  const heading = document.createElement('h1');
  heading.textContent = 'Math Scratchpad';
  heading.style.cssText = 'font:600 24px system-ui;margin:0 0 14px';
  const description = document.createElement('p');
  description.textContent = 'برای بارگیری تمرین‌ها و ذخیرهٔ مستقیم روی سرور، با حساب Google شخصی پروژه وارد شو. هیچ دادهٔ آموزشی در حافظهٔ دائمی مرورگر ذخیره نمی‌شود.';
  description.style.cssText = 'font:15px/1.9 system-ui;margin:0 0 22px';
  const button = document.createElement('div');
  button.style.cssText = 'display:flex;justify-content:center;direction:ltr';
  const status = document.createElement('p');
  status.setAttribute('role','status');
  status.style.cssText = 'font:14px/1.9 system-ui;margin-top:16px';
  wrapper.append(heading, description, button, status);
  root.append(wrapper);
  let booting = false;
  void mountGoogleIdButton(button, (token) => {
    currentAuthToken = token;
    if (appRuntime || booting) {
      syncRuntime?.setIdToken(token);
      updateAuthenticatedServerToken(token);
      return;
    }
    booting = true;
    status.textContent = 'در حال خواندن نسخهٔ سرور و اتصال به Drive و Notion…';
    void (async () => {
      await initializeAuthenticatedServerStorage(token);
      syncRuntime = new BrowserSyncRuntime();
      setDefaultSyncRuntime(syncRuntime);
      await syncRuntime.start();
      syncRuntime.setIdToken(token);
      appRuntime = createPersistentStore();
      launchApp(true);
      // The owner explicitly chose server-only storage. No legacy browser
      // data will be read or migrated back into the new server-first editor.
      void clearLegacyBrowserLearningData();
      // The connection gate checks server reachability. Other-device state is rehydrated on reload
      // instead of overwriting a local editor draft that has not reached its 180 ms debounce.
    })().catch(error => {
      status.textContent = error instanceof Error ? error.message : 'اتصال امن به سرور برقرار نشد.';
      booting = false;
    });
  }).catch(error => {
    status.textContent = error instanceof Error ? error.message : 'ورود Google بارگیری نشد. اتصال اینترنت را بررسی کن.';
  });
}
if (import.meta.hot) import.meta.hot.dispose(() => { appRuntime?.dispose(); syncRuntime?.stop(); });
