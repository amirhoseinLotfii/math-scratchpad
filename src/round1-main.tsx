import { initialKeyboardOpen } from './shared/lib/ui-prefs';
import { createRoot } from 'react-dom/client';
import { Provider } from './app/store-provider';
import { App } from './App';
import { makeStore, actions, initialState } from './store';
import { serialize, validateSession } from './persistence';
import { getLearningStorage, initializeLearningStorage, flushLearningStorage } from './sync/browser-db';
import { BrowserSyncRuntime, setDefaultSyncRuntime } from './sync/runtime';
import './styles.css';

// The inline twenty-question round has its own draft; existing notebook sessions remain intact.
const KEY = 'math-scratchpad-inline-fractions-round1-v1';
const root = document.getElementById('math-scratchpad-redux');
if (!root) throw Error('Math Scratchpad root is missing.');
root.setAttribute('role', 'status');
root.textContent = 'Preparing your saved work…';
void (async () => {
  const persistence = await initializeLearningStorage();
  const state = initialState();
  let restored = false;
  try {
    const raw = getLearningStorage().getItem(KEY);
    if (raw) {
      const saved = validateSession(JSON.parse(raw));
      state.doc = saved.doc;
      if (saved.prefs) state.prefs = saved.prefs;
      restored = true;
    }
  } catch { state.notice = 'Draft could not be restored. Import Session JSON if available.'; }
  const store = makeStore(state);
  if (!restored) store.dispatch(actions.startFractionRound());
  store.dispatch(actions.keyboard(initialKeyboardOpen(false)));
  if (!persistence.dbAvailable) store.dispatch(actions.notice(persistence.warning));
  let pending: ReturnType<typeof setTimeout>;
  let warned = false;
  function save() {
    try { getLearningStorage().setItem(KEY, serialize(store.getState())); }
    catch { if (!warned) { warned = true; store.dispatch(actions.notice('Draft storage is unavailable. Export Session JSON to keep your work.')); } }
  }
  store.subscribe(() => { clearTimeout(pending); pending = setTimeout(save, 180); });
  window.addEventListener('pagehide', () => { save(); void flushLearningStorage(); });
  const sync = new BrowserSyncRuntime();
  setDefaultSyncRuntime(sync);
  if (persistence.dbAvailable) await sync.start();
  root.removeAttribute('role'); root.textContent = '';
  createRoot(root).render(<Provider store={store}><App /></Provider>);
})().catch(() => {
  root.setAttribute('role', 'alert');
  root.textContent = 'Math Scratchpad could not safely open saved work. Existing browser data was left untouched.';
});
