import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { initialState, makeStore } from '../../src/store';
import { subscribeToLearnEvents, type LearnEvent } from '../../src/sync/events';
import '../../src/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';
import '../../src/styles.css';

function EventProbe() {
  const [events, setEvents] = useState<LearnEvent[]>([]);
  useEffect(() => subscribeToLearnEvents(event => setEvents(previous => [...previous, event])), []);
  return <output aria-label="Observed learning events" data-testid="learn-event-probe">{JSON.stringify(events)}</output>;
}

const store = makeStore(initialState());
createRoot(document.getElementById('math-scratchpad-redux')!).render(
  <Provider store={store}><App /><EventProbe /></Provider>,
);
