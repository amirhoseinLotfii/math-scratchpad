import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { actions, initialState, makeStore } from '../../src/store';

// Current production adapter only. Replace this adapter when the Zustand UI is implemented;
// do not change accessible behavior assertions to accommodate a different store library.
export function renderMobileApp({ batch = true, keyboard = true } = {}) {
 const store = makeStore(initialState());
 if (batch) store.dispatch(actions.startFractionRound());
 store.dispatch(actions.keyboard(keyboard));
 const view = render(<div id="math-scratchpad-redux"><Provider store={store}><App /></Provider></div>);
 return { ...view, store, user: userEvent.setup() };
}
