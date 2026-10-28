import { initialKeyboardOpen } from '../../../shared/lib/ui-prefs';
import { z } from 'zod';
import { uid } from '../../../model';
import { isoLocal } from '../../../model';
import { makeStore, initialState, type PersistedSession, type ScratchState, type ScratchStore } from '../../../store';
import { restoreState, validateSession } from '../../../persistence';
import type { PersistOptions } from 'zustand/middleware';
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
/** Remove every localStorage key owned by this app (all schema versions). */
export function clearAppStorage() {
 try { Object.keys(localStorage).filter(key => key.startsWith(STORAGE_PREFIX)).forEach(key => localStorage.removeItem(key)); return true; } catch { return false; }
}
export function createPersistentStore() {
 const writerId = uid();
 let saved: Envelope | null = null, protectedDraft = false, bootError = '';
 let initial: ScratchState;
 try {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) { saved = decode(raw); initial = { ...initialState(), ...saved.state.session }; }
  else {
   const hasLegacy = !!(localStorage.getItem('math-scratchpad-redux-v2') ?? localStorage.getItem('math-scratchpad-flow-v1'));
   initial = restoreState();
   if (!hasLegacy) initial.keyboardOpen = matchMedia('(max-width: 899px), (pointer: coarse)').matches;
   if (initial.notice) { protectedDraft = true; bootError = initial.notice; }
  }
 } catch {
  protectedDraft = true; bootError = 'Saved draft could not be restored. Import a backup or copy your current work before recovery.'; initial = initialState(); initial.keyboardOpen = true;
 }
 if (!protectedDraft || bootError !== 'Saved draft could not be restored. Import a backup or copy your current work before recovery.') initial.keyboardOpen = initialKeyboardOpen(initial.keyboardOpen);
 if (bootError) initial.storageState = { kind: 'error', message: bootError };
 let revision = saved?.state.sync.revision ?? 0, lastWriter = saved?.state.sync.writerId ?? writerId;
 let lastSignature = saved ? fullSignature(saved.state.session) : '', lastWork = saved ? workSignature(saved.state.session) : '';
 let author = !saved || lastWriter === writerId, suppress = false, failedSignature = '';
 let pending: PersistedSession['session'] | null = null, remote: Envelope | null = null;
 let timeout: ReturnType<typeof setTimeout> | undefined, store: ScratchStore;
 const quietState = (storageState: ScratchState['storageState']) => {
  suppress = true; store.setState({ storageState }); suppress = false;
 };
 function flush() {
  if (!pending || protectedDraft || remote) return;
  clearTimeout(timeout); const session = pending; pending = null;
  const next: Envelope = { version: 3, state: { session, sync: { revision: revision + 1, writerId } } };
  try {
   localStorage.setItem(SESSION_KEY, JSON.stringify(next));
   revision = next.state.sync.revision; lastWriter = writerId; author = true;
   lastSignature = fullSignature(session); lastWork = workSignature(session); failedSignature = '';
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
  pending = session; clearTimeout(timeout); timeout = setTimeout(flush, 180);
 }
 const options: PersistOptions<ScratchState, PersistedSession> = {
  name: SESSION_KEY, version: 3,
  storage: {
   getItem: () => saved,
   setItem: (_name, value) => queue(value.state.session),
   removeItem: () => { /* Destructive storage clearing requires explicit recovery. */ },
  },
  partialize: value => ({ session: { doc: value.doc, prefs: value.prefs, keyboardOpen: value.keyboardOpen }, sync: { revision, writerId: lastWriter } }),
  merge: (value, current) => {
   const persisted = value as PersistedSession | undefined;
   return persisted ? { ...current, ...persisted.session, keyboardOpen: current.keyboardOpen } : current;
  },
 };
 store = makeStore(initial, options);
 function applyRemote(value: Envelope) {
  clearTimeout(timeout); pending = null; remote = null;
  revision = value.state.sync.revision; lastWriter = value.state.sync.writerId;
  lastSignature = fullSignature(value.state.session); lastWork = workSignature(value.state.session); author = false;
  suppress = true;
  store.setState({ ...value.state.session, past: [], future: [], copies: {}, storageState: undefined });
  suppress = false;
 }
 function storageEvent(event: StorageEvent) {
  if (event.key !== SESSION_KEY || !event.newValue || protectedDraft) return;
  try {
   const value = decode(event.newValue);
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
 store.clearStorage = () => {
  // Stop all writes first so a pending autosave cannot resurrect cleared data.
  protectedDraft = true; pending = null; clearTimeout(timeout);
  clearAppStorage();
 };
 const pagehide = () => queueMicrotask(flush);
 window.addEventListener('storage', storageEvent); window.addEventListener('pagehide', pagehide);
 if (!saved && !protectedDraft) queue({ doc: initial.doc, prefs: initial.prefs, keyboardOpen: initial.keyboardOpen }, true);
 return { store, flush, dispose: () => { flush(); clearTimeout(timeout); window.removeEventListener('storage', storageEvent); window.removeEventListener('pagehide', pagehide); } };
}
