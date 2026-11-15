import type { ScratchState } from '../store';

export function selectWorkspaceState({ doc, prefs, keyboardOpen, past, future, copies, notice, storageState, savedAt }: ScratchState) {
  return { doc, prefs, keyboardOpen, past, future, copies, notice, storageState, savedAt };
}
