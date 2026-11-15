import { SESSION_KEY, decode, fullSignature, workSignature, type Envelope } from './session-envelope';
import { restorePersistedDraft, currentTabJournalKey, readPendingJournal, type PendingDraftJournal } from './session-recovery';
import { attachStorageLifecycle } from './session-storage-lifecycle';
import { example, isoLocal, stepLatex, uid } from '../../../model';
import { makeStore, initialState, type PersistedSession, type ScratchState, type ScratchStore } from '../../../store';
import { clampRestoredTimers } from '../timer-continuity';
import type { PersistOptions } from 'zustand/middleware';
import { flushLearningStorage, getLearningStorage, isServerStorageActive } from '../../../sync/browser-db';
import { type ServerStorageSnapshotRequest } from '../../../sync/server-storage';
export { getSessionSyncBytes, SESSION_KEY } from './session-envelope';
export const STORAGE_PREFIX = 'math-scratchpad';
const PERSIST_DEBOUNCE_MS = 800;
let activeSessionFlush: (() => Promise<void>) | undefined;
export async function flushPersistedSession(): Promise<void> {
  await activeSessionFlush?.();
}
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
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
    return true;
  } catch {
    return false;
  }
}
export function createPersistentStore() {
  const writerId = uid();
  const storage = getLearningStorage();
  const journalKey = currentTabJournalKey();
  let { recoveredJournal, saved, protectedDraft, initial, hasLegacyState } = restorePersistedDraft(storage, journalKey);
  let revision = saved?.state.sync.revision ?? 0,
    lastWriter = saved?.state.sync.writerId ?? writerId;
  let lastSignature = saved ? fullSignature(saved.state.session) : '',
    lastWork = saved ? workSignature(saved.state.session) : '';
  let author = !saved || lastWriter === writerId,
    suppress = false,
    failedSignature = '';
  let pending: PersistedSession['session'] | null = null,
    remote: Envelope | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined, store: ScratchStore;
  function cancelScheduledFlush() {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  }
  const quietState = (storageState: ScratchState['storageState']) => {
    suppress = true;
    store.setState({ storageState });
    suppress = false;
  };
  async function flush() {
    if (!pending || protectedDraft || remote) {
      await flushLearningStorage().catch(() => undefined);
      return;
    }
    cancelScheduledFlush();
    const session = pending;
    pending = null;
    const next: Envelope = { version: 3, state: { session, sync: { revision: revision + 1, writerId } } };
    try {
      storage.setItem(SESSION_KEY, JSON.stringify(next));
      await flushLearningStorage();
      revision = next.state.sync.revision;
      lastWriter = writerId;
      author = true;
      lastSignature = fullSignature(session);
      lastWork = workSignature(session);
      failedSignature = '';
      // A newer edit may have arrived while IndexedDB was writing the snapshot.
      // Never discard its emergency journal when completing an older save.
      if (journalKey) {
        const journal = readPendingJournal(journalKey);
        if (journal && fullSignature(journal.snapshot.state.session) === lastSignature) {
          try {
            localStorage.removeItem(journalKey);
          } catch {
            /* IndexedDB remains authoritative. */
          }
        }
      }
      suppress = true;
      store.setState(
        store.getState().storageState?.kind === 'error' ? { storageState: undefined, savedAt: isoLocal() } : { savedAt: isoLocal() },
      );
      suppress = false;
    } catch {
      failedSignature = fullSignature(session);
      quietState({ kind: 'error', message: 'Draft storage is unavailable. Your work remains in memory; copy a full session JSON backup.' });
    }
  }
  function queue(session: PersistedSession['session'], force = false) {
    if (suppress || protectedDraft || remote) return;
    const signature = fullSignature(session),
      work = workSignature(session);
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
    if (timeout === undefined)
      timeout = setTimeout(() => {
        timeout = undefined;
        void flush();
      }, PERSIST_DEBOUNCE_MS);
  }
  const options: PersistOptions<ScratchState, PersistedSession> = {
    name: SESSION_KEY,
    version: 3,
    storage: {
      getItem: () => saved,
      setItem: (_name, value) => queue(value.state.session),
      removeItem: () => {
        /* Destructive storage clearing requires explicit recovery. */
      },
    },
    partialize: (value) => ({
      session: { doc: value.doc, prefs: value.prefs, keyboardOpen: value.keyboardOpen },
      sync: { revision, writerId: lastWriter },
    }),
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
    cancelScheduledFlush();
    pending = null;
    remote = null;
    // An explicit 'Use saved draft' choice (or a clean remote update) abandons
    // this tab's pending work. Its emergency copy must not resurrect on reload.
    if (journalKey) {
      try {
        localStorage.removeItem(journalKey);
      } catch {
        /* The validated incoming draft is still in IndexedDB. */
      }
    }
    revision = value.state.sync.revision;
    lastWriter = value.state.sync.writerId;
    lastSignature = fullSignature(value.state.session);
    lastWork = workSignature(value.state.session);
    author = false;
    suppress = true;
    store.setState({ ...value.state.session, past: [], future: [], copies: {}, storageState: undefined });
    suppress = false;
  }
  function applyRemoteRemoval() {
    cancelScheduledFlush();
    pending = null;
    remote = null;
    if (journalKey) {
      try {
        localStorage.removeItem(journalKey);
      } catch {
        /* The selected server state has no saved session. */
      }
    }
    const fresh = initialState();
    const session = { doc: fresh.doc, prefs: fresh.prefs, keyboardOpen: fresh.keyboardOpen };
    revision = 0;
    lastWriter = writerId;
    lastSignature = fullSignature(session);
    lastWork = workSignature(session);
    author = false;
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
        cancelScheduledFlush();
        pending = null;
        remote = null;
        revision = value.state.sync.revision;
        lastWriter = value.state.sync.writerId;
        lastSignature = fullSignature(value.state.session);
        lastWork = workSignature(value.state.session);
        author = true;
        return;
      }
      if (value.state.sync.writerId === writerId || value.state.sync.revision < revision) return;
      if (value.state.sync.revision === revision && value.state.sync.writerId === lastWriter) return;
      if (pending && workSignature(pending) !== lastWork) {
        cancelScheduledFlush();
        remote = value;
        quietState({ kind: 'conflict', message: 'Another tab saved a newer draft while you were editing.' });
      } else applyRemote(value);
    } catch {
      /* A malformed remote event must never replace validated local work. */
    }
  }
  store.resolveConflict = (choice) => {
    if (!remote) return;
    const incoming = remote;
    if (choice === 'remote') applyRemote(incoming);
    else {
      revision = Math.max(revision, incoming.state.sync.revision);
      remote = null;
      quietState(undefined);
      author = true;
      const current = store.getState();
      queue({ doc: current.doc, prefs: current.prefs, keyboardOpen: current.keyboardOpen }, true);
      flush();
    }
  };
  const serverSnapshotRequest = (event: Event) => {
    const detail = (event as CustomEvent<ServerStorageSnapshotRequest>).detail;
    if (!detail || detail.key !== SESSION_KEY) return;
    const current = store.getState();
    detail.value = JSON.stringify({
      version: 3,
      state: {
        session: { doc: current.doc, prefs: current.prefs, keyboardOpen: current.keyboardOpen },
        sync: { revision, writerId },
      },
    });
    detail.provided = true;
  };
  store.clearStorage = () => {
    if (isServerStorageActive()) {
      quietState({ kind: 'error', message: 'Server-only mode: local-storage reset is unavailable. Server records are protected.' });
      return;
    }
    // Stop all writes first so a pending autosave cannot resurrect cleared data.
    protectedDraft = true;
    pending = null;
    cancelScheduledFlush();
    clearAppStorage();
  };
  activeSessionFlush = flush;
  const detachStorageLifecycle = attachStorageLifecycle(flush, storageEvent, serverSnapshotRequest);
  if (recoveredJournal && !protectedDraft) {
    // Carry the recovered draft back into authoritative IndexedDB without
    // requiring the learner to edit again after a rapid reload.
    queue({ doc: initial.doc, prefs: initial.prefs, keyboardOpen: initial.keyboardOpen }, true);
  }
  if (!saved && !protectedDraft) {
    const onlyExercise = initial.doc.exercises.length === 1 ? initial.doc.exercises[0] : undefined;
    const pristineDefault =
      !!onlyExercise &&
      onlyExercise.source === example &&
      !onlyExercise.bankQuestionId &&
      !onlyExercise.answerText &&
      onlyExercise.steps.length === 1 &&
      stepLatex(onlyExercise.steps[0]) === example &&
      !initial.doc.session?.bankId;
    // Do not save the placeholder exercise before a saved server snapshot can hydrate a new browser.
    if (!pristineDefault || hasLegacyState) queue({ doc: initial.doc, prefs: initial.prefs, keyboardOpen: initial.keyboardOpen }, true);
  }
  return {
    store,
    flush,
    dispose: () => {
      void flush();
      cancelScheduledFlush();
      if (activeSessionFlush === flush) activeSessionFlush = undefined;
      detachStorageLifecycle();
    },
  };
}
