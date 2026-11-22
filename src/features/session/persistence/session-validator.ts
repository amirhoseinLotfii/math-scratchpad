import { validateSession } from '../../../domain/validation/session-validator';
import { dualWriteToDexie } from '../../../storage/dual-write-bridge';
import { getLearningStorage } from '../../../sync/browser-db';
import { initialState, type ScratchState } from '../../math-editor/store/editor-store';

export { validateSession };

const KEY = 'math-scratchpad-redux-v2';

export function restoreState(): ScratchState {
  const state = initialState();
  try {
    const storage = getLearningStorage();
    const raw = storage.getItem(KEY) ?? storage.getItem('math-scratchpad-flow-v1');
    if (raw) {
      const saved = validateSession(JSON.parse(raw));
      state.doc = saved.doc;
      if (saved.prefs) state.prefs = saved.prefs;
      state.keyboardOpen = JSON.parse(raw).keyboardOpen === true;
    }
  } catch { state.notice = 'Previous draft could not be restored. Import a session backup if available.'; }
  return state;
}

export const serialize = (state: ScratchState) => JSON.stringify({ version: 2, doc: state.doc, prefs: state.prefs, keyboardOpen: state.keyboardOpen }, null, 2);

export function saveState(state: ScratchState): boolean {
  try {
    const serialized = serialize(state);
    getLearningStorage().setItem(KEY, serialized);
    dualWriteToDexie(KEY, serialized).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
