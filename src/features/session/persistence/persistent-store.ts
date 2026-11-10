import { initialKeyboardOpen } from '../../../shared/lib/ui-prefs';
import { z } from 'zod';
import { example, isoLocal, stepLatex, uid } from '../../../model';
import { makeStore, initialState, type PersistedSession, type ScratchState, type ScratchStore } from '../../../store';
import { restoreState, validateSession } from '../../../persistence';
import { clampRestoredTimers } from '../timer-continuity';
import type { PersistOptions } from 'zustand/middleware';
import { flushLearningStorage, getLearningStorage, isServerStorageActive, subscribeLearningStorage } from '../../../sync/browser-db';
import { SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT, type ServerStorageSnapshotRequest } from '../../../sync/server-storage';
export const SESSION_KEY = 'math-scratchpad-session-v3';
const envelopeSchema = z.object({
 version: z.literal(3),
 state: z.object({
  session: z.object({ doc: z.unknown(), prefs: z.unknown().optional(), keyboardOpen: z.boolean() }),
  sync: z.object({ revision: z.number().int().nonnegative(), writerId: z.string().min(1).max(100) }),
 }),
});
type Envelope = { version: number; state: PersistedSession };
function decode(raw: string): Envelope {
 const parsed = envelopeSchema.parse(JSON.parse(raw));
 const saved = validateSession({ version: 2, doc: parsed.state.session.doc, prefs: parsed.state.session.prefs });
 return { version: 3, state: { session: { doc: saved.doc, prefs: saved.prefs ?? initialState().prefs, keyboardOpen: parsed.state.session.keyboardOpen }, sync: parsed.state.sync } };
}
const fullSignature = (session: PersistedSession['session']) => JSON.stringify(session);
const workSignature = (session: PersistedSession['session']) => JSON.stringify({
 exercises: session.doc.exercises.map(({ elapsedMs, ...work }) => work), exerciseId: session.doc.exerciseId, prefs: session.prefs,
});
export const STORAGE_PREFIX = 'math-scratchpad';
const PERSIST_DEBOUNCE_MS = 800;
// IndexedDB is asynchronous. A synchronous, per-tab emergency journal retains
// edits made immediately before reload/close until the primary DB confirms save.
const DRAFT_TAB_KEY = 'math-scratchpad-draft-tab-v1';
const PENDING_DRAFT_PREFIX = 'math-scratchpad-pending-draft-v1:';
type PendingDraftJournal = { version: 1; baseRevision: number; snapshot: Envelope };
function currentTabJournalKey(): string | undefined {
 try {
  let tabId = sessionStorage.getItem(DRAFT_TAB_KEY);
  if (!tabId) {
   tabId = uid();
   sessionStorage.setItem(DRAFT_TAB_KEY, tabId);
  }
  return PENDING_DRAFT_PREFIX + tabId;
 } catch { return undefined; }
}
function readPendingJournal(key: string | undefined): PendingDraftJournal | null {
 if (!key) return null;
 try {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingDraftJournal;
  if (value?.version !== 1 || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0) return null;
  return value;
 } catch { return null; }
}
let activeSessionFlush: (() => Promise<void>) | undefined;
export async function flushPersistedSession(): Promise<void> { await activeSessionFlush?.(); }
/** Remove every localStorage key owned by this app (all schema versions). */
export function clearAppStorage() {
 // The obsolete local-storage reset must never delete authoritative server records.
 if (isServerStorageActive()) return false;
 try {
  const storage = getLearningStorage();
  for (let index = storage.length - 1; index >= 0; index--) {
   const key = storage.key(index);
   if (key?.startsWith(STORAGE_PREFIX)) storage.removeItem(key);
  }
  Object.keys(localStorage).filter(key => key.startsWith(STORAGE_PREFIX)).forEach(key => localStorage.removeItem(key));
  return true;
 } catch { return false; }
}
export function createPersistentStore() {
 const writerId = uid();
 const storage = getLearningStorage();
 const journalKey = currentTabJournalKey();
 let recoveredJournal = false;
 let saved: Envelope | null = null, protectedDraft = false, bootError = '';
 let initial: ScratchState, hasLegacyState = false;
 try {
  const raw = storage.getItem(SESSION_KEY);
  if (raw) saved = decode(raw);
  let journalRaw: string | null = null;
  try { journalRaw = journalKey ? localStorage.getItem(journalKey) : null; } catch { /* Optional recovery layer is inaccessible. */ }
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
     try { localStorage.removeItem(journalKey!); } catch { /* Harmless duplicate snapshot. */ }
    } else if (!saved || saved.state.sync.revision === journal.baseRevision) {
     saved = candidate;
     recoveredJournal = true;
    } else {
     // Another tab saved a newer revision. Preserve both versions instead
     // of silently overwriting newer server/IndexedDB work.
     protectedDraft = true;
     bootError = 'A pending browser draft conflicts with newer saved work. Both versions are preserved; export a backup before continuing.';
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
   if (initial.notice) { protectedDraft = true; bootError = initial.notice; }
  }
 } catch {
  protectedDraft = true; bootError = 'Saved draft could not be restored. Import a backup or copy your current work before recovery.'; initial = initialState(); initial.keyboardOpen = false;
 }
 if (!protectedDraft || bootError !== 'Saved draft could not be restored. Import a backup or copy your current work before recovery.') initial.keyboardOpen = initialKeyboardOpen(initial.keyboardOpen);
 // A restored open timer segment is credited only up to the last time this app
 // was actually open; a closed browser must not add itself as study time.
 initial.doc = clampRestoredTimers(initial.doc, Date.now());
 if (bootError) initial.storageState = { kind: 'error', message: bootError };
 let revision = saved?.state.sync.revision ?? 0, lastWriter = saved?.state.sync.writerId ?? writerId;
 let lastSignature = saved ? fullSignature(saved.state.session) : '', lastWork = saved ? workSignature(saved.state.session) : '';
 let author = !saved || lastWriter === writerId, suppress = false, failedSignature = '';
 let pending: PersistedSession['session'] | null = null, remote: Envelope | null = null;
 let timeout: ReturnType<typeof setTimeout> | undefined, store: ScratchStore;
 const quietState = (storageState: ScratchState['storageState']) => {
  suppress = true; store.setState({ storageState }); suppress = false;
 };
 async function flush() {
  if (!pending || protectedDraft || remote) { await flushLearningStorage().catch(() => undefined); return; }
  if (timeout !== undefined) { clearTimeout(timeout); timeout = undefined; }
  const session = pending; pending = null;
  const next: Envelope = { version: 3, state: { session, sync: { revision: revision + 1, writerId } } };
  try {
   storage.setItem(SESSION_KEY, JSON.stringify(next));
   await flushLearningStorage();
   revision = next.state.sync.revision; lastWriter = writerId; author = true;
   lastSignature = fullSignature(session); lastWork = workSignature(session); failedSignature = '';
   // A newer edit may have arrived while IndexedDB was writing the snapshot.
   // Never discard its emergency journal when completing an older save.
   if (journalKey) {
    const journal = readPendingJournal(journalKey);
    if (journal && fullSignature(journal.snapshot.state.session) === lastSignature) {
     try { localStorage.removeItem(journalKey); } catch { /* IndexedDB remains authoritative. */ }
    }
   }
   suppress = true; store.setState(store.getState().storageState?.kind === 'error' ? { storageState: undefined, savedAt: isoLocal() } : { savedAt: isoLocal() }); suppress = false;
  } catch {
   failedSignature = fullSignature(session);
   quietState({ kind: 'error', message: 'Draft storage is unavailable. Your work remains in memory; copy a full session JSON backup.' });
  }
 }
 function queue(session: PersistedSession['session'], force = false) {
  if (suppress || protectedDraft || remote) return;
  const signature = fullSignature(session), work = workSignature(session);
  if (!force && (signature === lastSignature || signature === failedSignature)) return;
  // A receiving clean tab must not echo timer-only changes back to its source.
  if (!force && !author && work === lastWork) return;
  if (work !== lastWork) author = true;
  pending = session;
  if (journalKey && (work !== lastWork || recoveredJournal)) {
   const snapshot: Envelope = { version: 3, state: { session, sync: { revision, writerId } } };
   try {
    localStorage.setItem(journalKey, JSON.stringify({ version: 1, baseRevision: revision, snapshot } satisfies PendingDraftJournal));
   } catch {
    // Private-browsing/quota restrictions disable only the emergency layer.
    // The existing IndexedDB flush and its error feedback remain intact.
   }
  }
  // Flush the newest work on a fixed cadence. Resetting this timer on every
  // keystroke let continuous typing postpone persistence indefinitely.
  if (timeout === undefined) timeout = setTimeout(() => { timeout = undefined; void flush(); }, PERSIST_DEBOUNCE_MS);
 }
 const options: PersistOptions<ScratchState, PersistedSession> = {
  name: SESSION_KEY, version: 3,
  storage: {
   getItem: () => saved,
   setItem: (_name, value) => queue(value.state.session),
   removeItem: () => { /* Destructive storage clearing requires explicit recovery. */ },
  },
  partialize: value => ({ session: { doc: value.doc, prefs: value.prefs, keyboardOpen: value.keyboardOpen }, sync: { revision, writerId: lastWriter } }),
  // Rehydration is the single place restored work enters the store, so the
  // timer continuity rule must be applied here: a segment that stayed open
  // while the browser was closed is credited only up to the last live moment.
  merge: (value, current) => {
   const persisted = value as PersistedSession | undefined;
   if (!persisted) return current;
   return { ...current, ...persisted.session, doc: clampRestoredTimers(persisted.session.doc), keyboardOpen: current.keyboardOpen };
  },
 };
 store = makeStore(initial, options);
 function applyRemote(value: Envelope) {
  clearTimeout(timeout); pending = null; remote = null;
  // An explicit 'Use saved draft' choice (or a clean remote update) abandons
  // this tab's pending work. Its emergency copy must not resurrect on reload.
  if (journalKey) {
   try { localStorage.removeItem(journalKey); } catch { /* The validated incoming draft is still in IndexedDB. */ }
  }
  revision = value.state.sync.revision; lastWriter = value.state.sync.writerId;
  lastSignature = fullSignature(value.state.session); lastWork = workSignature(value.state.session); author = false;
  suppress = true;
  store.setState({ ...value.state.session, past: [], future: [], copies: {}, storageState: undefined });
  suppress = false;
 }
 function applyRemoteRemoval() {
  clearTimeout(timeout); pending = null; remote = null;
  if (journalKey) {
   try { localStorage.removeItem(journalKey); } catch { /* The selected server state has no saved session. */ }
  }
  const fresh = initialState();
  const session = { doc: fresh.doc, prefs: fresh.prefs, keyboardOpen: fresh.keyboardOpen };
  revision = 0; lastWriter = writerId; lastSignature = fullSignature(session); lastWork = workSignature(session); author = false;
  suppress = true;
  store.setState({ ...session, past: [], future: [], copies: {}, storageState: undefined });
  suppress = false;
 }
 function storageEvent(event: { key: string | null; newValue: string | null; source?: string }) {
  if (event.key !== SESSION_KEY || protectedDraft) return;
  if (event.source === 'server-resolution-remote' && !event.newValue) {
   applyRemoteRemoval();
   return;
  }
  if (!event.newValue) return;
  try {
   const value = decode(event.newValue);
   if (event.source === 'server-merge' || event.source === 'server-resolution-remote') {
    applyRemote(value);
    return;
   }
   if (event.source === 'server-resolution-local') {
    clearTimeout(timeout); pending = null; remote = null;
    revision = value.state.sync.revision; lastWriter = value.state.sync.writerId;
    lastSignature = fullSignature(value.state.session); lastWork = workSignature(value.state.session); author = true;
    return;
   }
   if (value.state.sync.writerId === writerId || value.state.sync.revision < revision) return;
   if (value.state.sync.revision === revision && value.state.sync.writerId === lastWriter) return;
   if (pending && workSignature(pending) !== lastWork) {
    clearTimeout(timeout); remote = value;
    quietState({ kind: 'conflict', message: 'Another tab saved a newer draft while you were editing.' });
   } else applyRemote(value);
  } catch { /* A malformed remote event must never replace validated local work. */ }
 }
 store.resolveConflict = choice => {
  if (!remote) return;
  const incoming = remote;
  if (choice === 'remote') applyRemote(incoming);
  else {
   revision = Math.max(revision, incoming.state.sync.revision); remote = null; quietState(undefined); author = true;
   const current = store.getState(); queue({ doc: current.doc, prefs: current.prefs, keyboardOpen: current.keyboardOpen }, true); flush();
  }
 };
 const serverSnapshotRequest = (event: Event) => {
  const detail = (event as CustomEvent<ServerStorageSnapshotRequest>).detail;
  if (!detail || detail.key !== SESSION_KEY) return;
  const current = store.getState();
  detail.value = JSON.stringify({ version: 3, state: {
   session: { doc: current.doc, prefs: current.prefs, keyboardOpen: current.keyboardOpen },
   sync: { revision, writerId },
  } });
  detail.provided = true;
 };
 store.clearStorage = () => {
  if (isServerStorageActive()) {
   quietState({ kind: 'error', message: 'Server-only mode: local-storage reset is unavailable. Server records are protected.' });
   return;
  }
  // Stop all writes first so a pending autosave cannot resurrect cleared data.
  protectedDraft = true; pending = null; clearTimeout(timeout);
  clearAppStorage();
 };
 activeSessionFlush = flush;
 // Start the IndexedDB transaction before the browser suspends or tears down this page.
 const pagehide = () => { void flush(); };
 const visibilitychange = () => { if (document.visibilityState === 'hidden') void flush(); };
 const unsubscribeLearningStorage = subscribeLearningStorage(storageEvent);
 const nativeStorageEvent = (event: StorageEvent) => storageEvent(event);
 window.addEventListener(SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT, serverSnapshotRequest);
 window.addEventListener('storage', nativeStorageEvent); window.addEventListener('pagehide', pagehide); document.addEventListener('visibilitychange', visibilitychange);
 if (recoveredJournal && !protectedDraft) {
  // Carry the recovered draft back into authoritative IndexedDB without
  // requiring the learner to edit again after a rapid reload.
  queue({ doc: initial.doc, prefs: initial.prefs, keyboardOpen: initial.keyboardOpen }, true);
 }
 if (!saved && !protectedDraft) {
  const onlyExercise = initial.doc.exercises.length === 1 ? initial.doc.exercises[0] : undefined;
  const pristineDefault = !!onlyExercise && onlyExercise.source === example && !onlyExercise.bankQuestionId
   && !onlyExercise.answerText && onlyExercise.steps.length === 1 && stepLatex(onlyExercise.steps[0]) === example
   && !initial.doc.session?.bankId;
  // Do not save the placeholder exercise before a saved server snapshot can hydrate a new browser.
  if (!pristineDefault || hasLegacyState) queue({ doc: initial.doc, prefs: initial.prefs, keyboardOpen: initial.keyboardOpen }, true);
 }
 return { store, flush, dispose: () => { void flush(); clearTimeout(timeout); if (activeSessionFlush === flush) activeSessionFlush = undefined; unsubscribeLearningStorage(); window.removeEventListener(SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT, serverSnapshotRequest); window.removeEventListener('storage', nativeStorageEvent); window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', visibilitychange); } };
}
