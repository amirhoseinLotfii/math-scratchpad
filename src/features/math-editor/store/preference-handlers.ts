import { type ScratchState, type PayloadAction } from './editor-state';
export const preferenceHandlers = {
  keyboard(state: ScratchState, action: PayloadAction<boolean>) {
    state.keyboardOpen = action.payload;
  },
  compact(state: ScratchState) {
    state.prefs.compact = !state.prefs.compact;
  },
  symbols(state: ScratchState) {
    state.symbolsOpen = !state.symbolsOpen;
  },
  closeSymbols(state: ScratchState) {
    state.symbolsOpen = false;
  },
  topic(state: ScratchState, action: PayloadAction<string>) {
    state.topic = action.payload;
  },
  favorite(state: ScratchState, action: PayloadAction<string>) {
    const k = action.payload;
    state.prefs.favorites = state.prefs.favorites.includes(k)
      ? state.prefs.favorites.filter((x) => x !== k)
      : [...state.prefs.favorites, k].slice(0, 12);
  },
  recentSymbol(state: ScratchState, action: PayloadAction<string>) {
    state.prefs.recent = [action.payload, ...state.prefs.recent.filter((x) => x !== action.payload)].slice(0, 4);
  },
  copied(state: ScratchState, action: PayloadAction<{ exerciseId: string; snapshot: string }>) {
    state.copies[action.payload.exerciseId] = action.payload.snapshot;
    state.notice = 'Copied. Paste into this chat and send.';
  },
  notice(state: ScratchState, action: PayloadAction<string>) {
    state.notice = action.payload;
  },
};
