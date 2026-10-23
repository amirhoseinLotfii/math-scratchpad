import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { makeStore, actions } from './store';
import { restoreState, saveState } from './persistence';
import './styles.css';

const root = document.getElementById('math-scratchpad-redux');
if (!root) throw Error('Math Scratchpad root is missing.');
const store = makeStore(restoreState());
let pending: ReturnType<typeof setTimeout>;
let warned = false;
store.subscribe(() => {
  clearTimeout(pending);
  pending = setTimeout(() => { if (!saveState(store.getState()) && !warned) { warned = true; store.dispatch(actions.notice('Draft storage is unavailable. Use Session backup to keep your work.')); } }, 180);
});
window.addEventListener('pagehide', () => { saveState(store.getState()); });
createRoot(root).render(<Provider store={store}><App /></Provider>);
