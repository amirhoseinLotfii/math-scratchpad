import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { RotateCcw, Trash2, Plus, BookOpen } from 'lucide-react';
import { useAppDispatch, useAppSelector, useAppStore } from './hooks';
import { actions, exerciseOf } from './store';
import { example, leaves, stepIsBlank, stepLatex } from './model';
import { fingerprint, reviewMessage, writeClipboard } from './review';
import { serialize, validateSession } from './persistence';
import { diagnosticQuestions } from './diagnostic';
import { fractionRoundOne } from './fractionRoundOne';
import { gradeDiagnostic } from './assessment';
import { migrateChatDiagnosticSession } from './legacyDiagnostic';
import { Keyboard } from './Keyboard';
import { QuestionTimer } from './QuestionTimer';
import { Button } from './shared/ui/button';

import { useWorkspaceLayout } from './shared/hooks/use-workspace-layout';
import { QuestionNavigator } from './features/workspace/components/question-navigator';
import { MathTools } from './features/workspace/components/math-tools';
import { executeMathfield, insertMathSymbol, mathfieldForStep, moveMathfield, redoMathfield, undoMathfield } from './features/math-editor/mathlive-adapter';
import { MathLiveStepInput } from './features/math-editor/components/mathlive-step-input';
export { INSERT_VISIBLE } from './features/math-editor/components/math-insert-dialog';
import { questionStatus } from './features/workspace/model/workspace-layout';
import { buildTutorExport, downloadText, missingFinalAnswers } from './features/session/export/tutor-export';
import { clearAppStorage } from './features/session/persistence/persistent-store';
import { isoLocal } from './model';
import { DriveBankPanel } from './features/drive-bank/drive-bank-panel';
import { archiveSession, bankDocument, type BankQuestion, type DriveBank } from './features/drive-bank/drive-bank';
import { getConfig as getDriveConfig } from './features/drive-bank/google';
import { getLesson, getPracticeQuestions } from './features/lessons/selectors';
import type { Lesson, LessonProgress } from './features/lessons/types';
import { LessonScreen, type LessonRestoreTarget } from './features/lessons/lesson-screen';
import { LessonPicker } from './features/lessons/lesson-picker';
import { LessonReferenceDialog } from './features/lessons/lesson-reference-dialog';
import { buildLessonSections } from './features/lessons/lesson-sections';
import { contentDirection, languageForText, LessonSourceAttribution, LessonText, QuestionChoice, QuestionSource } from './features/lessons/lesson-content';
import { lessonExportDataFromState, readLessonExportData, readLessonProgress, type LessonExportData } from './features/lessons/lesson-progress-store';
import { initialKeyboardOpen, writeKeyboardChoice } from './shared/lib/ui-prefs';
import { ActivityTracker } from './sync/activity-tracker';
import { contextForQuestion, emitLearnEvent, type LearnEventContext, type LearnEventDraft } from './sync/events';
import { SyncPanel } from './sync/sync-panel';
import { getLearningStorage } from './sync/browser-db';
import { getDefaultSyncRuntime } from './sync/runtime';
import { CloudResetPreviewDialog } from './features/session/components/cloud-reset-preview';
import { ContinueLearningButton, useOptionalReadingPositionContext } from './features/progress/reading-position-context';
import { AppHeader } from './app/app-header';
import { ExerciseMenu } from './app/exercise-menu';
import { DialogsHost, type ResetKind } from './app/dialogs-host';
import { PracticeLauncher, usePracticeLauncher } from './app/practice-launcher';
import { useBankSession } from './app/use-bank-session';
import { usePracticeEditEvents } from './app/use-practice-edit-events';
import { useWellbeing } from './app/use-wellbeing';

