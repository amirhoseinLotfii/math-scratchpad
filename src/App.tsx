import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MoreVertical, RotateCcw, Trash2, Plus, Copy, Keyboard as KeyboardIcon, ChevronDown, ClipboardCheck, FileJson2, HardDrive, Download, Upload, HelpCircle, SkipForward, BookOpen, NotebookPen } from 'lucide-react';
import { useAppDispatch, useAppSelector, useAppStore } from './hooks';
import { actions, activeInfo, exerciseOf } from './store';
import { ascii, example, leaves, latex, symbolList } from './model';
import { parse } from './parser';
import { fingerprint, reviewMessage, writeClipboard } from './review';
import { serialize, validateSession } from './persistence';
import { diagnosticQuestions } from './diagnostic';
import { fractionRoundOne } from './fractionRoundOne';
import { gradeDiagnostic } from './assessment';
import { migrateChatDiagnosticSession } from './legacyDiagnostic';
import { Formula } from './Formula';
import { MathDisplay } from './MathDisplay';
import { Keyboard } from './Keyboard';
import { QuestionTimer } from './QuestionTimer';
import { Button } from './shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './shared/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from './shared/ui/dropdown-menu';
import { ConfidenceDialog } from './features/session/components/confidence-dialog';
import { CompletionDialog } from './features/session/components/completion-dialog';
import { problemSchema, jsonInputSchema } from './features/session/schemas/session-schema';

import { useWorkspaceLayout } from './shared/hooks/use-workspace-layout';
import { QuestionNavigator } from './features/workspace/components/question-navigator';
import { MathTools } from './features/workspace/components/math-tools';
import { questionStatus } from './features/workspace/model/workspace-layout';
import { ShortcutHelp } from './features/workspace/components/shortcut-help';
import { SessionScales } from './features/session/components/session-panel';
import { buildTutorExport, downloadText, missingFinalAnswers } from './features/session/export/tutor-export';
import { clearAppStorage } from './features/session/persistence/persistent-store';
import { isoLocal } from './model';
import { DriveBankPanel } from './features/drive-bank/drive-bank-panel';
import { archiveSession, bankDocument, type DriveBank } from './features/drive-bank/drive-bank';
import { getConfig as getDriveConfig } from './features/drive-bank/google';
import { getLesson, getPracticeQuestions } from './features/lessons/selectors';
import type { Lesson, LessonProgress } from './features/lessons/types';
import { LessonScreen } from './features/lessons/lesson-screen';
import { LessonPicker } from './features/lessons/lesson-picker';
import { LessonReferenceDialog } from './features/lessons/lesson-reference-dialog';
import { contentDirection, languageForText, LessonText } from './features/lessons/lesson-content';
import { emptyLessonProgressState, lessonExportDataFromState, readLessonExportData, readLessonProgress, saveLessonProgress, type LessonExportData, type LessonProgressState } from './features/lessons/lesson-progress-store';
import { initialKeyboardOpen, wellbeingAsked, markWellbeingAsked, writeKeyboardChoice } from './shared/lib/ui-prefs';

