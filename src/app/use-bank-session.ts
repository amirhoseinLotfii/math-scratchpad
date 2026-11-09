import { useCallback, useEffect, useRef, useState } from 'react';
import { actions, exerciseOf, type ScratchStore } from '../store';
import { serialize } from '../persistence';
import { SESSION_KEY, flushPersistedSession } from '../features/session/persistence/persistent-store';
import { ARCHIVE_KEY, archiveSession, readArchive, type DriveBank } from '../features/drive-bank/drive-bank';
import { emptyLessonProgressState, lessonProgressStorageKey, LESSON_PROGRESS_PREFIX, readLessonProgress, saveLessonProgress, type LessonProgressState } from '../features/lessons/lesson-progress-store';
import type { LessonProgress } from '../features/lessons/types';
import { flushLearningStorage, getAuthenticatedServerStorage, getLearningStorage, subscribeLearningStorage } from '../sync/browser-db';
import { getDefaultSyncRuntime } from '../sync/runtime';
import { queueChapterSnapshot } from '../sync/chapter-snapshot';

export type LoadedBank = { bank: DriveBank; version: string };

/**
 * Owns the loaded Drive question bank, its per-lesson progress (persisted and
 * synced across tabs) and the chapter-transition archive that runs before a
 * different chapter's bank replaces the active session.
 */
