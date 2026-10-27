import { createRoot } from 'react-dom/client';
import { Provider } from './app/store-provider';
import { App } from './App';
import { makeStore, actions, initialState } from './store';
import { serialize, validateSession } from './persistence';
import './styles.css';

// The inline twenty-question round has its own draft; existing notebook sessions remain intact.
const KEY = 'math-scratchpad-inline-fractions-round1-v1';
const state = initialState();
let restored = false;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const saved = validateSession(JSON.parse(raw));
    state.doc = saved.doc;
    if (saved.prefs) state.prefs = saved.prefs;
    restored = true;
  }
} catch { state.notice = 'Draft could not be restored. Import Session JSON if available.'; }
const store = makeStore(state);
if (!restored) store.dispatch(actions.startFractionRound());
store.dispatch(actions.keyboard(true));
let pending: ReturnType<typeof setTimeout>;
let warned = false;
function save() {
  try { localStorage.setItem(KEY, serialize(store.getState())); }
  catch { if (!warned) { warned = true; store.dispatch(actions.notice('Draft storage is unavailable. Export Session JSON to keep your work.')); } }
}
store.subscribe(() => { clearTimeout(pending); pending = setTimeout(save, 180); });
window.addEventListener('pagehide', save);
const root = document.getElementById('math-scratchpad-redux');
if (!root) throw Error('Math Scratchpad root is missing.');
createRoot(root).render(<Provider store={store}><App /></Provider>);
