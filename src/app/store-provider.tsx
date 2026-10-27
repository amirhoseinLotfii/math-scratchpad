import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { RootState, ScratchStore } from '../store';
const StoreContext = createContext<ScratchStore | null>(null);
export function Provider({ store, children }: { store: ScratchStore; children: ReactNode }) {
 return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
export function useAppStore() {
 const store = useContext(StoreContext); if (!store) throw Error('Math editor store provider is missing.'); return store;
}
export function useAppSelector<T>(selector: (state: RootState) => T, _equality?: (a: T, b: T) => boolean): T {
 return useStore(useAppStore(), useShallow(selector));
}
export function useAppDispatch() { return useAppStore().dispatch; }