const INSERT_OPTIONS = [
 { name: 'Fraction', kind: 'fraction' }, { name: 'Number', kind: 'number' },
 { name: '√ Root', kind: 'root' }, { name: 'Power', kind: 'power' },
 { name: 'Parentheses', kind: 'group' }, { name: '+', kind: '+' },
 { name: '−', kind: '−' }, { name: '×', kind: '×' }, { name: '÷', kind: '÷' }, { name: '=', kind: '=' },
];
type Decision = 'next' | 'complete' | 'copy';
/** Number of insert tools shown before “Show more”. */
export const INSERT_VISIBLE = 8;
/** `initialBank` is used by isolated browser previews/tests; normal app startup loads through DriveBankPanel. */
export function App({ initialBank }: { initialBank?: { bank: DriveBank; version: string } } = {}) {
 const layout = useWorkspaceLayout(), wide = layout !== 'phone';
 const insertOptions = useMemo(() => wide ? [...INSERT_OPTIONS, ...symbolList.filter(item => !INSERT_OPTIONS.some(base => base.kind === item.key)).map(item => ({name:item.title,kind:item.key}))] : INSERT_OPTIONS, [wide]);
 const [shortcutsOpen, setShortcutsOpen] = useState(false), [insertExpanded, setInsertExpanded] = useState(false);
 const [guidanceOpen, setGuidanceOpen] = useState(false);
 const [wellbeingDismissed, setWellbeingDismissed] = useState<string | null>(null);
 const [exportWarning, setExportWarning] = useState<number[] | null>(null), [resetKind, setResetKind] = useState<'session' | 'all' | null>(null);
 const fileInput = useRef<HTMLInputElement>(null);
 const menuInvoker = useRef<HTMLButtonElement>(null);
 const state = useAppSelector(s => s), store = useAppStore(), dispatch = useAppDispatch();
 const ex = exerciseOf(state.doc), exerciseIndex = state.doc.exercises.findIndex(x => x.id === ex.id);
 const batch = state.doc.exercises.length > 1, last = exerciseIndex === state.doc.exercises.length - 1;
 const [setup, setSetup] = useState(false), [backup, setBackup] = useState(false), [menu, setMenu] = useState(false), [menuMore, setMenuMore] = useState(false), [sessionDetailsOpen, setSessionDetailsOpen] = useState(false);
 const [driveBankOpen, setDriveBankOpen] = useState(false);
 const [driveBankInitialized, setDriveBankInitialized] = useState(() => !!getDriveConfig().fileId);
 const [, setDriveBankAvailable] = useState(false);
 const [loadedBank, setLoadedBank] = useState<{ bank: DriveBank; version: string } | null>(initialBank ?? null);
 const loadedBankRef = useRef(loadedBank); loadedBankRef.current = loadedBank;
 const [lessonPickerOpen, setLessonPickerOpen] = useState(false), [lessonScreen, setLessonScreen] = useState<Lesson | null>(null);
 const [referenceLesson, setReferenceLesson] = useState<Lesson | null>(null), [referenceWasRunning, setReferenceWasRunning] = useState(false);
 const [lessonProgressState, setLessonProgressState] = useState<LessonProgressState>(() => initialBank ? readLessonProgress(initialBank.bank, initialBank.version) : emptyLessonProgressState('', ''));
 const lessonProgressRef = useRef(lessonProgressState); lessonProgressRef.current = lessonProgressState;
 const [lessonPersistenceMessage, setLessonPersistenceMessage] = useState(lessonProgressState.warning);
 const lessonProgressById = lessonProgressState.progressById;
 const [practiceLessonId, setPracticeLessonId] = useState<string | null>(null), [practiceStartError, setPracticeStartError] = useState('');
 const lessonButton = useRef<HTMLButtonElement>(null);
 const [confirmExam, setConfirmExam] = useState(false), [confirmFractions, setConfirmFractions] = useState(false);
 const [insertOpen, setInsertOpen] = useState(false), [choice, setChoice] = useState(0);
 const [decision, setDecision] = useState<Decision | null>(null), [complete, setComplete] = useState(false);
 const [manual, setManual] = useState(''), [busy, setBusy] = useState(false), [showResults, setShowResults] = useState(false);
 const visibleInsert = insertExpanded ? insertOptions : insertOptions.slice(0, INSERT_VISIBLE);
 const editorRoot = useRef<HTMLElement>(null), manualRef = useRef<HTMLTextAreaElement>(null);
 const invoker = useRef<HTMLElement | null>(null), insertInvoker = useRef<HTMLElement | null>(null), restoreInsert = useRef(true);
 const dialogRefs = useRef<(HTMLButtonElement | null)[]>([]), decisionRef = useRef<Decision | null>(null), copyBusy = useRef(false);
 const problemForm = useForm({ resolver: zodResolver(problemSchema), defaultValues: { source: '', mode: 'math' as 'math' | 'text' } });
 const jsonForm = useForm({ resolver: zodResolver(jsonInputSchema), defaultValues: { json: '' } });
 const mode = problemForm.watch('mode');
 const fractions = ex.assessment === 'fractions-round-1', questionBank = fractions ? fractionRoundOne : diagnosticQuestions;
 const exam = !!ex.diagnosticId && state.doc.exercises.some(x => x.diagnosticId === questionBank.length);
 const answeredCount = state.doc.exercises.filter(x => questionStatus(x) === 'Answered').length, skippedCount = state.doc.exercises.filter(x => x.skipped).length;
 const sessionId = state.doc.session?.id ?? '';
 const needWellbeing = batch && !!sessionId && state.doc.session?.anxiety === undefined && state.doc.session?.energy === undefined && wellbeingDismissed !== sessionId && !wellbeingAsked(sessionId) && state.storageState?.kind !== 'conflict';
 const [askingFor, setAskingFor] = useState<string | null>(null), [editingScales, setEditingScales] = useState(false), askWellbeing = !!askingFor && askingFor === sessionId && wellbeingDismissed !== sessionId;
 useEffect(() => { if (needWellbeing) { setEditingScales(false); setAskingFor(sessionId); } }, [needWellbeing, sessionId]);
 const currentIndex = ex.steps.findIndex(x => x.id === state.doc.cursor.stepId), selected = activeInfo(state.doc);
 const selectionLabel = state.doc.cursor.sequenceId ? `Step ${currentIndex + 1} · Main-line insertion` : selected ? `Step ${currentIndex + 1}${selected.path}${state.doc.cursor.selected ? ' · Whole structure' : ' · Caret ' + state.doc.cursor.offset}` : '';
 const copied = !state.copies[ex.id] ? '' : state.copies[ex.id] === fingerprint(state.doc) ? 'Copied' : 'Changed since copy';
 const matchingBank = loadedBank && state.doc.session?.bankId === loadedBank.bank.bank_id && state.doc.session?.bankVersion === loadedBank.version ? loadedBank : null;
 const currentBankQuestion = matchingBank && ex.bankQuestionId ? matchingBank.bank.questions.find(question => question.id === ex.bankQuestionId) : undefined;
 const answerType = ex.answerType ?? currentBankQuestion?.answerType ?? (currentBankQuestion?.mode === 'text' ? 'text' : 'math');
 const answerChoices = ex.choices ?? currentBankQuestion?.choices ?? [];
 const isMathAnswer = answerType === 'math';
 const linkedLesson = currentBankQuestion?.stage !== 'learn' ? getLesson(matchingBank?.bank ?? {}, currentBankQuestion?.lessonId) : undefined;
 const activePracticeLessonId = practiceLessonId ?? (currentBankQuestion?.stage !== 'learn' && currentBankQuestion?.lessonId && lessonProgressById[currentBankQuestion.lessonId]?.status === 'practising' ? currentBankQuestion.lessonId : null);
 const lessons = loadedBank?.bank.lessons ?? [];
 const modalOpen = askWellbeing || shortcutsOpen || !!exportWarning || !!resetKind || insertOpen || !!decision || complete || lessonPickerOpen || !!referenceLesson || state.storageState?.kind === 'conflict';
 useEffect(() => { editorRoot.current?.focus({ preventScroll: true }); setGuidanceOpen(false); }, [ex.id]);
 useEffect(() => { setChoice(0); }, [wide]);
 useEffect(() => { if (insertOpen) { const button = dialogRefs.current[choice]; button?.focus({ preventScroll: true }); button?.scrollIntoView?.({block:'nearest'}); } }, [insertOpen, choice]);
 function switchQuestion(id: string) { dispatch(actions.switchExercise(id)); setShowResults(false); setManual(''); }
 function bankReady(bank: DriveBank | null, version: string) {
  if (!bank) {
   setLoadedBank(null);
   const empty = emptyLessonProgressState('', ''); lessonProgressRef.current = empty; setLessonProgressState(empty); setLessonPersistenceMessage('');
   return;
  }
  const current = loadedBank;
  if (current?.bank.bank_id === bank.bank_id && current.version === version) { setLoadedBank({ bank, version }); return; }
  const restored = readLessonProgress(bank, version);
  setLoadedBank({ bank, version }); lessonProgressRef.current = restored; setLessonProgressState(restored); setLessonPersistenceMessage(restored.warning);
 }
 const updateLessonProgressState = useCallback((next: LessonProgressState) => {
  lessonProgressRef.current = next; setLessonProgressState(next);
  const activeBank = loadedBankRef.current;
  if (!activeBank || activeBank.bank.bank_id !== next.bankId || activeBank.version !== next.bankVersion) return;
  const result = saveLessonProgress(activeBank.bank, activeBank.version, next);
  setLessonPersistenceMessage(result.saved ? (next.persistenceBlocked ? next.warning : '') : result.message);
 }, []);
 const rememberLessonProgress = useCallback((progress: LessonProgress) => {
  const current = lessonProgressRef.current;
  updateLessonProgressState({ ...current, progressById: { ...current.progressById, [progress.lessonId]: progress } });
 }, [updateLessonProgressState]);
 function openLesson(lesson: Lesson) {
  const before = lessonProgressById[lesson.id];
  if (!before) rememberLessonProgress({ lessonId: lesson.id, status: 'learning', currentConceptIndex: 0, completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {}, learnStartedAt: new Date().toISOString() });
  setLessonPickerOpen(false);
  setLessonScreen(lesson);
 }
 function closeLesson() {
  setLessonScreen(null);
  requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true }));
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
  setReferenceLesson(lesson);
 }
 function closeReference() {
  setReferenceLesson(null);
  const progress = lessonProgressRef.current;
  if (progress.activePanelEvent) {
   const closedAt = isoLocal();
   updateLessonProgressState({ ...progress, activePanelEvent: undefined, lessonPanelEvents: [...progress.lessonPanelEvents, { ...progress.activePanelEvent, closedAt: closedAt < progress.activePanelEvent.openedAt ? progress.activePanelEvent.openedAt : closedAt }] });
  }
  if (referenceWasRunning) {
   const current = store.getState().doc.exercises.find(item => item.id === store.getState().doc.exerciseId);
   if (current?.timerPaused) dispatch(actions.timerPause({ exerciseId: current.id, now: Date.now(), paused: false }));
  }
  setReferenceWasRunning(false);
 }
 function openDriveBank() { setDriveBankInitialized(true); setDriveBankOpen(true); }
 function loadBankFromLessons() { setLessonPickerOpen(false); openDriveBank(); }
 function startLessonPractice(lesson: Lesson, progress: LessonProgress) {
  const targetBank = loadedBank;
  if (!targetBank) { setPracticeStartError('The lesson bank is not available for this session. Reconnect to the same bank version and try again.'); return; }
  const questions = getPracticeQuestions(targetBank.bank, lesson.id);
  if (!questions.length) { setPracticeStartError('No practice questions yet'); return; }
  try {
   const doc = bankDocument(targetBank.bank, targetBank.version, questions);
   archiveSession(store.getState());
   dispatch(actions.load({ doc }));
   dispatch(actions.keyboard(initialKeyboardOpen(true)));
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
 function markLessonPracticeDone() {
  if (!activePracticeLessonId) return;
  const progress = lessonProgressRef.current.progressById[activePracticeLessonId];
  if (progress) rememberLessonProgress({ ...progress, status: 'done', summaryOpen: true });
  setPracticeLessonId(null);
 }
 function focusEditor() { editorRoot.current?.focus({ preventScroll: true }); }
 function openInsert() { insertInvoker.current = document.activeElement as HTMLElement; restoreInsert.current = true; setChoice(0); setInsertExpanded(false); setInsertOpen(true); }
 function closeInsert() { restoreInsert.current = true; setInsertOpen(false); }
 function insert(kind: string) {
  if (['x','y','n','t','infinity','sigma'].includes(kind)) dispatch(actions.command({type:'identifier',value:kind === 'infinity' ? '∞' : kind === 'sigma' ? 'σ' : kind}));
  else if (kind === 'number') dispatch(actions.command({ type: 'insertBlankNumber' }));
  else if (['+','−','×','÷','=','≤','≥','≠','<','>'].includes(kind)) dispatch(actions.command({ type: 'operator', value: kind }));
  else dispatch(actions.command({ type: 'insert', value: kind }));
  restoreInsert.current = false; setInsertOpen(false); focusEditor();
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
  else { jsonForm.reset({ json: text }); setBackup(true); dispatch(actions.notice('Clipboard blocked. Select and copy the session JSON manually.')); }
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
  const copiedOk = await writeClipboard(text), saved = downloadText(`math-session-${data.session_id}.json`, text);
  if (!copiedOk) { jsonForm.reset({ json: text }); setBackup(true); }
  dispatch(actions.notice(`Tutor export ready${copiedOk ? ' · copied' : ''}${saved ? ' · downloaded' : ''}.`));
 }
 function downloadBackup() { dispatch(actions.notice(downloadText(`math-scratchpad-backup-${stamp()}.json`, serialize(store.getState())) ? 'Backup file downloaded.' : 'Download blocked. Use Session JSON to copy the backup.')); }
 async function importFile(file: File | undefined) {
  if (!file) return;
  try { if (file.size > 1000000) throw Error('Backup file is too large.'); const raw = JSON.parse(await file.text()); dispatch(actions.load(migrateChatDiagnosticSession(raw) ?? validateSession(raw))); setShowResults(false); }
  catch (error) { dispatch(actions.notice(`Import failed: ${error instanceof Error ? error.message : 'invalid file'}`)); }
  finally { if (fileInput.current) fileInput.current.value = ''; }
 }
 function confirmReset() {
  const kind = resetKind; setResetKind(null);
  if (kind === 'session') { dispatch(actions.resetSession()); setShowResults(false); setManual(''); }
  else if (kind === 'all') { if (store.clearStorage) store.clearStorage(); else clearAppStorage(); window.location.reload(); }
 }
 function commit(action: Decision) {
  if (action === 'next') { dispatch(actions.adjacentExercise(1)); setManual(''); setShowResults(false); }
  else if (action === 'complete') { markLessonPracticeDone(); setComplete(true); }
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
 function addStep() {
  dispatch(actions.command({ type: 'newStep' })); focusEditor();
  requestAnimationFrame(() => document.querySelector(`[data-step-id="${store.getState().doc.cursor.stepId}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' }));
 }
 function resetStep(id: string) { dispatch(actions.select({ stepId: id, nodeId: leaves(ex.steps.find(s => s.id === id)!.expression)[0].node.id })); dispatch(actions.command({ type: 'clear' })); focusEditor(); }
 function deleteStep(id: string) { if (id === ex.steps[0].id) return; dispatch(actions.select({ stepId: id, nodeId: leaves(ex.steps.find(s => s.id === id)!.expression)[0].node.id })); dispatch(actions.command({ type: 'deleteStep' })); focusEditor(); }
 const start = problemForm.handleSubmit(value => {
  try {
   if (value.mode === 'math') parse(value.source);
   dispatch(actions.command({ type: 'newExercise', source: value.mode === 'math' ? ascii(value.source) : value.source, mode: value.mode }));
   setSetup(false); problemForm.reset(); setShowResults(false);
  } catch (error) { problemForm.setError('source', { message: error instanceof Error ? error.message : 'Invalid problem.' }, { shouldFocus: true }); }
 });
 const loadBackup = jsonForm.handleSubmit(value => {
  try { const raw = JSON.parse(value.json); dispatch(actions.load(migrateChatDiagnosticSession(raw) ?? validateSession(raw))); setBackup(false); setShowResults(false); }
  catch (error) { jsonForm.setError('json', { message: error instanceof Error ? error.message : 'Invalid session JSON.' }, { shouldFocus: true }); }
 });
 function keyboard(event: KeyboardEvent<HTMLElement>) {
  const key = event.key, target = event.target as HTMLElement;
  if (event.defaultPrevented || event.nativeEvent.isComposing || modalOpen || setup || backup || confirmExam || confirmFractions) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || target.isContentEditable) return;
  const inMath = target === editorRoot.current || !!target.closest('.expression'); if (!inMath) return;
  if (event.ctrlKey || event.metaKey) {
   if (key.toLowerCase() === 'z') { event.preventDefault(); dispatch(event.shiftKey ? actions.redo() : actions.undo()); }
   else if (key.toLowerCase() === 'y') { event.preventDefault(); dispatch(actions.redo()); } return;
  }
  if (event.altKey && key === 'Enter') { event.preventDefault(); dispatch(actions.command({ type: 'final' })); return; }
  if (event.altKey) { if (key.toLowerCase() === 'f' || key.toLowerCase() === 'r') { event.preventDefault(); insert(key.toLowerCase() === 'f' ? 'fraction' : 'root'); } return; }
  if (/^[0-9.]$/.test(key)) { event.preventDefault(); dispatch(actions.command({ type: 'digit', value: key })); }
  else if (/^[a-zA-Z]$/.test(key)) { event.preventDefault(); dispatch(actions.command({ type: 'identifier', value: key })); }
  else if (key === '/') { event.preventDefault(); openInsert(); }
  else if (['+','-','−','*','×','÷','='].includes(key)) { event.preventDefault(); dispatch(actions.command({ type: 'operator', value: ({ '-':'−','*':'×' } as Record<string,string>)[key] ?? key })); }
  else if (key === '(') { event.preventDefault(); insert('group'); }
  else if (key === 'ArrowLeft' || key === 'ArrowRight') { event.preventDefault(); dispatch(actions.horizontal(key === 'ArrowLeft' ? -1 : 1)); }
  else if (key === 'ArrowUp' || key === 'ArrowDown') { event.preventDefault(); dispatch(actions.vertical(key === 'ArrowUp' ? -1 : 1)); }
  else if (key === 'Backspace' || key === 'Delete') { event.preventDefault(); dispatch(actions.command({ type: key === 'Delete' ? 'deleteForward' : 'backspace' })); }
  else if (key === 'Home' || key === 'End') { event.preventDefault(); const item = activeInfo(store.getState().doc); if (item?.node.type === 'number') dispatch(actions.select({ stepId: state.doc.cursor.stepId, nodeId: item.node.id, offset: key === 'Home' ? 0 : item.node.value.length })); }
  else if (key === 'Enter' && !event.shiftKey) { event.preventDefault(); addStep(); }
 }
 function dialogKeys(event: KeyboardEvent<HTMLDivElement>) {
  event.stopPropagation(); const size = visibleInsert.length;
  if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); const delta = ({ArrowRight:1,ArrowLeft:-1,ArrowDown:3,ArrowUp:-3} as Record<string,number>)[event.key]; setChoice(c => (c + delta + size) % size); }
  else if ((event.key === 'Home' || event.key === 'End') && (event.target as HTMLElement).hasAttribute('data-insert-kind')) { event.preventDefault(); setChoice(event.key === 'Home' ? 0 : size - 1); }
  else if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).hasAttribute('data-insert-kind')) { event.preventDefault(); insert((event.target as HTMLElement).getAttribute('data-insert-kind')!); }
  else if (event.key === 'Tab') {
   event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')); const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
   buttons[(at + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
  }
 }
 const examGrades = useMemo(() => !showResults || !exam ? [] : questionBank.map(question => {
  const entry = state.doc.exercises.find(x => x.diagnosticId === question.id); return { question, result: !entry || entry.skipped ? null : gradeDiagnostic(entry, question) };
 }), [showResults, exam, questionBank, state.doc]);
 async function copyReport() { const text = examGrades.map(({question,result}) => `Q${question.id} | ${question.stem}\nExpected: ${question.expected}\n${result?.numeric ?? 'skipped'}`).join('\n\n'); if (await writeClipboard(text)) dispatch(actions.notice('Diagnostic report copied.')); else setManual(text); }
 const mathTools = <MathTools wide={wide} canUndo={state.past.some(d => d.exerciseId === ex.id)} canRedo={state.future.some(d => d.exerciseId === ex.id)} onUndo={() => { dispatch(actions.undo()); focusEditor(); }} onRedo={() => { dispatch(actions.redo()); focusEditor(); }} onInsert={insert} onMore={openInsert} />;
 return <main ref={editorRoot} className="scratchpad" data-layout={layout} inert={modalOpen || menu} aria-label="Math Scratchpad" lang="en" dir="ltr" tabIndex={0} onKeyDown={keyboard}>
  <div className="app-content" hidden={!!lessonScreen} inert={modalOpen}>
   <header className="app-header"><div className="brand"><h1>Math Scratchpad</h1></div>
    {batch && <p className="header-progress small" role="status" aria-live="polite" aria-label={`${answeredCount} of ${state.doc.exercises.length} practice questions answered${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`}><span className="header-progress-copy">{answeredCount} of {state.doc.exercises.length} practice questions answered{skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}</span><span className="header-progress-track" role="progressbar" aria-label="Practice questions answered" aria-valuemin={0} aria-valuemax={state.doc.exercises.length} aria-valuenow={answeredCount}><span style={{ width: `${answeredCount / state.doc.exercises.length * 100}%` }} /></span></p>}<div className="header-actions"><span className="local-draft-label save-indicator" role="status" aria-live="polite" title={state.savedAt ? `Saved locally at ${state.savedAt}` : undefined}>{state.storageState ? state.storageState.kind === 'error' ? 'Storage unavailable' : 'Draft conflict' : state.savedAt ? 'Saved ✓' : 'Local draft'}</span>
     {isMathAnswer && <Button className="keyboard-toggle" aria-label={state.keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'} aria-expanded={state.keyboardOpen} onClick={() => { writeKeyboardChoice(!state.keyboardOpen); dispatch(actions.keyboard(!state.keyboardOpen)); }}><KeyboardIcon aria-hidden="true" /><span>{state.keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'}</span></Button>}
     <DropdownMenu open={menu} onOpenChange={value => { setMenu(value); if (!value) { setMenuMore(false); setSessionDetailsOpen(false); } }}><DropdownMenuTrigger asChild><Button ref={menuInvoker} aria-label="Exercise menu" size="icon" onPointerDown={event => event.preventDefault()} onClick={() => setMenu(value => !value)}><MoreVertical aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent aria-label="Notebook actions" className="notebook-menu">
      <DropdownMenuItem className="menu-primary-action" onSelect={() => request('copy')}><ClipboardCheck aria-hidden="true" />Check · Copy for Review</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { void exportTutor(); }}><FileJson2 aria-hidden="true" />Export for tutor (JSON)</DropdownMenuItem>
      <DropdownMenuItem onSelect={openDriveBank}><HardDrive aria-hidden="true" />Google Drive · Question bank</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setSetup(true)}><NotebookPen aria-hidden="true" />New Problem</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => dispatch(actions.setSkipped(!ex.skipped))}>{ex.skipped ? <RotateCcw aria-hidden="true" /> : <SkipForward aria-hidden="true" />}{ex.skipped ? 'Unskip question' : 'Skip question'}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setLessonPickerOpen(true)}><BookOpen aria-hidden="true" />Lessons</DropdownMenuItem>
      <DropdownMenuItem className="menu-disclosure" aria-expanded={menuMore} aria-controls={menuMore ? 'more-notebook-actions' : undefined} onSelect={event => { event.preventDefault(); setMenuMore(value => !value); }}><span>Show more</span><ChevronDown className={menuMore ? 'menu-chevron menu-chevron-open' : 'menu-chevron'} aria-hidden="true" /></DropdownMenuItem>
      {menuMore && <div id="more-notebook-actions" className="menu-more-content">
       <DropdownMenuLabel className="menu-section-heading">Session</DropdownMenuLabel>
       <DropdownMenuItem className="menu-disclosure" aria-expanded={sessionDetailsOpen} aria-controls={sessionDetailsOpen ? 'session-details-info' : undefined} onSelect={event => { event.preventDefault(); setSessionDetailsOpen(value => !value); }}><BookOpen aria-hidden="true" /><span>Session details</span><ChevronDown className={sessionDetailsOpen ? 'menu-chevron menu-chevron-open' : 'menu-chevron'} aria-hidden="true" /></DropdownMenuItem>
       {sessionDetailsOpen && <div id="session-details-info" role="group" aria-label="Session details" className="session-details-panel">
        <p className="menu-info-value"><span>Session ID</span><span dir="ltr">{state.doc.session?.id ?? '—'}</span></p>
        <p className="menu-info-value"><span>Math anxiety</span><span>{state.doc.session?.anxiety ?? 'Not set'}</span></p>
        <p className="menu-info-value"><span>Energy</span><span>{state.doc.session?.energy ?? 'Not set'}</span></p>
        <DropdownMenuItem onSelect={() => { setEditingScales(true); setWellbeingDismissed(null); setAskingFor(sessionId); }}>Change</DropdownMenuItem>
       </div>}
       <DropdownMenuItem onSelect={() => dispatch(actions.setSessionMeta({ endedAt: isoLocal() }))}>End session (record end time)</DropdownMenuItem>
       <DropdownMenuItem className="menu-danger" onSelect={() => setResetKind('session')}><RotateCcw aria-hidden="true" />Reset current session</DropdownMenuItem>

       <DropdownMenuLabel className="menu-section-heading">Practice</DropdownMenuLabel>
       <DropdownMenuItem onSelect={() => setConfirmFractions(true)}>Start Round 1 · 20 fraction questions</DropdownMenuItem>
       <DropdownMenuItem onSelect={() => setConfirmExam(true)}>Start 30-question diagnostic</DropdownMenuItem>
       <DropdownMenuItem onSelect={() => dispatch(actions.command({ type: 'newExercise', source: example, mode: 'math' }))}>Use example</DropdownMenuItem>
       <DropdownMenuItem onSelect={() => dispatch(actions.command({ type: 'newProblem' }))}>Use current expression as new problem</DropdownMenuItem>

       <DropdownMenuLabel className="menu-section-heading">Data</DropdownMenuLabel>
       <DropdownMenuItem onSelect={() => { void copySession(); }}><Copy aria-hidden="true" /><span>Copy full session JSON<span className="small menu-description">All questions, answers, steps &amp; session data</span></span></DropdownMenuItem>
       <DropdownMenuItem onSelect={downloadBackup}><Download aria-hidden="true" />Download backup file</DropdownMenuItem>
       <DropdownMenuItem onSelect={() => fileInput.current?.click()}><Upload aria-hidden="true" />Import backup file</DropdownMenuItem>
       <DropdownMenuItem onSelect={() => { jsonForm.reset({ json: '' }); setBackup(true); }}>Import session JSON</DropdownMenuItem>

       <DropdownMenuLabel className="menu-section-heading">Help</DropdownMenuLabel>
       <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}><HelpCircle aria-hidden="true" />Keyboard shortcuts</DropdownMenuItem>

       <DropdownMenuLabel className="menu-section-heading danger-heading">Danger zone</DropdownMenuLabel>
       <DropdownMenuItem className="menu-danger" onSelect={() => setResetKind('all')}><Trash2 aria-hidden="true" />Reset all local storage</DropdownMenuItem>
      </div>}
     </DropdownMenuContent></DropdownMenu>
    </div></header>

   {driveBankInitialized && <DriveBankPanel open={driveBankOpen} close={() => { setDriveBankOpen(false); requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true })); }} onAvailable={setDriveBankAvailable} onBankReady={bankReady} />}
   {lessonPersistenceMessage && <p className="lesson-persistence-warning" role="alert">{lessonPersistenceMessage}</p>}

   {(confirmExam || confirmFractions) && <section className="setup-panel" aria-label={confirmFractions ? 'Confirm fraction round start' : 'Confirm diagnostic start'}><h2>Start {confirmFractions ? 'Round 1 · 20 fraction questions' : 'diagnostic'}?</h2><p>Export Session JSON first to keep your current work.</p><div className="toolbar"><Button variant="default" onClick={() => { dispatch(confirmFractions ? actions.startFractionRound() : actions.startDiagnostic()); if (!wide) dispatch(actions.keyboard(true)); setConfirmExam(false); setConfirmFractions(false); setShowResults(false); }}>{confirmFractions ? 'Start 20 Questions' : 'Start 30 Questions'}</Button><Button onClick={() => { setConfirmExam(false); setConfirmFractions(false); }}>Cancel</Button></div></section>}
   {setup && <section className="setup-panel" aria-label="New exercise"><h2>New exercise</h2><form onSubmit={start} noValidate>
    <label htmlFor="problem-format">Problem format</label><select id="problem-format" {...problemForm.register('mode')}><option value="math">Math / LaTeX</option><option value="text">Persian text</option></select>
    <label htmlFor="problem-input">Problem</label><textarea id="problem-input" {...problemForm.register('source')} maxLength={4000} dir={mode === 'text' ? 'auto' : 'ltr'} aria-invalid={!!problemForm.formState.errors.source} aria-describedby={problemForm.formState.errors.source ? 'problem-error' : undefined} placeholder={mode === 'math' ? example : 'Describe the question'} />
    {problemForm.formState.errors.source && <p id="problem-error" role="alert">{problemForm.formState.errors.source.message}</p>}
    <div className="toolbar"><Button type="submit" variant="default">Start</Button><Button onClick={() => setSetup(false)}>Cancel</Button></div></form></section>}
   {backup && <section className="setup-panel" aria-label="Session backup"><h2>Session backup</h2><form onSubmit={loadBackup} noValidate><label htmlFor="session-json">Copy or paste session JSON</label><textarea id="session-json" {...jsonForm.register('json')} spellCheck={false} aria-invalid={!!jsonForm.formState.errors.json} aria-describedby={jsonForm.formState.errors.json ? 'json-error' : undefined} /><div className="toolbar"><Button onClick={async () => dispatch(actions.notice(await writeClipboard(jsonForm.getValues('json')) ? 'Session copied.' : 'Select the text and copy manually.'))}>Copy Session</Button><Button type="submit">Restore</Button><Button onClick={() => setBackup(false)}>Close</Button></div>{jsonForm.formState.errors.json && <p id="json-error" role="alert">{jsonForm.formState.errors.json.message}</p>}</form></section>}
   <div className="workspace">{layout !== 'phone' && batch && <QuestionNavigator doc={state.doc} onSelect={switchQuestion} />}
    <div className="question-context" role={wide ? 'region' : undefined} aria-label={wide ? 'Question context' : undefined}>
   {batch && <section className="exercise-bar" hidden={layout !== 'phone'} aria-label="Question navigation"><label>Current question<select aria-label="Select question" value={ex.id} onChange={e => switchQuestion(e.target.value)}>{state.doc.exercises.map((entry, i) => <option value={entry.id} key={entry.id}>Question {i + 1} · {questionStatus(entry)}</option>)}</select></label></section>}
    <section className="problem" aria-label="Current problem">{(wide || linkedLesson || fractions) && <div className="question-heading"><h2>Question {exerciseIndex + 1}</h2>{fractions && <span className="topic-badge">Fractions</span>}{linkedLesson && <Button ref={lessonButton} className="lesson-reference-trigger" onClick={() => openReference(linkedLesson)}><BookOpen aria-hidden="true" />Lesson</Button>}</div>}{ex.prompt && <p className="question-statement" lang={languageForText(ex.prompt)} dir={contentDirection(ex.prompt)}><LessonText text={ex.prompt} /></p>}{ex.mode === 'math' ? <div className="problem-formula" aria-label="Original problem" dir="ltr"><MathDisplay latex={ex.source} label="Original question expression" /></div> : !ex.prompt && <p className="question-statement" lang={languageForText(ex.source)} dir={contentDirection(ex.source)}><LessonText text={ex.source} /></p>}{ex.guidance && <details className="question-guidance" open={guidanceOpen} onToggle={e => { const open = e.currentTarget.open; if (open !== guidanceOpen) setGuidanceOpen(open); if (open) dispatch(actions.openGuidance()); }}><summary>Question guidance{ex.guidanceOpenedAt ? <span className="small guidance-used"> · Used</span> : null}</summary><p lang={languageForText(ex.guidance)} dir={contentDirection(ex.guidance)}><LessonText text={ex.guidance} /></p></details>}</section>
    <QuestionTimer key={ex.id} exerciseId={ex.id} />
    </div>
    <div className={`editor-layout work-pane ${isMathAnswer && state.keyboardOpen ? 'keyboard-visible' : 'keyboard-hidden'}`} role={wide ? 'region' : undefined} aria-label={wide ? (isMathAnswer ? 'Your work' : 'Your response') : undefined}><div className="notebook-main">
    {wide && isMathAnswer && mathTools}
    {wide && <div className="work-heading"><h2>{isMathAnswer ? 'Your work' : 'Your response'}</h2>{isMathAnswer && <p className="small">Write each step. Review when you're ready.</p>}</div>}

    {isMathAnswer ? <section className="steps" aria-label="Solution steps">{ex.steps.map((step, i) => <article className={`step ${step.id === state.doc.cursor.stepId ? 'current-step' : ''}`} key={step.id} data-step-id={step.id}>
     <header className="step-header"><Button className="step-title" variant="ghost" onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); focusEditor(); }}>Step {i + 1}</Button><span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>{step.status === 'needs-review' ? 'Needs review' : step.edited ? 'Edited' : ''}</span>
      <Button className="final-marker" aria-pressed={step.final} aria-label={`Mark Step ${i + 1} as final`} onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); dispatch(actions.command({ type: 'final' })); }}>Final{step.final ? ' ✓' : ''}</Button>
      <Button size="icon" variant="ghost" aria-label={`Reset Step ${i + 1}`} title={`Reset Step ${i + 1}`} onClick={() => resetStep(step.id)}><RotateCcw aria-hidden="true" /></Button><Button size="icon" variant="ghost" disabled={i === 0} aria-label={`Delete Step ${i + 1}`} title={i === 0 ? 'The first step cannot be deleted' : `Delete Step ${i + 1}`} onClick={() => deleteStep(step.id)}><Trash2 aria-hidden="true" /></Button>
     </header><div className="expression" aria-label={`Step ${i + 1} expression`}><Formula sequence={step.expression} stepId={step.id} path={`Step ${i + 1}`} top /></div>
     {step.id === state.doc.cursor.stepId && <p className="selection small"><span className="selection-dot" aria-hidden="true" />{selectionLabel}</p>}
    </article>)}</section> : answerType === 'text' ? <div className="lesson-check-text-answer practice-response">
     <label htmlFor={`practice-answer-${ex.id}`}>Answer</label>
     <textarea id={`practice-answer-${ex.id}`} aria-label="Answer" dir="auto" maxLength={4000} value={ex.answerText ?? ''} onChange={event => dispatch(actions.setAnswerText({ value: event.target.value, answerType: 'text' }))} />
    </div> : <fieldset className="lesson-check-choice practice-response">
     <legend>Choose one option</legend><div className="lesson-choice-options" role="radiogroup" aria-label="Answer choices">
      {answerChoices.map((answerChoice, index) => <label className={ex.answerText === answerChoice ? 'lesson-choice-selected' : ''} key={`${ex.id}-${index}`} dir="ltr">
       <input type="radio" name={`practice-answer-${ex.id}`} value={answerChoice} checked={ex.answerText === answerChoice} onChange={() => dispatch(actions.setAnswerText({ value: answerChoice, answerType: 'choice', choices: answerChoices }))} /><span>{answerChoice}</span>
      </label>)}
     </div>
    </fieldset>}
    {isMathAnswer && <>
     <p className={`small final-status ${ex.steps.some(step => step.final) ? '' : 'missing'}`} role="status">{(() => { const final = ex.steps.findIndex(step => step.final); return final < 0 ? 'No final answer marked yet · press Alt+Enter or “Final” on a step' : `Final answer: Step ${final + 1}`; })()}</p>
     <Button className="add-step" onClick={addStep}><Plus aria-hidden="true" />Add step</Button>
     {!wide && mathTools}
     {state.keyboardOpen && <Keyboard />}
    </>}
    <footer className="review-controls">{wide && <p className="wide-keyboard-hint"><kbd>/</kbd> Insert symbols · <kbd>Ctrl / Cmd + Z</kbd> Undo · <kbd>Tab</kbd> Move focus</p>}{!batch && <Button variant="default" className="review-button" disabled={busy} onClick={() => request('copy')}>{busy ? 'Copying…' : 'Check · Copy for Review'}</Button>}
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
  {lessonScreen && <div className="learn-workspace"><LessonScreen bank={loadedBank?.bank ?? null} lesson={loadedBank?.bank.lessons?.find(lesson => lesson.id === lessonScreen.id) ?? null} initialProgress={lessonProgressById[lessonScreen.id]} onBack={closeLesson} onProgress={rememberLessonProgress} onStartPractice={(lesson, progress) => startLessonPractice(lesson, progress)} practiceError={practiceStartError} progressMessage={lessonPersistenceMessage} /></div>}
  <LessonPicker open={lessonPickerOpen} lessons={lessons} progressByLesson={lessonProgressById} hasBank={!!matchingBank} onLoadBank={loadBankFromLessons} onOpenChange={setLessonPickerOpen} onChoose={openLesson} onCloseAutoFocus={event => { event.preventDefault(); if (!lessonScreen) menuInvoker.current?.focus({ preventScroll: true }); }} />
  {matchingBank && <LessonReferenceDialog lesson={referenceLesson} bank={matchingBank.bank} onOpenChange={open => { if (!open) closeReference(); }} onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => lessonButton.current?.focus({ preventScroll: true })); }} />}
  <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); menuInvoker.current?.focus({preventScroll:true}); }}><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Use your physical keyboard in the math editor. Tab moves between controls; arrow keys edit within numbers and fields.</DialogDescription><ShortcutHelp /><Button onClick={() => setShortcutsOpen(false)}>Close</Button></DialogContent></Dialog>
  <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Import backup file" onChange={e => { void importFile(e.target.files?.[0]); }} />
  <Dialog open={!!exportWarning} onOpenChange={value => { if (!value) setExportWarning(null); }}><DialogContent><DialogTitle>Final answer missing</DialogTitle><DialogDescription>These questions have work but no marked final answer: {exportWarning?.map(n => `Q${n}`).join(', ')}. Mark a final step so your tutor can verify the result.</DialogDescription><div className="dialog-actions"><Button variant="default" onClick={() => setExportWarning(null)}>Go back and mark</Button><Button onClick={() => { void exportTutor(true); }}>Export anyway</Button></div></DialogContent></Dialog>
  <Dialog open={!!resetKind} onOpenChange={value => { if (!value) setResetKind(null); }}><DialogContent><DialogTitle>{resetKind === 'all' ? 'Reset all local storage?' : 'Reset current session?'}</DialogTitle><DialogDescription>{resetKind === 'all' ? 'This deletes every saved draft, preference and session of this app in this browser. Download a backup first.' : 'This clears all questions and answers of the current session and starts a new one. Download a backup first.'}</DialogDescription><div className="dialog-actions"><Button onClick={() => setResetKind(null)}>Cancel</Button><Button onClick={downloadBackup}>Download backup</Button><Button variant="default" onClick={confirmReset}>{resetKind === 'all' ? 'Delete everything' : 'Reset session'}</Button></div></DialogContent></Dialog>
  <Dialog open={askWellbeing} onOpenChange={value => { if (!value) { markWellbeingAsked(sessionId); setWellbeingDismissed(sessionId); setEditingScales(false); } }}><DialogContent className="wellbeing-dialog" aria-describedby="wellbeing-desc" onCloseAutoFocus={event => { if (editingScales && menuInvoker.current) { event.preventDefault(); menuInvoker.current.focus({preventScroll:true}); } }}><DialogTitle>{editingScales ? 'Change session ratings' : 'Before you start this batch'}</DialogTitle><DialogDescription id="wellbeing-desc">Optional. You can change this later.</DialogDescription>
   <SessionScales meta={state.doc.session} onMeta={value => dispatch(actions.setSessionMeta(value))} />
   <div className="dialog-actions"><Button onClick={() => { markWellbeingAsked(sessionId); setWellbeingDismissed(sessionId); }}>Skip for now</Button><Button variant="default" onClick={() => { markWellbeingAsked(sessionId); setWellbeingDismissed(sessionId); }}>Start</Button></div></DialogContent></Dialog>
  <ConfidenceDialog open={!!decision} initial={ex.confidence} onCancel={cancelDecision} onConfirm={confirmDecision} invoker={invoker.current} />
  <CompletionDialog open={complete} onClose={() => setComplete(false)} onReview={() => { setComplete(false); void copyReview(); }} onCopy={() => { setComplete(false); void copySession(); }} onAnalyze={() => { setComplete(false); setShowResults(true); }} />
  <Dialog open={insertOpen} onOpenChange={value => { if (!value) closeInsert(); }}><DialogContent className="insert-dialog" onKeyDown={dialogKeys} onCloseAutoFocus={event => { event.preventDefault(); if (restoreInsert.current && insertInvoker.current?.isConnected) insertInvoker.current.focus({ preventScroll: true }); else focusEditor(); }}>
   <DialogTitle>Insert Math Element</DialogTitle><DialogDescription>/ opens · Arrows choose · Enter inserts · Tab moves focus · Escape closes</DialogDescription><div className="insert-options" id="insert-options">{visibleInsert.map((option, i) => <Button key={option.kind} data-insert-kind={option.kind} onFocus={() => setChoice(i)} ref={el => { dialogRefs.current[i] = el; }} aria-pressed={choice === i} onClick={() => insert(option.kind)}>{option.name}</Button>)}</div>{insertOptions.length > INSERT_VISIBLE && <Button className="insert-more" aria-expanded={insertExpanded} aria-controls="insert-options" onClick={() => { setInsertExpanded(!insertExpanded); if (insertExpanded && choice >= INSERT_VISIBLE) setChoice(0); }}>{insertExpanded ? 'Show fewer' : `Show more (${insertOptions.length - INSERT_VISIBLE})`}</Button>}<Button onClick={closeInsert}>Cancel · Esc</Button>
  </DialogContent></Dialog>
  <Dialog open={state.storageState?.kind === 'conflict'}><DialogContent onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}><DialogTitle>Draft conflict</DialogTitle><DialogDescription>Another tab saved a newer draft. Keep your unsaved work or use the saved draft.</DialogDescription><div className="dialog-actions"><Button onClick={() => store.resolveConflict?.('local')}>Keep this tab</Button><Button onClick={() => store.resolveConflict?.('remote')}>Use saved draft</Button></div></DialogContent></Dialog>
 </main>;
}
