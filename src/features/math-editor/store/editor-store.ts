import { produce } from 'immer';
import { createStore } from 'zustand/vanilla';
import { persist, type PersistOptions } from 'zustand/middleware';
import { activeInfo, cursorHandlers } from './cursor-helpers';
import { exerciseHandlers } from './exercise-handlers';
import { stepHandlers } from './step-handlers';
import {
  exerciseOf,
  initialDocument,
  initialState,
  newSessionMeta,
  stepOf,
  type Command,
  type PersistedSession,
  type ScratchState,
} from './types';

export {
  activeInfo,
  exerciseOf,
  initialDocument,
  initialState,
  newSessionMeta,
  stepOf,
  type Command,
  type PersistedSession,
  type ScratchState,
};

const handlers = {
  ...stepHandlers,
  ...cursorHandlers,
  ...exerciseHandlers,
};

type HandlerName = keyof typeof handlers;
type PayloadOf<F> = F extends (state: ScratchState, action: infer A) => void
  ? A extends { payload: infer P }
    ? P
    : never
  : never;
type Creators = {
  [K in HandlerName]: [PayloadOf<(typeof handlers)[K]>] extends [never]
    ? () => { type: K }
    : (payload: PayloadOf<(typeof handlers)[K]>) => {
        type: K;
        payload: PayloadOf<(typeof handlers)[K]>;
      };
};

export type EditorAction = { type: HandlerName; payload?: unknown };

export const actions = Object.fromEntries(
  Object.keys(handlers).map(type => [type, (payload?: unknown) => ({ type, payload })])
) as unknown as Creators;

export function reducer(state: ScratchState = initialState(), action: EditorAction): ScratchState {
  const handler = handlers[action.type] as
    | ((draft: ScratchState, action: EditorAction) => void)
    | undefined;
  return handler ? produce(state, draft => handler(draft, action)) : state;
}

export const makeStore = (
  preloadedState?: ScratchState,
  persistence?: PersistOptions<ScratchState, PersistedSession>
) => {
  const start = () => preloadedState ?? initialState();
  const store = persistence
    ? createStore<ScratchState>()(persist(start, persistence))
    : createStore<ScratchState>()(start);
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
