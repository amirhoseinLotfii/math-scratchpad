import { produce } from 'immer';
import { createStore } from 'zustand/vanilla';
import { persist, type PersistOptions } from 'zustand/middleware';

import type { Document, Preferences } from '../../../model';
import { initialState, type ScratchState } from './editor-state';
import { editHandlers } from './edit-handlers';
import { cursorHandlers } from './cursor-handlers';
import { sessionHandlers } from './session-handlers';
import { preferenceHandlers } from './preference-handlers';
export { activeInfo, exerciseOf, stepOf, initialDocument, initialState, newSessionMeta, type ScratchState } from './editor-state';
export type { Command } from './editor-command';
const handlers = { ...editHandlers, ...cursorHandlers, ...sessionHandlers, ...preferenceHandlers };
type HandlerName = keyof typeof handlers;
type PayloadOf<F> = F extends (state: ScratchState, action: infer A) => void ? (A extends { payload: infer P } ? P : never) : never;
type ActionFor<K extends HandlerName> = [PayloadOf<(typeof handlers)[K]>] extends [never]
  ? { type: K; payload?: undefined }
  : { type: K; payload: PayloadOf<(typeof handlers)[K]> };
type Creators = {
  [K in HandlerName]: [PayloadOf<(typeof handlers)[K]>] extends [never]
    ? () => ActionFor<K>
    : (payload: PayloadOf<(typeof handlers)[K]>) => ActionFor<K>;
};
export type EditorAction = { [K in HandlerName]: ActionFor<K> }[HandlerName];

// The runtime object is generated from the same handler keys as the typed action map.
export const actions = Object.fromEntries(
  Object.keys(handlers).map((type) => [type, (payload?: unknown) => ({ type, payload })]),
) as Creators;
export function reducer(state: ScratchState = initialState(), action: EditorAction): ScratchState {
  // Indexed access loses TypeScript's correlation between an action key and its payload.
  const handler = handlers[action.type] as ((draft: ScratchState, action: EditorAction) => void) | undefined;
  return handler ? produce(state, (draft) => handler(draft, action)) : state;
}
export type PersistedSession = {
  session: { doc: Document; prefs: Preferences; keyboardOpen: boolean };
  sync: { revision: number; writerId: string };
};
export const makeStore = (preloadedState?: ScratchState, persistence?: PersistOptions<ScratchState, PersistedSession>) => {
  const start = () => preloadedState ?? initialState();
  const store = persistence ? createStore<ScratchState>()(persist(start, persistence)) : createStore<ScratchState>()(start);
  return Object.assign(store, {
    dispatch: (action: EditorAction) => {
      store.setState(reducer(store.getState(), action), true);
      return action;
    },
    resolveConflict: undefined as ((choice: 'local' | 'remote') => void) | undefined,
    clearStorage: undefined as (() => void) | undefined,
  });
};
export type ScratchStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<ScratchStore['getState']>;
export type AppDispatch = ScratchStore['dispatch'];
