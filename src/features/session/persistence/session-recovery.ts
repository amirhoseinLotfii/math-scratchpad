import { initialKeyboardOpen } from '../../../shared/lib/ui-prefs';
import { uid } from '../../../model';
import { initialState, type ScratchState } from '../../../store';
import { restoreState } from '../../../persistence';
import { clampRestoredTimers } from '../timer-continuity';
import { SESSION_KEY, decode, fullSignature, type Envelope } from './session-envelope';
// IndexedDB is asynchronous. A synchronous, per-tab emergency journal retains
// edits made immediately before reload/close until the primary DB confirms save.
const DRAFT_TAB_KEY = 'math-scratchpad-draft-tab-v1';
const PENDING_DRAFT_PREFIX = 'math-scratchpad-pending-draft-v1:';
export type PendingDraftJournal = { version: 1; baseRevision: number; snapshot: Envelope };
export function currentTabJournalKey(): string | undefined {
  try {
    let tabId = sessionStorage.getItem(DRAFT_TAB_KEY);
    if (!tabId) {
      tabId = uid();
      sessionStorage.setItem(DRAFT_TAB_KEY, tabId);
    }
    return PENDING_DRAFT_PREFIX + tabId;
  } catch {
    return undefined;
  }
}
export function readPendingJournal(key: string | undefined): PendingDraftJournal | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingDraftJournal;
    if (value?.version !== 1 || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0) return null;
    return value;
  } catch {
    return null;
  }
}
export function restorePersistedDraft(storage: Storage, journalKey: string | undefined) {
  let recoveredJournal = false;
  let saved: Envelope | null = null,
    protectedDraft = false,
    bootError = '';
  let initial: ScratchState,
    hasLegacyState = false;
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw) saved = decode(raw);
    let journalRaw: string | null = null;
    try {
      journalRaw = journalKey ? localStorage.getItem(journalKey) : null;
    } catch {
      /* Optional recovery layer is inaccessible. */
    }
    const journal = readPendingJournal(journalKey);
    if (journalRaw && !journal) {
      protectedDraft = true;
      bootError = 'A pending browser draft could not be read. It remains untouched; export a backup before recovery.';
    }
    if (journal) {
      try {
        const candidate = decode(JSON.stringify(journal.snapshot));
        const matchesStored = saved && fullSignature(saved.state.session) === fullSignature(candidate.state.session);
        if (matchesStored && saved!.state.sync.revision > journal.baseRevision) {
          // The async IndexedDB save already finished; remove the stale emergency copy.
          try {
            localStorage.removeItem(journalKey!);
          } catch {
            /* Harmless duplicate snapshot. */
          }
        } else if (!saved || saved.state.sync.revision === journal.baseRevision) {
          saved = candidate;
          recoveredJournal = true;
        } else {
          // Another tab saved a newer revision. Preserve both versions instead
          // of silently overwriting newer server/IndexedDB work.
          protectedDraft = true;
          bootError =
            'A pending browser draft conflicts with newer saved work. Both versions are preserved; export a backup before continuing.';
        }
      } catch {
        protectedDraft = true;
        bootError = 'A pending browser draft could not be validated. It remains untouched; export a backup before recovery.';
      }
    }
    if (saved) initial = { ...initialState(), ...saved.state.session };
    else {
      hasLegacyState = !!(storage.getItem('math-scratchpad-redux-v2') ?? storage.getItem('math-scratchpad-flow-v1'));
      initial = restoreState();
      if (!hasLegacyState) initial.keyboardOpen = false;
      if (initial.notice) {
        protectedDraft = true;
        bootError = initial.notice;
      }
    }
  } catch {
    protectedDraft = true;
    bootError = 'Saved draft could not be restored. Import a backup or copy your current work before recovery.';
    initial = initialState();
    initial.keyboardOpen = false;
  }
  if (!protectedDraft || bootError !== 'Saved draft could not be restored. Import a backup or copy your current work before recovery.')
    initial.keyboardOpen = initialKeyboardOpen(initial.keyboardOpen);
  // A restored open timer segment is credited only up to the last time this app
  // was actually open; a closed browser must not add itself as study time.
  initial.doc = clampRestoredTimers(initial.doc, Date.now());
  if (bootError) initial.storageState = { kind: 'error', message: bootError };
  return { recoveredJournal, saved, protectedDraft, initial, hasLegacyState };
}