const EMPTY_SYNC_STATUS = { phase: 'idle' as const, pending: 0, driveMirror: null, notionMirror: null };
const NO_SYNC_SUBSCRIBE = () => () => undefined;
type Decision = 'next' | 'complete' | 'copy';
function freshLessonProgress(lessonId: string): LessonProgress {
 return { lessonId, status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0, completedConceptIds: [], completedSectionIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {}, learnStartedAt: new Date().toISOString() };
}
/** `initialBank` is used by isolated browser previews/tests; normal app startup loads through DriveBankPanel. */
export function App({ initialBank }: { initialBank?: { bank: DriveBank; version: string } } = {}) {
 const layout = useWorkspaceLayout(), wide = layout !== 'phone';
 const syncRuntime = getDefaultSyncRuntime();
 const syncStatus = useSyncExternalStore(syncRuntime?.subscribe ?? NO_SYNC_SUBSCRIBE, syncRuntime?.getSnapshot ?? (() => EMPTY_SYNC_STATUS), () => EMPTY_SYNC_STATUS);
 const [shortcutsOpen, setShortcutsOpen] = useState(false);
 const [guidanceOpen, setGuidanceOpen] = useState(false);
 const [exportWarning, setExportWarning] = useState<number[] | null>(null), [resetKind, setResetKind] = useState<ResetKind | null>(null);
 const [cloudPreviewOpen, setCloudPreviewOpen] = useState(false);
 const fileInput = useRef<HTMLInputElement>(null);
 const menuInvoker = useRef<HTMLButtonElement>(null);
 const state = useAppSelector(s => s), store = useAppStore(), dispatch = useAppDispatch();
 const ex = exerciseOf(state.doc), exerciseIndex = state.doc.exercises.findIndex(x => x.id === ex.id);
 const manualTimerPause = useRef(!!ex.timerPaused), trackedExerciseId = useRef(ex.id);
 const [menu, setMenu] = useState(false);
 const launcher = usePracticeLauncher(), { setup, backup, confirmExam, confirmFractions, jsonForm, openInlinePanel } = launcher;
 const bankSession = useBankSession({ initialBank, store, setTimerPaused: setTrackedTimerPaused });
 const { loadedBank, loadedBankRef, bankTransitionRef, chapterTransitioning, lessonProgressRef, lessonProgressById, lessonRemoteRevision, lessonPersistenceMessage, bankReady, prepareBankTransition, updateLessonProgressState, rememberLessonProgress } = bankSession;
 const [driveBankOpen, setDriveBankOpen] = useState(false);
 const [syncPanelOpen, setSyncPanelOpen] = useState(false);
 const [driveBankInitialized, setDriveBankInitialized] = useState(() => !!getDriveConfig().fileId);
 const [, setDriveBankAvailable] = useState(false);
 const [lessonPickerOpen, setLessonPickerOpen] = useState(false), [lessonScreen, setLessonScreen] = useState<Lesson | null>(null);
 const [referenceLesson, setReferenceLesson] = useState<Lesson | null>(null), [referenceWasRunning, setReferenceWasRunning] = useState(false);
 const [practiceLessonId, setPracticeLessonId] = useState<string | null>(null), [practiceStartError, setPracticeStartError] = useState('');
 const lessonButton = useRef<HTMLButtonElement>(null);
 const [insertOpen, setInsertOpen] = useState(false);
 const [decision, setDecision] = useState<Decision | null>(null), [complete, setComplete] = useState(false);
 const [manual, setManual] = useState(''), [busy, setBusy] = useState(false), [showResults, setShowResults] = useState(false);
 const editorRoot = useRef<HTMLElement>(null), manualRef = useRef<HTMLTextAreaElement>(null);
 const invoker = useRef<HTMLElement | null>(null), insertInvoker = useRef<HTMLElement | null>(null), restoreInsert = useRef(true);
 const decisionRef = useRef<Decision | null>(null), copyBusy = useRef(false);
 const fractions = ex.assessment === 'fractions-round-1', questionBank = fractions ? fractionRoundOne : diagnosticQuestions;
 const exam = !!ex.diagnosticId && state.doc.exercises.some(x => x.diagnosticId === questionBank.length);
 const answeredCount = state.doc.exercises.filter(x => questionStatus(x) === 'Answered').length, skippedCount = state.doc.exercises.filter(x => x.skipped).length;
 const copied = !state.copies[ex.id] ? '' : state.copies[ex.id] === fingerprint(state.doc) ? 'Copied' : 'Changed since copy';
 const matchingBank = loadedBank && state.doc.session?.bankId === loadedBank.bank.bank_id && state.doc.session?.bankVersion === loadedBank.version ? loadedBank : null;
 const currentBankQuestion = matchingBank && ex.bankQuestionId ? matchingBank.bank.questions.find(question => question.id === ex.bankQuestionId) : undefined;
 const answerType = ex.answerType ?? currentBankQuestion?.answerType ?? (currentBankQuestion?.mode === 'text' ? 'text' : 'math');
 const answerChoices = ex.choices ?? currentBankQuestion?.choices ?? [];
 const isMathAnswer = answerType === 'math';
 const linkedLesson = currentBankQuestion?.stage !== 'learn' ? getLesson(matchingBank?.bank ?? {}, currentBankQuestion?.lessonId) : undefined;
 const activePracticeLessonId = practiceLessonId ?? (currentBankQuestion?.stage !== 'learn' && currentBankQuestion?.lessonId && lessonProgressById[currentBankQuestion.lessonId]?.status === 'practising' ? currentBankQuestion.lessonId : null);
 const multipleQuestions = state.doc.exercises.length > 1;
 const batch = multipleQuestions || !!activePracticeLessonId, last = exerciseIndex === state.doc.exercises.length - 1;
 const sessionId = state.doc.session?.id ?? '';
 const practiceEventContext = useMemo(() => contextForQuestion({
  bankVersion: loadedBank?.version ?? 'unknown', session: sessionId || 'unknown', chapter: matchingBank?.bank.chapter?.number,
  lesson: currentBankQuestion?.lessonId, section: currentBankQuestion?.sectionId, concept: currentBankQuestion?.conceptId,
  question: currentBankQuestion,
 }), [currentBankQuestion, loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId]);
 const sessionEventContext = useMemo<LearnEventContext>(() => ({
  bankVersion: loadedBank?.version ?? 'unknown', session: sessionId || 'unknown', chapter: matchingBank?.bank.chapter?.number ?? 0,
  lesson: 'unknown', section: 'unknown', concept: 'unknown',
 }), [loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId]);
 const lessonEventContext = useMemo<LearnEventContext>(() => ({
  bankVersion: loadedBank?.version ?? 'unknown', session: sessionId || 'unknown', chapter: matchingBank?.bank.chapter?.number ?? 0,
  lesson: lessonScreen?.id ?? 'unknown', section: 'unknown', concept: 'unknown',
 }), [lessonScreen?.id, loadedBank?.version, matchingBank?.bank.chapter?.number, sessionId]);
 const activityTrackerRef = useRef<ActivityTracker | null>(null);
 if (!activityTrackerRef.current) activityTrackerRef.current = new ActivityTracker(practiceEventContext);
 const activityTracker = activityTrackerRef.current;
 activityTracker.setBaseContext(practiceEventContext);
 const practiceAttemptCounts = useRef(new Map<string, number>());
 const referenceScopeId = useRef<string | null>(null);
 const reportedDiagnosticAttempts = useRef(new Set<string>());
 useEffect(() => activityTracker.listen(), [activityTracker]);
 useEffect(() => {
  if (!sessionId) return;
  const scopeId = `session:${sessionId}`;
  activityTracker.startScope({ id: scopeId, openType: 'session_start', closeType: 'session_end', context: sessionEventContext });
  return () => activityTracker.stopScope(scopeId);
 }, [activityTracker, sessionId]);
 useEffect(() => { if (manualTimerPause.current) activityTracker.setPaused(true); }, [activityTracker]);
 useEffect(() => {
  if (trackedExerciseId.current === ex.id) return;
  trackedExerciseId.current = ex.id;
  manualTimerPause.current = false;
  activityTracker.setPaused(false);
 }, [activityTracker, ex.id]);
 useEffect(() => {
  if (lessonScreen || referenceLesson) return;
  const question = currentBankQuestion;
  const context = contextForQuestion({
   bankVersion: loadedBank?.version ?? 'unknown', session: sessionId, chapter: matchingBank?.bank.chapter?.number,
   lesson: question?.lessonId, section: question?.sectionId, concept: question?.conceptId, question,
  });
  const scopeId = `question:${ex.id}`;
  const itemType = answerType === 'choice' ? 'mcq' : answerType === 'text' ? 'typed' : 'step_by_step';
  activityTracker.startScope({ id: scopeId, openType: 'question_open', closeType: 'question_close', context, fields: {
   itemId: question?.id ?? ex.id, itemType, questionText: (ex.prompt || ex.source).slice(0, 8_000),
  } });
  return () => activityTracker.stopScope(scopeId);
 }, [activityTracker, answerType, currentBankQuestion, ex.id, ex.prompt, ex.source, lessonScreen, loadedBank?.version, matchingBank?.bank.chapter?.number, referenceLesson, sessionId]);
 usePracticeEditEvents(store, loadedBankRef);
 const wellbeing = useWellbeing({ multipleQuestions, sessionId, session: state.doc.session, storageConflict: state.storageState?.kind === 'conflict' }), askWellbeing = wellbeing.askWellbeing;
 const lessons = loadedBank?.bank.lessons ?? [];
 const readingPosition = useOptionalReadingPositionContext();
 const [restoreTarget, setRestoreTarget] = useState<LessonRestoreTarget | null>(null);
 // The landing-screen offer to resume. Only a position recorded against the
 // loaded bank version is trusted; a stale bank must not send the learner to a
 // lesson that no longer matches the content. Suppressed during a timed
 // diagnostic and during lesson practice, where the learner is mid-flow.
 const resumeCandidate = useMemo(() => {
  const saved = readingPosition?.position;
  if (!loadedBank || !saved?.lessonId || lessonScreen || exam || activePracticeLessonId) return null;
  if (saved.contentVersion !== loadedBank.version) return null;
  const lesson = loadedBank.bank.lessons?.find(item => item.id === saved.lessonId);
  if (!lesson) return null;
  const sections = buildLessonSections(lesson);
  const sectionIndex = saved.sectionId ? sections.findIndex(item => item.id === saved.sectionId) : -1;
  const section = sectionIndex >= 0 ? sections[sectionIndex] : undefined;
  return {
   lesson,
   saved,
   sectionIndex: sectionIndex >= 0 ? sectionIndex : undefined,
   sectionTitle: section?.title || section?.concepts[0]?.concept.title,
   chapterLabel: loadedBank.bank.chapter?.title ?? (loadedBank.bank.chapter?.number != null ? `Chapter ${loadedBank.bank.chapter.number}` : undefined),
   sectionCount: sections.length,
   completedSections: lessonProgressById[lesson.id]?.completedSectionIds?.length ?? 0,
  };
 }, [activePracticeLessonId, exam, lessonProgressById, lessonScreen, loadedBank, readingPosition?.position]);
 const modalOpen = askWellbeing || shortcutsOpen || !!exportWarning || !!resetKind || cloudPreviewOpen || insertOpen || !!decision || complete || lessonPickerOpen || !!referenceLesson || state.storageState?.kind === 'conflict';
 useEffect(() => {
  if (!menu && !modalOpen) return;
  const policyFooter = document.querySelector('body > footer');
  if (!(policyFooter instanceof HTMLElement)) return;
  const focusable = Array.from(policyFooter.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]'));
  const previousTabIndexes = focusable.map(element => ({ element, tabIndex: element.getAttribute('tabindex') }));
  for (const { element } of previousTabIndexes) element.setAttribute('tabindex', '-1');
  return () => {
   for (const { element, tabIndex } of previousTabIndexes) {
    if (tabIndex === null) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', tabIndex);
   }
  };
 }, [menu, modalOpen]);
 useEffect(() => { editorRoot.current?.focus({ preventScroll: true }); setGuidanceOpen(false); }, [ex.id]);
 function switchQuestion(id: string) { dispatch(actions.switchExercise(id)); setShowResults(false); setManual(''); }
 function setTrackedTimerPaused(paused: boolean) { manualTimerPause.current = paused; activityTracker.setPaused(paused); }
 const lastOpenedLessonKey = (bankId: string, version: string) => `math-scratchpad-last-open-lesson-v1:${encodeURIComponent(bankId)}:${encodeURIComponent(version)}`;
 function resumeBankLesson(bank: DriveBank, version: string) {
  // Banks without lessons stay in the Drive panel so their question batch can be opened explicitly.
  if (!bank.lessons?.length) {
    setLessonScreen(null);
    setLessonPickerOpen(false);
    return;
  }
  setDriveBankOpen(false);
  const restored = readLessonProgress(bank, version);
  const active = bank.lessons ?? [];
  let storedId: string | null = null;
  try { storedId = getLearningStorage().getItem(lastOpenedLessonKey(bank.bank_id, version)); } catch { /* optional preference */ }
  const unfinished = active.filter(lesson => {
   const item = restored.progressById[lesson.id];
   return item && item.status !== 'done';
  });
  const recent = unfinished.sort((a, b) => {
   const date = (lesson: Lesson) => {
    const item = restored.progressById[lesson.id];
    return item?.practiceStartedAt ?? item?.learnDoneAt ?? item?.learnStartedAt ?? '';
   };
   return date(b).localeCompare(date(a));
  });
  const target = recent.find(lesson => lesson.id === storedId) ?? recent[0];
  if (target) {
    setLessonPickerOpen(false);
    setLessonScreen(target);
  } else {
    setLessonScreen(null);
    setLessonPickerOpen(true);
  }
 }
 function openLesson(lesson: Lesson) {
  setRestoreTarget(null);
  const before = lessonProgressById[lesson.id];
  if (!before) rememberLessonProgress({ lessonId: lesson.id, status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0, completedSectionIds: [], completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {}, learnStartedAt: new Date().toISOString() });
  if (loadedBank) {
   try { getLearningStorage().setItem(lastOpenedLessonKey(loadedBank.bank.bank_id, loadedBank.version), lesson.id); }
   catch { /* optional preference; core progress still persists */ }
  }
  setLessonPickerOpen(false);
  setLessonScreen(lesson);
 }
 function closeLesson() {
  setRestoreTarget(null);
  setLessonScreen(null);
  requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true }));
 }
 /** Opens the saved lesson/section and asks the lesson screen to scroll to it once. */
 function continueLearning() {
  const candidate = resumeCandidate;
  if (!candidate) return;
  openLesson(candidate.lesson);
  setRestoreTarget({
   sectionId: candidate.saved.sectionId,
   contentAnchorId: candidate.saved.contentAnchorId,
   scrollOffset: candidate.saved.scrollOffset,
  });
 }
 function openReference(lesson: Lesson) {
  const current = store.getState().doc.exercises.find(item => item.id === store.getState().doc.exerciseId);
  const wasRunning = !!current && !current.timerPaused && Number.isFinite(current.timerRunningSince);
  setReferenceWasRunning(wasRunning);
  if (currentBankQuestion && currentBankQuestion.stage !== 'learn') {
   const progress = lessonProgressRef.current;
   updateLessonProgressState({ ...progress, activePanelEvent: { questionId: currentBankQuestion.id, openedAt: isoLocal() } });
  }
  if (wasRunning && current) dispatch(actions.timerPause({ exerciseId: current.id, now: Date.now(), paused: true }));
  const scopeId = `lesson-reference:${lesson.id}`;
  const context = contextForQuestion({ bankVersion: loadedBank?.version ?? 'unknown', session: sessionId || 'unknown', chapter: matchingBank?.bank.chapter?.number, lesson: lesson.id });
  if (referenceScopeId.current) activityTracker.stopScope(referenceScopeId.current);
  referenceScopeId.current = scopeId;
  activityTracker.startScope({ id: scopeId, openType: 'lesson_open', closeType: 'lesson_close', context, fields: { itemId: lesson.id, questionText: lesson.title } });
  emitLearnEvent(context, { type: 'chunk_read', itemId: lesson.id, questionText: lesson.title, note: 'Read-only lesson reference opened.' });
  setReferenceLesson(lesson);
 }
 function closeReference(targetExerciseId?: string) {
  if (referenceScopeId.current) activityTracker.stopScope(referenceScopeId.current);
  referenceScopeId.current = null;
  setReferenceLesson(null);
  const progress = lessonProgressRef.current;
  if (progress.activePanelEvent) {
   const closedAt = isoLocal();
   updateLessonProgressState({ ...progress, activePanelEvent: undefined, lessonPanelEvents: [...progress.lessonPanelEvents, { ...progress.activePanelEvent, closedAt: closedAt < progress.activePanelEvent.openedAt ? progress.activePanelEvent.openedAt : closedAt }] });
  }
  if (referenceWasRunning && !targetExerciseId) {
   const current = store.getState().doc.exercises.find(item => item.id === store.getState().doc.exerciseId);
   if (current?.timerPaused) dispatch(actions.timerPause({ exerciseId: current.id, now: Date.now(), paused: false }));
  }
  setReferenceWasRunning(false);
  if (targetExerciseId) switchQuestion(targetExerciseId);
 }
 function openInteractiveLessonFromReference(sectionId: string) {
  const lesson = referenceLesson;
  if (!lesson) return;
  closeReference();
  const sections = buildLessonSections(lesson);
  const currentSectionIndex = Math.max(0, sections.findIndex(section => section.id === sectionId));
  const progress = lessonProgressRef.current.progressById[lesson.id] ?? freshLessonProgress(lesson.id);
  const section = sections[currentSectionIndex];
  rememberLessonProgress({
   ...progress,
   currentSectionIndex,
   currentConceptIndex: section?.concepts[0]?.conceptIndex ?? progress.currentConceptIndex,
   summaryOpen: false,
  });
  setLessonScreen(lesson);
  setShowResults(false);
 }
 async function startReferencePracticeQuestion(questionId: string) {
  const targetBank = loadedBank;
  const question = targetBank?.bank.questions.find(item => item.id === questionId);
  const lesson = question?.lessonId ? targetBank?.bank.lessons?.find(item => item.id === question.lessonId) : undefined;
  if (!targetBank || !question || !lesson) return;
  const existing = store.getState().doc.exercises.find(item => item.bankQuestionId === questionId);
  if (existing) { closeReference(existing.id); return; }
  try {
   const doc = bankDocument(targetBank.bank, targetBank.version, [question]);
   const before = store.getState();
   closeReference();
   await archiveSession(before);
   dispatch(actions.load({ doc }));
   dispatch(actions.keyboard(initialKeyboardOpen(false)));
   dispatch(actions.notice('Lesson practice started.'));
   const progress = lessonProgressRef.current.progressById[lesson.id] ?? freshLessonProgress(lesson.id);
   rememberLessonProgress({
    ...progress,
    status: 'practising',
    activePracticeSectionId: undefined,
    activePracticeQuestionIds: [question.id],
    summaryOpen: true,
    practiceStartedAt: new Date().toISOString(),
   });
   setPracticeLessonId(lesson.id);
   setPracticeStartError('');
   setLessonScreen(null);
   setShowResults(false);
   setManual('');
   setComplete(false);
  } catch (error) {
   setPracticeStartError(error instanceof Error ? error.message : 'Could not open this practice question. The current session was kept.');
  }
 }
 async function openQuestionFromReference(questionId: string) {
  const existing = store.getState().doc.exercises.find(item => item.bankQuestionId === questionId);
  if (existing) closeReference(existing.id);
  else await startReferencePracticeQuestion(questionId);
 }
 function openDriveBank() { setDriveBankInitialized(true); setDriveBankOpen(true); }
 function loadBankFromLessons() { setLessonPickerOpen(false); openDriveBank(); }
 async function startLessonPractice(lesson: Lesson, progress: LessonProgress, selectedQuestions: BankQuestion[], sectionId?: string) {
  const targetBank = loadedBank;
  if (!targetBank) { setPracticeStartError('The lesson bank is not available for this session. Reconnect to the same bank version and try again.'); return; }
  const questions = selectedQuestions.length ? selectedQuestions : sectionId ? [] : getPracticeQuestions(targetBank.bank, lesson.id);
  if (!questions.length) { setPracticeStartError('No practice questions yet'); return; }
  try {
   const doc = bankDocument(targetBank.bank, targetBank.version, questions);
   await archiveSession(store.getState());
   dispatch(actions.load({ doc }));
   dispatch(actions.keyboard(initialKeyboardOpen(false)));
   dispatch(actions.notice('Lesson practice started.'));
   rememberLessonProgress(progress);
   setPracticeLessonId(lesson.id);
   setPracticeStartError('');
   setLessonScreen(null);
   setShowResults(false); setManual(''); setComplete(false);
  } catch (error) {
   setPracticeStartError(error instanceof Error ? error.message : 'Could not start lesson practice. The current session was kept.');
  }
 }
 function markLessonPracticeDone(): boolean {
  if (!activePracticeLessonId) return false;
  const progress = lessonProgressRef.current.progressById[activePracticeLessonId];
  if (progress?.activePracticeSectionId) {
   const sectionId = progress.activePracticeSectionId;
   rememberLessonProgress({ ...progress, status: 'learning', activePracticeSectionId: undefined, activePracticeQuestionIds: undefined, completedSectionIds: [...new Set([...(progress.completedSectionIds ?? []), sectionId])], summaryOpen: false });
   const lesson = loadedBank?.bank.lessons?.find(item => item.id === activePracticeLessonId);
   if (lesson) setLessonScreen(lesson);
   setPracticeLessonId(null);
   return !!lesson;
  }
  if (progress?.activePracticeQuestionIds?.length && loadedBank) {
   const completedPracticeQuestionIds = [...new Set([...(progress.completedPracticeQuestionIds ?? []), ...progress.activePracticeQuestionIds])];
   const lesson = loadedBank.bank.lessons?.find(item => item.id === activePracticeLessonId);
   const allPracticeQuestions = getPracticeQuestions(loadedBank.bank, activePracticeLessonId);
   const hasRemainingPractice = allPracticeQuestions.some(question => !completedPracticeQuestionIds.includes(question.id));
   const next: LessonProgress = {
    ...progress,
    status: hasRemainingPractice ? 'learning' : 'done',
    completedPracticeQuestionIds,
    activePracticeQuestionIds: undefined,
    activePracticeSectionId: undefined,
    summaryOpen: true,
   };
   rememberLessonProgress(next);
   if (hasRemainingPractice && lesson) {
    setLessonScreen(lesson);
    setPracticeLessonId(null);
    return true;
   }
  } else if (progress) rememberLessonProgress({ ...progress, status: 'done', summaryOpen: true, activePracticeSectionId: undefined, activePracticeQuestionIds: undefined });
  setPracticeLessonId(null);
  return false;
 }
 function focusEditor() {
  const field = mathfieldForStep(store.getState().doc.cursor.stepId);
  if (field) { field.focus(); return; }
  editorRoot.current?.focus({ preventScroll: true });
 }
 function focusCurrentMathControl() {
  requestAnimationFrame(() => {
   const cursor = store.getState().doc.cursor;
   const mathfield = mathfieldForStep(cursor.stepId);
   if (mathfield) { mathfield.focus(); mathfield.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); return; }
   const step = Array.from(document.querySelectorAll<HTMLElement>('[data-step-id]')).find(element => element.dataset.stepId === cursor.stepId);
   if (!step) { focusEditor(); return; }
   let target: HTMLButtonElement | undefined;
   if (cursor.sequenceId) {
    target = Array.from(step.querySelectorAll<HTMLButtonElement>('.math-gap')).find(element => element.dataset.sequenceId === cursor.sequenceId && Number(element.dataset.gapIndex) === cursor.index);
   } else if (cursor.nodeId) {
    target = Array.from(step.querySelectorAll<HTMLButtonElement>('[data-node-id]')).find(element => element.dataset.nodeId === cursor.nodeId);
   }
   if (!target) { focusEditor(); return; }
   target.focus({ preventScroll: true });
   target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
 }
 function openInsert(source?: HTMLElement) { insertInvoker.current = source ?? document.activeElement as HTMLElement; restoreInsert.current = true; setInsertOpen(true); }
 function closeInsert() { restoreInsert.current = true; setInsertOpen(false); }
 function restoreInsertFocus() {
  const invoker = insertInvoker.current;
  const mathfieldInvoker = invoker?.matches('math-field') ? invoker as HTMLElement & { hasFocus?: () => boolean } : null;
  const stepId = mathfieldInvoker?.dataset.stepId;
  const restore = (attempt = 0) => {
   // Prefer the live MathLive instance for this step. State updates caused by
   // inserting a symbol can replace the custom element while Radix is closing.
   const currentMathfield = (stepId ? mathfieldForStep(stepId) : null) as (HTMLElement & { hasFocus?: () => boolean }) | null;
   const target = currentMathfield?.isConnected ? currentMathfield : invoker;
   const isWorkControl = !!target?.isConnected && (target.matches('math-field') || !!target.closest('[data-step-id]'));
   if (target?.isConnected && (restoreInsert.current || isWorkControl)) {
    const active = document.activeElement === target;
    const mathFocus = target.matches('math-field') ? (target as HTMLElement & { hasFocus?: () => boolean }).hasFocus?.() : undefined;
    if (!active || mathFocus === false) target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    // The modal focus scope and MathLive's shadow editor can both settle after
    // the first focus call. Retry briefly if another close-time blur wins.
    if (attempt < 8 && (document.activeElement !== target || (target.matches('math-field') && (target as HTMLElement & { hasFocus?: () => boolean }).hasFocus?.() === false))) {
     requestAnimationFrame(() => restore(attempt + 1));
    }
    return;
   }
   if (attempt < 8) requestAnimationFrame(() => restore(attempt + 1));
   else focusCurrentMathControl();
  };
  // Wait until Radix has removed its focus scope before restoring MathLive.
  requestAnimationFrame(() => requestAnimationFrame(() => restore()));
 }
 function insert(kind: string) {
  const stepId = store.getState().doc.cursor.stepId;
  if (!insertMathSymbol(stepId, kind)) {
   if (['x','y','n','t','infinity','sigma'].includes(kind)) dispatch(actions.command({type:'identifier',value:kind === 'infinity' ? '∞' : kind === 'sigma' ? 'σ' : kind}));
   else if (kind === 'number') dispatch(actions.command({ type: 'insertBlankNumber' }));
   else if (['+','−','×','÷','=','≤','≥','≠','<','>'].includes(kind)) dispatch(actions.command({ type: 'operator', value: kind }));
   else dispatch(actions.command({ type: 'insert', value: kind }));
  }
  dispatch(actions.recentSymbol(kind)); dispatch(actions.closeSymbols());
  restoreInsert.current = false; setInsertOpen(false);
 }
 async function copyReview() {
  if (copyBusy.current) return; copyBusy.current = true; setBusy(true);
  const doc = store.getState().doc, snapshot = fingerprint(doc), id = doc.exerciseId;
  try {
   const text = reviewMessage(doc);
   if (await writeClipboard(text)) { dispatch(actions.copied({ exerciseId: id, snapshot })); setManual(''); }
   else { setManual(text); dispatch(actions.notice('Clipboard blocked. Select the review message and copy it manually.')); }
  } finally { copyBusy.current = false; setBusy(false); }
 }
 async function copySession() {
  const text = serialize(store.getState());
  if (await writeClipboard(text)) dispatch(actions.notice('Full session JSON copied.'));
  else { jsonForm.reset({ json: text }); openInlinePanel('backup'); dispatch(actions.notice('Clipboard blocked. Select and copy the session JSON manually.')); }
 }
 const stamp = () => isoLocal().slice(0, 16).replace(/:/g, '');
 async function exportTutor(force = false) {
  const doc = store.getState().doc, missing = missingFinalAnswers(doc);
  if (!force && missing.length) { setExportWarning(missing); return; }
  setExportWarning(null);
  const meta = doc.session;
  let lessonExport: LessonExportData | undefined;
  if (meta?.bankId && meta.bankVersion) {
   if (loadedBank?.bank.bank_id === meta.bankId && loadedBank.version === meta.bankVersion && loadedBank.bank.lessons?.length) lessonExport = lessonExportDataFromState(lessonProgressRef.current);
   else {
    const saved = readLessonExportData(meta.bankId, meta.bankVersion);
    if (saved.found) lessonExport = saved.data;
   }
  }
  const data = buildTutorExport(doc, new Date(), lessonExport), text = JSON.stringify(data, null, 2);
  emitLearnEvent(sessionEventContext, { type: 'report_generated', itemId: `session:${data.session_id}`, note: 'Tutor export generated.' });
  const copiedOk = await writeClipboard(text), saved = downloadText(`math-session-${data.session_id}.json`, text);
  if (!copiedOk) { jsonForm.reset({ json: text }); openInlinePanel('backup'); }
  dispatch(actions.notice(`Tutor export ready${copiedOk ? ' · copied' : ''}${saved ? ' · downloaded' : ''}.`));
 }
 function downloadBackup() { const saved = downloadText(`math-scratchpad-backup-${stamp()}.json`, serialize(store.getState())); if (saved) emitLearnEvent(sessionEventContext, { type: 'backup_created', itemId: `session:${sessionId || 'unknown'}` }); dispatch(actions.notice(saved ? 'Backup file downloaded.' : 'Download blocked. Use Session JSON to copy the backup.')); }
 async function importFile(file: File | undefined) {
  if (!file) return;
  try { if (file.size > 1000000) throw Error('Backup file is too large.'); const raw = JSON.parse(await file.text()); dispatch(actions.load(migrateChatDiagnosticSession(raw) ?? validateSession(raw))); emitLearnEvent(sessionEventContext, { type: 'backup_restored', itemId: file.name }); setShowResults(false); }
  catch (error) { dispatch(actions.notice(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`)); }
  finally { if (fileInput.current) fileInput.current.value = ''; }
 }
 function confirmReset() {
  const kind = resetKind; setResetKind(null);
  if (kind === 'session') { emitLearnEvent(sessionEventContext, { type: 'session_reset', itemId: sessionId || undefined }); dispatch(actions.resetSession()); setShowResults(false); setManual(''); }
  else if (kind === 'all') { emitLearnEvent(sessionEventContext, { type: 'session_reset', itemId: sessionId || undefined, note: 'All local storage cleared.' }); if (store.clearStorage) store.clearStorage(); else clearAppStorage(); window.location.reload(); }
 }
 function recordPracticeAttempt() {
  if (ex.diagnosticId !== undefined) return; // The diagnostic result event is emitted after the reliable checker runs.
  const steps = ex.steps.filter(step => !stepIsBlank(step)).map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40);
  const answer = (ex.answerText ?? '').slice(0, 8_000);
  if (!answer && !steps.length) return;
  const itemId = currentBankQuestion?.id ?? ex.id;
  const attemptNo = (practiceAttemptCounts.current.get(itemId) ?? 0) + 1;
  practiceAttemptCounts.current.set(itemId, attemptNo);
  emitLearnEvent(practiceEventContext, {
   type: currentBankQuestion?.stage === 'learn' ? 'check_answer' : 'exercise_attempt',
   itemId,
   itemType: answerType === 'choice' ? 'mcq' : answerType === 'text' ? 'typed' : 'step_by_step',
   questionText: (ex.prompt || ex.source).slice(0, 8_000),
   ...(answer ? { userAnswer: answer } : {}),
   ...(steps.length ? { steps } : {}),
   verdict: 'submitted', verdictSource: 'none', attemptNo,
  });
 }
 function commit(action: Decision) {
  recordPracticeAttempt();
  if (action === 'next') { dispatch(actions.adjacentExercise(1)); setManual(''); setShowResults(false); }
  else if (action === 'complete') { if (!markLessonPracticeDone()) setComplete(true); }
  else void copyReview();
 }
 function request(action: Decision) {
  if (ex.skipped || (action === 'copy' && ex.confidence)) { commit(action); return; }
  if (decisionRef.current) return;
  invoker.current = document.activeElement as HTMLElement; decisionRef.current = action; setDecision(action);
 }
 function cancelDecision() { decisionRef.current = null; setDecision(null); }
 function confirmDecision(value: 'low' | 'medium' | 'high') {
  const action = decisionRef.current; if (!action) return;
  decisionRef.current = null; if (action !== 'copy') dispatch(actions.autoFinal()); dispatch(actions.setConfidence(value)); setDecision(null); commit(action);
 }
 function addStep() { dispatch(actions.command({ type: 'newStep' })); focusCurrentMathControl(); }
 function resetStep(id: string) { dispatch(actions.select({ stepId: id, nodeId: leaves(ex.steps.find(s => s.id === id)!.expression)[0].node.id })); dispatch(actions.command({ type: 'clear' })); focusCurrentMathControl(); }
 function deleteStep(id: string) { if (id === ex.steps[0].id) return; dispatch(actions.select({ stepId: id, nodeId: leaves(ex.steps.find(s => s.id === id)!.expression)[0].node.id })); dispatch(actions.command({ type: 'deleteStep' })); focusCurrentMathControl(); }
 function keyboard(event: KeyboardEvent<HTMLElement>) {
  if (chapterTransitioning || bankTransitionRef.current) { event.preventDefault(); event.stopPropagation(); return; }
  const key = event.key, target = event.target as HTMLElement;
  if (event.defaultPrevented || event.nativeEvent.isComposing || modalOpen || setup || backup || confirmExam || confirmFractions) return;
  const mathfieldTarget = target.closest('math-field');
  if (['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || (target.isContentEditable && !mathfieldTarget)) return;
  if (mathfieldTarget) {
   // Learn math checks own a separate editor store and their own shortcuts.
   if (mathfieldTarget.closest('.lesson-math-editor')) return;
   const stepId = mathfieldTarget.getAttribute('data-step-id');
   const step = stepId && store.getState().doc.exercises.flatMap(exercise => exercise.steps).find(item => item.id === stepId);
   const firstCharacter = /^[0-9.]$/.test(key) || /^[a-zA-Z]$/.test(key) || ['+','-','−','*','×','÷','='].includes(key);
   // Route printable math tokens through MathLive's insertion API. Its native
   // first-key placeholder replacement can defer `input` while a React-controlled
   // Step is still blank, causing later keydowns to be split between native and
   // adapter insertion during rapid physical typing.
   if (step && firstCharacter && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const normalized = ({ '-':'−', '*':'×' } as Record<string,string>)[key] ?? key;
    if (insertMathSymbol(step.id, normalized)) { event.preventDefault(); return; }
   }
   if (event.altKey && key === 'Enter') { event.preventDefault(); dispatch(actions.command({ type: 'final' })); }
   else if (event.altKey && ['f','r'].includes(key.toLowerCase())) { event.preventDefault(); insert(key.toLowerCase() === 'f' ? 'fraction' : 'root'); }
   else if (key === '/') { event.preventDefault(); openInsert(); }
   else if (key === 'Enter' && !event.shiftKey) { event.preventDefault(); addStep(); }
   return;
  }
  const inMath = target === editorRoot.current || !!target.closest('.expression'); if (!inMath) return;
  const stepId = store.getState().doc.cursor.stepId;
  if (event.ctrlKey || event.metaKey) {
   if (key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey ? !redoMathfield(stepId) : !undoMathfield(stepId)) dispatch(event.shiftKey ? actions.redo() : actions.undo()); focusEditor(); }
   else if (key.toLowerCase() === 'y') { event.preventDefault(); if (!redoMathfield(stepId)) dispatch(actions.redo()); focusEditor(); }
   else if (key.toLowerCase() === 'a') { event.preventDefault(); executeMathfield(stepId, 'selectAll'); focusEditor(); }
   else if (key.toLowerCase() === 'c') { event.preventDefault(); executeMathfield(stepId, 'copyToClipboard'); focusEditor(); }
   else if (key.toLowerCase() === 'x') { event.preventDefault(); executeMathfield(stepId, 'cutToClipboard'); focusEditor(); }
   else if (key.toLowerCase() === 'v') { event.preventDefault(); executeMathfield(stepId, 'pasteFromClipboard'); focusEditor(); }
   return;
  }
  if (event.altKey && key === 'Enter') { event.preventDefault(); dispatch(actions.command({ type: 'final' })); focusCurrentMathControl(); return; }
  if (event.altKey && ['f','r'].includes(key.toLowerCase())) { event.preventDefault(); insert(key.toLowerCase() === 'f' ? 'fraction' : 'root'); return; }
  if (key === '/') { event.preventDefault(); openInsert(); return; }
  if (key === 'Enter' && !event.shiftKey) { event.preventDefault(); addStep(); return; }
  if (['ArrowLeft','ArrowRight'].includes(key)) { event.preventDefault(); if (!moveMathfield(stepId, key === 'ArrowLeft' ? -1 : 1)) dispatch(actions.horizontal(key === 'ArrowLeft' ? -1 : 1)); focusEditor(); return; }
  if (key === 'Backspace' || key === 'Delete') { event.preventDefault(); if (!executeMathfield(stepId, key === 'Delete' ? 'deleteForward' : 'deleteBackward')) dispatch(actions.command({ type: key === 'Delete' ? 'deleteForward' : 'backspace' })); focusEditor(); return; }
  if (/^[0-9.]$/.test(key) || /^[a-zA-Z]$/.test(key) || ['+','-','−','*','×','÷','='].includes(key)) {
   event.preventDefault(); const normalized = ({ '-':'−', '*':'×' } as Record<string,string>)[key] ?? key;
   if (!insertMathSymbol(stepId, normalized)) dispatch(actions.command({ type: /^[0-9.]$/.test(key) ? 'digit' : /^[a-zA-Z]$/.test(key) ? 'identifier' : 'operator', value: normalized }));
   focusEditor();
  }
 }
 const examGrades = useMemo(() => !showResults || !exam ? [] : questionBank.map(question => {
  const entry = state.doc.exercises.find(x => x.diagnosticId === question.id); return { question, result: !entry || entry.skipped ? null : gradeDiagnostic(entry, question) };
 }), [showResults, exam, questionBank, state.doc]);
 useEffect(() => {
  if (!showResults || !exam || !examGrades.length) return;
  const snapshot = examGrades.map(({ question, result }) => {
   const entry = state.doc.exercises.find(item => item.diagnosticId === question.id);
   return [question.id, result?.numeric ?? 'skipped', entry?.answerText ?? '', entry?.steps.map(step => stepLatex(step)) ?? []];
  });
  const signature = `${sessionId}:${JSON.stringify(snapshot)}`;
  if (reportedDiagnosticAttempts.current.has(signature)) return;
  reportedDiagnosticAttempts.current.add(signature);
  const eventContext: LearnEventContext = { bankVersion: 'diagnostic', session: sessionId || 'unknown', chapter: 0, lesson: 'diagnostic', section: 'diagnostic', concept: 'arithmetic' };
  for (const { question, result } of examGrades) {
   const entry = state.doc.exercises.find(item => item.diagnosticId === question.id);
   if (!entry || entry.skipped || !result) continue;
   const itemId = String(question.id);
   const attemptNo = (practiceAttemptCounts.current.get(itemId) ?? 0) + 1;
   practiceAttemptCounts.current.set(itemId, attemptNo);
   const steps = entry.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40);
   const verdict: LearnEventDraft['verdict'] = result.numeric === 'correct' || result.numeric === 'incorrect' ? result.numeric : 'submitted';
   const verdictSource: LearnEventDraft['verdictSource'] = verdict === 'submitted' ? 'none' : 'checker';
   const event = { itemId, itemType: 'step_by_step' as const, questionText: question.stem.slice(0, 8_000), userAnswer: (entry.answerText || steps.join('\n')).slice(0, 8_000), steps, verdict, verdictSource, attemptNo };
   emitLearnEvent(eventContext, { ...event, type: 'exercise_attempt' });
   if (verdict === 'incorrect') emitLearnEvent(eventContext, { ...event, type: 'mistake_logged', verdict: 'incorrect', verdictSource: 'checker' });
  }
 }, [exam, examGrades, sessionId, showResults, state.doc.exercises]);
 async function copyReport() { const text = examGrades.map(({question,result}) => `Q${question.id} | ${question.stem}\nExpected: ${question.expected}\n${result?.numeric ?? 'skipped'}`).join('\n\n'); if (await writeClipboard(text)) dispatch(actions.notice('Diagnostic report copied.')); else setManual(text); }
 const activeMathfield = mathfieldForStep(state.doc.cursor.stepId);
 const canUndo = !!activeMathfield?.canUndo() || state.past.some(d => d.exerciseId === ex.id);
 const canRedo = !!activeMathfield?.canRedo() || state.future.some(d => d.exerciseId === ex.id);
 const mathTools = <MathTools wide={wide} canUndo={canUndo} canRedo={canRedo} onUndo={() => { if (!undoMathfield(state.doc.cursor.stepId)) dispatch(actions.undo()); focusEditor(); }} onRedo={() => { if (!redoMathfield(state.doc.cursor.stepId)) dispatch(actions.redo()); focusEditor(); }} onInsert={insert} onMore={openInsert} />;
 return <main ref={editorRoot} className="scratchpad" data-layout={layout} inert={modalOpen || menu} aria-busy={chapterTransitioning} aria-label="Math Scratchpad" lang="en" dir="ltr" tabIndex={0} onKeyDownCapture={keyboard}>
  <div className="app-content" hidden={!!lessonScreen} inert={modalOpen}>
  <AppHeader batch={batch} answeredCount={answeredCount} skippedCount={skippedCount} totalQuestions={state.doc.exercises.length} savedAt={state.savedAt} storageState={state.storageState} syncStatus={syncStatus} showKeyboardToggle={isMathAnswer} keyboardOpen={state.keyboardOpen} onToggleKeyboard={() => { const open = !state.keyboardOpen; writeKeyboardChoice(open); dispatch(actions.keyboard(open)); if (open) requestAnimationFrame(focusEditor); }}>
   <ExerciseMenu open={menu} setOpen={setMenu} invokerRef={menuInvoker} skipped={!!ex.skipped} session={state.doc.session} syncPanelOpen={syncPanelOpen} setup={setup} backup={backup} actions={{
    onCheckCopy: () => request('copy'),
    onExportTutor: () => { void exportTutor(); },
    onOpenDriveBank: () => openDriveBank(),
    onNewProblem: () => openInlinePanel('new'),
    onToggleSkip: () => dispatch(actions.setSkipped(!ex.skipped)),
    onLessons: () => setLessonPickerOpen(true),
    onEditScales: wellbeing.editScales,
    onEndSession: () => dispatch(actions.setSessionMeta({ endedAt: isoLocal() })),
    onResetSession: () => setResetKind('session'),
    onShortcuts: () => setShortcutsOpen(true),
    onCloudPreview: () => setCloudPreviewOpen(true),
    onResetAll: () => setResetKind('all'),
    onStartFractions: () => openInlinePanel('fractions'),
    onStartDiagnostic: () => openInlinePanel('diagnostic'),
    onUseExample: () => dispatch(actions.command({ type: 'newExercise', source: example, mode: 'math' })),
    onUseCurrentExpression: () => dispatch(actions.command({ type: 'newProblem' })),
    onCopySession: () => { void copySession(); },
    onDownloadBackup: downloadBackup,
    onImportFile: () => fileInput.current?.click(),
    onImportJson: () => { jsonForm.reset({ json: '' }); openInlinePanel('backup'); },
    onOpenSync: () => setSyncPanelOpen(true),
   }} />
  </AppHeader>

   {driveBankInitialized && <DriveBankPanel open={driveBankOpen} close={() => { setDriveBankOpen(false); requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true })); }} onAvailable={setDriveBankAvailable} onBankReady={bankReady} onBeforeBankLoad={prepareBankTransition} onResumeBank={resumeBankLesson} />}
   {syncPanelOpen && <SyncPanel onClose={() => { setSyncPanelOpen(false); requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true })); }} />}
   <CloudResetPreviewDialog open={cloudPreviewOpen} onOpenChange={setCloudPreviewOpen} runtime={syncRuntime} />
   {lessonPersistenceMessage && <p className="lesson-persistence-warning" role="alert">{lessonPersistenceMessage}</p>}

   <PracticeLauncher launcher={launcher} wide={wide} sessionEventContext={sessionEventContext} onSessionChanged={() => setShowResults(false)} />
   {resumeCandidate && <ContinueLearningButton
    title={<span lang={languageForText(resumeCandidate.lesson.title)} dir={contentDirection(resumeCandidate.lesson.title)}><LessonText text={resumeCandidate.lesson.title} /></span>}
    section={resumeCandidate.sectionTitle}
    meta={[
     resumeCandidate.chapterLabel,
     resumeCandidate.sectionCount > 0 ? (resumeCandidate.sectionIndex !== undefined ? `Section ${resumeCandidate.sectionIndex + 1} of ${resumeCandidate.sectionCount}` : `${resumeCandidate.sectionCount} sections`) : undefined,
     resumeCandidate.completedSections > 0 ? `${resumeCandidate.completedSections} of ${resumeCandidate.sectionCount} sections complete` : undefined,
    ]}
    onResume={continueLearning}
   />}
   <div className="workspace">{layout !== 'phone' && batch && <QuestionNavigator doc={state.doc} onSelect={switchQuestion} />}
    <div className="question-context" role={wide ? 'region' : undefined} aria-label={wide ? 'Question context' : undefined}>
   {batch && <section className="exercise-bar" hidden={layout !== 'phone'} aria-label="Question navigation"><label>Current question<select aria-label="Select question" value={ex.id} onChange={e => switchQuestion(e.target.value)}>{state.doc.exercises.map((entry, i) => <option value={entry.id} key={entry.id}>Question {i + 1} · {questionStatus(entry)}</option>)}</select></label></section>}
   <section className="problem" aria-label="Current problem">{(wide || linkedLesson || fractions) && <div className="question-heading"><h2>Question {exerciseIndex + 1}</h2>{fractions && <span className="topic-badge">Fractions</span>}{linkedLesson && <Button ref={lessonButton} className="lesson-reference-trigger" onClick={() => openReference(linkedLesson)}><BookOpen aria-hidden="true" />Lesson</Button>}</div>}{ex.prompt && <p className="question-statement" lang={languageForText(ex.prompt)} dir={contentDirection(ex.prompt)}><LessonText text={ex.prompt} /></p>}{(ex.mode === 'math' || (ex.source.trim() && ex.source.trim() !== ex.prompt?.trim())) && <QuestionSource source={ex.source} mode={ex.mode} label="Original problem" mathLabel="Original question expression" textClassName="question-source-text" mathClassName="problem-formula" />}{ex.guidance && <details className="question-guidance" open={guidanceOpen} onToggle={e => { const open = e.currentTarget.open; if (open !== guidanceOpen) setGuidanceOpen(open); if (open) dispatch(actions.openGuidance()); }}><summary>Question guidance{ex.guidanceOpenedAt ? <span className="small guidance-used"> · Used</span> : null}</summary><p lang={languageForText(ex.guidance)} dir={contentDirection(ex.guidance)}><LessonText text={ex.guidance} /></p></details>}{linkedLesson && <LessonSourceAttribution book={linkedLesson.book} section={linkedLesson.section} />}</section>
    <QuestionTimer key={ex.id} exerciseId={ex.id} onPauseChange={paused => { manualTimerPause.current = paused; activityTracker.setPaused(paused); }} />
    </div>
    <div className={`editor-layout work-pane ${isMathAnswer && state.keyboardOpen ? 'keyboard-visible' : 'keyboard-hidden'}`} role={wide ? 'region' : undefined} aria-label={wide ? (isMathAnswer ? 'Your work' : 'Your response') : undefined}><div className="notebook-main">
    {wide && isMathAnswer && mathTools}
    {wide && <div className="work-heading"><h2>{isMathAnswer ? 'Your work' : 'Your response'}</h2>{isMathAnswer && <p className="small">Write each step. Review when you're ready.</p>}</div>}

    {isMathAnswer ? <section className="steps" aria-label="Solution steps">{ex.steps.map((step, i) => <article className={`step ${step.id === state.doc.cursor.stepId ? 'current-step' : ''}`} key={step.id} data-step-id={step.id}>
     <header className="step-header"><Button className="step-title" variant="ghost" onClick={() => { dispatch(actions.select({ stepId: step.id })); focusEditor(); }}>Step {i + 1}</Button><span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>{step.status === 'needs-review' ? 'Needs review' : step.edited ? 'Edited' : ''}</span>
      <Button className="final-marker" aria-pressed={step.final} aria-label={`Mark Step ${i + 1} as final`} onClick={() => { dispatch(actions.select({ stepId: step.id })); dispatch(actions.command({ type: 'final' })); focusCurrentMathControl(); }}>Final{step.final ? ' ✓' : ''}</Button>
      <Button size="icon" variant="ghost" aria-label={`Reset Step ${i + 1}`} title={`Reset Step ${i + 1}`} onClick={() => resetStep(step.id)}><RotateCcw aria-hidden="true" /></Button><Button size="icon" variant="ghost" disabled={i === 0} aria-label={`Delete Step ${i + 1}`} title={i === 0 ? 'The first step cannot be deleted' : `Delete Step ${i + 1}`} onClick={() => deleteStep(step.id)}><Trash2 aria-hidden="true" /></Button>
     </header><div className="expression" data-step-id={step.id}><MathLiveStepInput stepId={step.id} value={stepLatex(step)} label={`Step ${i + 1} expression`} onInput={value => dispatch(actions.mathLiveInput({ stepId: step.id, value }))} onFocusStep={() => dispatch(actions.select({ stepId: step.id }))} /></div>
    </article>)}</section> : answerType === 'text' ? <div className="lesson-check-text-answer practice-response">
     <label htmlFor={`practice-answer-${ex.id}`}>Answer</label>
     <textarea id={`practice-answer-${ex.id}`} aria-label="Answer" dir="auto" maxLength={4000} value={ex.answerText ?? ''} onChange={event => dispatch(actions.setAnswerText({ value: event.target.value, answerType: 'text' }))} />
    </div> : <fieldset className="lesson-check-choice practice-response">
     <legend>Choose one option</legend><div className="lesson-choice-options" role="radiogroup" aria-label="Answer choices">
      {answerChoices.map((answerChoice, index) => <label className={ex.answerText === answerChoice ? 'lesson-choice-selected' : ''} key={`${ex.id}-${index}`} dir="ltr">
       <input type="radio" name={`practice-answer-${ex.id}`} value={answerChoice} checked={ex.answerText === answerChoice} onChange={() => dispatch(actions.setAnswerText({ value: answerChoice, answerType: 'choice', choices: answerChoices }))} /><QuestionChoice choice={answerChoice} index={index} />
      </label>)}
     </div>
    </fieldset>}
    {isMathAnswer && <>
     <p className={`small final-status ${ex.steps.some(step => step.final) ? '' : 'missing'}`} role="status">{(() => { const final = ex.steps.findIndex(step => step.final); return final < 0 ? 'No final answer marked yet · press Alt+Enter or “Final” on a step' : `Final answer: Step ${final + 1}`; })()}</p>
     <Button className="add-step" onClick={addStep}><Plus aria-hidden="true" />Add step</Button>
     {!wide && mathTools}
     {state.keyboardOpen && <Keyboard />}
    </>}
    <footer className="review-controls">{wide && <p className="wide-keyboard-hint"><kbd>/</kbd> Open math tools · <kbd>Ctrl / Cmd + Z</kbd> Undo · <kbd>Tab</kbd> Move focus</p>}{!batch && <Button variant="default" className="review-button" disabled={busy} onClick={() => request('copy')}>{busy ? 'Copying…' : 'Check · Copy for Review'}</Button>}

     <p className={`copy-state ${copied === 'Changed since copy' ? 'changed' : ''}`}>{copied}</p><p className="small" role="status" aria-live="polite">{state.notice}</p>
     {batch && <nav className="question-navigation" aria-label="Question navigation"><Button disabled={exerciseIndex === 0} onClick={() => { dispatch(actions.adjacentExercise(-1)); setManual(''); }}>← Previous</Button><Button onClick={() => request(last ? 'complete' : 'next')}>{last ? 'Finish session' : 'Next question →'}</Button></nav>}
     {wide && batch && !ex.skipped && <p className="confidence-hint">Confidence required before continuing.</p>}

     {state.storageState?.kind === 'error' && <p role="alert">{state.storageState.message}</p>}
    </footer>
    {manual && <section className="manual-copy"><label htmlFor="review-text">Review message · select all to copy</label><textarea id="review-text" ref={manualRef} readOnly value={manual} onFocus={e => e.currentTarget.select()} /><div className="toolbar"><Button onClick={() => { manualRef.current?.focus(); manualRef.current?.select(); }}>Select All</Button><Button onClick={() => setManual('')}>Close</Button></div></section>}
    {showResults && exam && <section className="diagnostic-report" aria-label="Diagnostic report"><h2>Diagnostic Review</h2><p><strong>{examGrades.filter(x => x.result?.numeric === 'correct').length}/{questionBank.length}</strong> numerically correct</p><div className="report-grid">{examGrades.map(({question,result}) => <div key={question.id}><strong>Q{question.id}</strong> · {result?.numeric ?? 'skipped'}{result && <span> / Form: {result.form} / Steps: {result.steps}</span>}</div>)}</div><Button onClick={copyReport}>Copy Full Diagnostic Report</Button><p className="small">Estimated skill performance only. Unsupported expressions remain unverified.</p></section>}
   </div></div>
   </div>
  </div>
  {lessonScreen && <div className="learn-workspace"><LessonScreen key={`${lessonScreen.id}:${lessonRemoteRevision}`} bank={loadedBank?.bank ?? null} lesson={loadedBank?.bank.lessons?.find(lesson => lesson.id === lessonScreen.id) ?? null} initialProgress={lessonProgressById[lessonScreen.id]} restore={restoreTarget ?? undefined} onBack={closeLesson} onProgress={rememberLessonProgress} onStartPractice={(lesson, progress, questions, sectionId) => startLessonPractice(lesson, progress, questions, sectionId)} practiceError={practiceStartError} progressMessage={lessonPersistenceMessage} activityTracker={activityTracker} eventContext={lessonEventContext} /></div>}
  <LessonPicker open={lessonPickerOpen} lessons={lessons} progressByLesson={lessonProgressById} hasBank={!!matchingBank} onLoadBank={loadBankFromLessons} onOpenChange={setLessonPickerOpen} onChoose={openLesson} onCloseAutoFocus={event => { event.preventDefault(); if (!lessonScreen) menuInvoker.current?.focus({ preventScroll: true }); }} />
  {matchingBank && <LessonReferenceDialog lesson={referenceLesson} bank={matchingBank.bank} question={currentBankQuestion} onSelectPracticeQuestion={openQuestionFromReference} onOpenInteractiveLesson={openInteractiveLessonFromReference} onOpenChange={open => { if (!open) closeReference(); }} onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => lessonButton.current?.focus({ preventScroll: true })); }} />}
  <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Import backup file" onChange={e => { void importFile(e.target.files?.[0]); }} />
  <DialogsHost
   menuInvokerRef={menuInvoker}
   focusEditor={focusEditor}
   session={state.doc.session}
   shortcuts={{ open: shortcutsOpen, setOpen: setShortcutsOpen }}
   exportWarning={{ questions: exportWarning, dismiss: () => setExportWarning(null), exportAnyway: () => { void exportTutor(true); } }}
   reset={{ kind: resetKind, cancel: () => setResetKind(null), downloadBackup, confirm: confirmReset }}
   wellbeing={wellbeing}
   confidence={{ open: !!decision, initial: ex.confidence, invoker: invoker.current, onCancel: cancelDecision, onConfirm: confirmDecision }}
   completion={{ open: complete, totalQuestions: state.doc.exercises.length, answeredQuestions: answeredCount, skippedQuestions: skippedCount, draftQuestions: state.doc.exercises.filter(question => questionStatus(question) === "Draft").length, onClose: () => setComplete(false), onReview: () => { setComplete(false); void copyReview(); }, onCopy: () => { setComplete(false); void copySession(); }, onAnalyze: () => { setComplete(false); setShowResults(true); } }}
   insert={{
    open: insertOpen,
    onOpenChange: value => { if (!value) { if (restoreInsert.current) closeInsert(); else setInsertOpen(false); } else setInsertOpen(true); },
    wide,
    onInsert: insert,
    onCloseAutoFocus: event => { event.preventDefault(); if (insertInvoker.current?.isConnected) insertInvoker.current.focus({ preventScroll: true }); restoreInsertFocus(); },
   }}
   storageConflict={state.storageState?.kind === 'conflict'}
  />
  {chapterTransitioning && <div role="status" aria-live="polite" dir="rtl" className="chapter-transition-overlay" >
   <div><strong >در حال آرشیو امن فصل قبلی</strong><p>تا تأیید کامل Google Drive و Notion صفحه را نبند.</p></div>
  </div>}
 </main>;
}