export function useBankSession({ initialBank, store, setTimerPaused }: { initialBank?: LoadedBank; store: ScratchStore; setTimerPaused: (paused: boolean) => void }) {
 const dispatch = store.dispatch;
 const [chapterTransitioning, setChapterTransitioning] = useState(false);
 const [loadedBank, setLoadedBank] = useState<{ bank: DriveBank; version: string } | null>(initialBank ?? null);
 const loadedBankRef = useRef(loadedBank); loadedBankRef.current = loadedBank;
 const bankTransitionRef = useRef<string | null>(null);
 const [lessonProgressState, setLessonProgressState] = useState<LessonProgressState>(() => initialBank ? readLessonProgress(initialBank.bank, initialBank.version) : emptyLessonProgressState('', ''));
 const [lessonRemoteRevision, setLessonRemoteRevision] = useState(0);
 const lessonProgressRef = useRef(lessonProgressState); lessonProgressRef.current = lessonProgressState;
 const [lessonPersistenceMessage, setLessonPersistenceMessage] = useState(lessonProgressState.warning);
 const lessonProgressById = lessonProgressState.progressById;
 function bankReady(bank: DriveBank | null, version: string) {
  if (!bank) {
   setLoadedBank(null);
   const empty = emptyLessonProgressState('', ''); lessonProgressRef.current = empty; setLessonProgressState(empty); setLessonPersistenceMessage('');
   return;
  }
  const sessionMeta = store.getState().doc.session;
  if (sessionMeta?.bankId && (sessionMeta.bankId !== bank.bank_id || sessionMeta.bankVersion !== version)) return;
  const current = loadedBankRef.current;
  if (current?.bank.bank_id === bank.bank_id && current.version === version) { setLoadedBank({ bank, version }); return; }
  const restored = readLessonProgress(bank, version);
  loadedBankRef.current = { bank, version };
  setLoadedBank({ bank, version }); lessonProgressRef.current = restored; setLessonProgressState(restored); setLessonPersistenceMessage(restored.warning);
 }
 async function prepareBankTransition(bank: DriveBank, version: string) {
  const previous = store.getState();
  const activeSession = previous.doc.session;
  if (!activeSession?.bankId) return;
  const activeBankId = activeSession.bankId;
  const current = loadedBankRef.current;
  const previousChapter = activeSession.chapter ?? (current?.bank.bank_id === activeBankId ? current.bank.chapter?.number : undefined);
  const nextChapter = bank.chapter?.number;
  const chapterChanged = previousChapter !== undefined && nextChapter !== undefined
   ? previousChapter !== nextChapter
   : activeBankId !== bank.bank_id;
  if (!chapterChanged) return;

  const transitionKey = `${activeBankId}:${activeSession.bankVersion ?? 'unknown'}->${bank.bank_id}:${version}`;
  if (bankTransitionRef.current) throw new Error('یک انتقال فصل دیگر هنوز در حال انجام است.');
  bankTransitionRef.current = transitionKey;
  setChapterTransitioning(true);
  setLessonPersistenceMessage('فصل قبلی در حال ذخیره و تأیید در Google Drive و Notion است…');
  const storage = getLearningStorage();
  const runtime = getDefaultSyncRuntime();
  let cleanupBackup: { archiveRaw: string | null; progress: Array<{ key: string; value: string }> } | undefined;
  let transitionState = previous;
  const timerExercise = exerciseOf(previous.doc);
  const resumeTimerAfterFailure = !timerExercise.timerPaused;
  try {
   if (previousChapter === undefined) throw new Error('شمارهٔ فصل فعال از بانک فعلی قابل تشخیص نیست؛ داده پاک نشد.');
   if (!runtime) throw new Error('موتور همگام‌سازی آماده نیست.');
   if (previous.storageState) throw new Error('وضعیت ذخیره‌سازی جلسه نیاز به رسیدگی دارد.');
   if (resumeTimerAfterFailure) {
    dispatch(actions.timerPause({ exerciseId: timerExercise.id, now: Date.now(), paused: true }));
    setTimerPaused(true);
   }
   transitionState = store.getState();
   await archiveSession(transitionState);
   await flushPersistedSession();
   if (store.getState().storageState) throw new Error('ذخیرهٔ محلی جلسه تأیید نشد؛ داده پاک نشد.');
   await flushLearningStorage();
   const serverStorage = getAuthenticatedServerStorage();
   if (!serverStorage) throw new Error('برای آرشیو امن، اتصال سرور برقرار نیست.');
   await serverStorage.flush();
   await runtime.syncAllUntilComplete();

   // The transition overlay blocks editing, but take the export from the latest
   // durable state after remote sync instead of the stale entry-state snapshot.
   await flushPersistedSession();
   await flushLearningStorage();
   await serverStorage.flush();
   const snapshotState = store.getState();
   if (snapshotState.storageState) throw new Error('ذخیرهٔ محلی جلسه تأیید نشد؛ داده پاک نشد.');

   const archives = readArchive();
   const currentSessionId = activeSession.id;
   const belongsToBank = (entry: { id: string; data: string }) => {
    if (entry.id === currentSessionId) return true;
    try {
     const parsed = JSON.parse(entry.data) as { doc?: { session?: { bankId?: string } } };
     return parsed.doc?.session?.bankId === activeBankId;
    } catch { return false; }
   };
   // The current session is captured below as the authoritative live document;
   // an earlier archive copy with the same session ID would only duplicate it.
   const chapterArchives = archives.filter(entry => entry.id !== currentSessionId && belongsToBank(entry));
   const chapterSessionIds = new Set([currentSessionId, ...chapterArchives.map(entry => entry.id)]);
   const progressPrefix = `${LESSON_PROGRESS_PREFIX}:${encodeURIComponent(activeBankId)}:`;
   const progressRecords: Array<{ key: string; value: string }> = [];
   for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(progressPrefix)) continue;
    const value = storage.getItem(key);
    if (value !== null) progressRecords.push({ key, value });
   }
   const serverEvents = await runtime.readAllServerEvents();
   const chapter = previousChapter;
   const chapterEvents = serverEvents
    .filter(record => record.event.type !== 'chapter_snapshot'
     && chapterSessionIds.has(record.event.session) && record.event.chapter === chapter)
    .map(record => ({ seq: record.seq, event: record.event }));
   const rawSession = storage.getItem(SESSION_KEY);
   const snapshot = {
    format: 'math-scratchpad.chapter-snapshot/v1',
    bank: { id: activeBankId, version: activeSession.bankVersion ?? current?.version ?? 'unknown', chapter, title: current?.bank.chapter?.title },
    activeSession: { sessionId: currentSessionId, appStateRaw: rawSession, sessionExport: serialize(snapshotState) },
    archivedSessions: chapterArchives,
    lessonProgressRecords: progressRecords,
    chapterEvents,
   };
   await queueChapterSnapshot({
    bankId: activeBankId,
    bankVersion: activeSession.bankVersion ?? current?.version ?? 'unknown',
    chapter,
    sessionId: currentSessionId,
    payload: snapshot,
   });
   // The immutable snapshot must exist in both remote destinations before any
   // chapter-specific browser data is removed.
   await runtime.syncAllUntilComplete();

   cleanupBackup = { archiveRaw: storage.getItem(ARCHIVE_KEY), progress: progressRecords };
   const remainingArchives = archives.filter(entry => !belongsToBank(entry));
   if (remainingArchives.length) storage.setItem(ARCHIVE_KEY, JSON.stringify(remainingArchives));
   else storage.removeItem(ARCHIVE_KEY);
   for (const record of progressRecords) storage.removeItem(record.key);
   await flushLearningStorage();
   await serverStorage.flush();
   dispatch(actions.resetSession());
   await flushPersistedSession();
   await flushLearningStorage();
   await serverStorage.flush();
   await runtime.syncAllUntilComplete();
   setLessonPersistenceMessage('آرشیو فصل قبلی در Drive و Notion تأیید شد؛ دادهٔ محلی آن پاک شد.');
  } catch (error) {
   if (cleanupBackup) {
    try {
     if (cleanupBackup.archiveRaw === null) storage.removeItem(ARCHIVE_KEY);
     else storage.setItem(ARCHIVE_KEY, cleanupBackup.archiveRaw);
     for (const record of cleanupBackup.progress) storage.setItem(record.key, record.value);
     store.setState(transitionState);
     await flushPersistedSession();
     await flushLearningStorage();
     await getAuthenticatedServerStorage()?.flush();
    } catch { /* Keep the original failure visible; the snapshot is already remote-verified. */ }
   }
   if (resumeTimerAfterFailure && store.getState().doc.session?.id === activeSession.id) {
    dispatch(actions.timerPause({ exerciseId: timerExercise.id, now: Date.now(), paused: false }));
    setTimerPaused(false);
   }
   const message = error instanceof Error ? error.message : 'همگام‌سازی فصل قبلی ناموفق بود.';
   setLessonPersistenceMessage(`فصل جدید بارگیری نشد؛ اطلاعات فصل قبلی حفظ شد. ${message}`);
   throw error;
  } finally {
   setChapterTransitioning(false);
   if (bankTransitionRef.current === transitionKey) bankTransitionRef.current = null;
  }
 }
 const updateLessonProgressState = useCallback((next: LessonProgressState) => {
  lessonProgressRef.current = next; setLessonProgressState(next);
  const activeBank = loadedBankRef.current;
  if (!activeBank || activeBank.bank.bank_id !== next.bankId || activeBank.version !== next.bankVersion) return;
  const result = saveLessonProgress(activeBank.bank, activeBank.version, next);
  setLessonPersistenceMessage(result.saved ? (next.persistenceBlocked ? next.warning : '') : result.message);
  if (result.saved) void flushLearningStorage().catch(() => setLessonPersistenceMessage('IndexedDB could not confirm the lesson save; old browser data remains protected.'));
 }, []);
 useEffect(() => {
  if (!loadedBank) return;
  const bankForSync: DriveBank = loadedBank.bank;
  const versionForSync: string = loadedBank.version;
  const key = lessonProgressStorageKey(bankForSync.bank_id, versionForSync);
  function onLessonStorage(event: { key: string | null; newValue: string | null }) {
   if (event.key !== key) return;
   if (event.newValue === null) {
    const cleared = emptyLessonProgressState(bankForSync.bank_id, versionForSync);
    lessonProgressRef.current = cleared; setLessonProgressState(cleared); setLessonPersistenceMessage(''); setLessonRemoteRevision(value => value + 1);
    return;
   }
   const restored = readLessonProgress(bankForSync, versionForSync);
   if (restored.persistenceBlocked) { setLessonPersistenceMessage(restored.warning); return; }
   lessonProgressRef.current = restored; setLessonProgressState(restored); setLessonPersistenceMessage(''); setLessonRemoteRevision(value => value + 1);
  }
  const unsubscribeLearningStorage = subscribeLearningStorage(onLessonStorage);
  const nativeStorageEvent = (event: StorageEvent) => onLessonStorage(event);
  window.addEventListener('storage', nativeStorageEvent);
  return () => { unsubscribeLearningStorage(); window.removeEventListener('storage', nativeStorageEvent); };
 }, [loadedBank]);
 const rememberLessonProgress = useCallback((progress: LessonProgress) => {
  const current = lessonProgressRef.current;
  updateLessonProgressState({ ...current, progressById: { ...current.progressById, [progress.lessonId]: progress } });
 }, [updateLessonProgressState]);
 return { loadedBank, loadedBankRef, bankTransitionRef, chapterTransitioning, lessonProgressState, lessonProgressRef, lessonProgressById, lessonRemoteRevision, lessonPersistenceMessage, bankReady, prepareBankTransition, updateLessonProgressState, rememberLessonProgress };
}
