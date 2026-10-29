import { createRoot } from 'react-dom/client';
import { Provider } from './app/store-provider';
import { App } from './App';
import { createPersistentStore } from './features/session/persistence/persistent-store';
import './fonts.css';
import './styles/tokens.css';
import './styles/globals.css';
import './styles.css';
const root = document.getElementById('math-scratchpad-redux');
if (!root) throw Error('Math Scratchpad root is missing.');
const runtime = createPersistentStore();
createRoot(root).render(<Provider store={runtime.store}><App /></Provider>);

if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose());

import "./styles/approved-theme.css";
