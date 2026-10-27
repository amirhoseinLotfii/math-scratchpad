import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MoreVertical, RotateCcw, Trash2, Plus, Copy, Pause, Play } from 'lucide-react';
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
import { Keyboard } from './Keyboard';
import { QuestionTimer } from './QuestionTimer';
import { Button } from './shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './shared/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './shared/ui/dropdown-menu';
import { ConfidenceDialog } from './features/session/components/confidence-dialog';
import { CompletionDialog } from './features/session/components/completion-dialog';
import { problemSchema, jsonInputSchema } from './features/session/schemas/session-schema';

import { useWorkspaceLayout } from './shared/hooks/use-workspace-layout';
import { QuestionNavigator } from './features/workspace/components/question-navigator';
import { MathTools } from './features/workspace/components/math-tools';
import { questionStatus } from './features/workspace/model/workspace-layout';
import { ShortcutHelp } from './features/workspace/components/shortcut-help';
import { SessionPanel } from './features/session/components/session-panel';
import { buildTutorExport, downloadText, missingFinalAnswers } from './features/session/export/tutor-export';
import { clearAppStorage } from './features/session/persistence/persistent-store';
import { isoLocal } from './model';
import { DriveBankPanel } from './features/drive-bank/drive-bank-panel';
import { getConfig as getDriveConfig } from './features/drive-bank/google';

const INSERT_OPTIONS = [
 { name: 'Fraction', kind: 'fraction' }, { name: 'Number', kind: 'number' },
 { name: '√ Root', kind: 'root' }, { name: 'Power', kind: 'power' },
 { name: 'Parentheses', kind: 'group' }, { name: '+', kind: '+' },
 { name: '−', kind: '−' }, { name: '×', kind: '×' }, { name: '÷', kind: '÷' }, { name: '=', kind: '=' },
];
type Decision = 'next' | 'complete' | 'copy';
export function App() {
 const layout = useWorkspaceLayout(), wide = layout !== 'phone';
 const insertOptions = useMemo(() => wide ? [...INSERT_OPTIONS, ...symbolList.filter(item => !INSERT_OPTIONS.some(base => base.kind === item.key)).map(item => ({name:item.title,kind:item.key}))] : INSERT_OPTIONS, [wide]);
 const [shortcutsOpen, setShortcutsOpen] = useState(false);
 const [exportWarning, setExportWarning] = useState<number[] | null>(null), [resetKind, setResetKind] = useState<'session' | 'all' | null>(null);
 const fileInput = useRef<HTMLInputElement>(null);
 const helpInvoker = useRef<HTMLButtonElement>(null);
 const state = useAppSelector(s => s), store = useAppStore(), dispatch = useAppDispatch();
 const ex = exerciseOf(state.doc), exerciseIndex = state.doc.exercises.findIndex(x => x.id === ex.id);
 const batch = state.doc.exercises.length > 1, last = exerciseIndex === state.doc.exercises.length - 1;
 const [setup, setSetup] = useState(false), [backup, setBackup] = useState(false), [menu, setMenu] = useState(false);
 const [driveBankOpen, setDriveBankOpen] = useState(false);
 const [driveBankInitialized, setDriveBankInitialized] = useState(() => !!getDriveConfig().fileId);
 const [driveBankAvailable, setDriveBankAvailable] = useState(false);
 const [confirmExam, setConfirmExam] = useState(false), [confirmFractions, setConfirmFractions] = useState(false);
 const [insertOpen, setInsertOpen] = useState(false), [choice, setChoice] = useState(0);
 const [decision, setDecision] = useState<Decision | null>(null), [complete, setComplete] = useState(false);
 const [manual, setManual] = useState(''), [busy, setBusy] = useState(false), [showResults, setShowResults] = useState(false);
 const editorRoot = useRef<HTMLElement>(null), manualRef = useRef<HTMLTextAreaElement>(null);
 const invoker = useRef<HTMLElement | null>(null), insertInvoker = useRef<HTMLElement | null>(null), restoreInsert = useRef(true);
 const dialogRefs = useRef<(HTMLButtonElement | null)[]>([]), decisionRef = useRef<Decision | null>(null), copyBusy = useRef(false);
 const problemForm = useForm({ resolver: zodResolver(problemSchema), defaultValues: { source: '', mode: 'math' as 'math' | 'text' } });
 const jsonForm = useForm({ resolver: zodResolver(jsonInputSchema), defaultValues: { json: '' } });
 const mode = problemForm.watch('mode');
 const fractions = ex.assessment === 'fractions-round-1', questionBank = fractions ? fractionRoundOne : diagnosticQuestions;
 const exam = !!ex.diagnosticId && state.doc.exercises.some(x => x.diagnosticId === questionBank.length);
 const completed = state.doc.exercises.filter(x => wide ? ['Answered','Skipped'].includes(questionStatus(x)) : x.skipped || x.steps.some(s => latex(s.expression) !== '\\square')).length;
 const currentIndex = ex.steps.findIndex(x => x.id === state.doc.cursor.stepId), selected = activeInfo(state.doc);
 const selectionLabel = state.doc.cursor.sequenceId ? `Step ${currentIndex + 1} · Main-line insertion` : selected ? `Step ${currentIndex + 1}${selected.path}${state.doc.cursor.selected ? ' · Whole structure' : ' · Caret ' + state.doc.cursor.offset}` : '';
 const copied = !state.copies[ex.id] ? '' : state.copies[ex.id] === fingerprint(state.doc) ? 'Copied' : 'Changed since copy';
 const problemExpression = useMemo(() => { if (ex.mode !== 'math') return null; try { return parse(ex.source); } catch { return null; } }, [ex.mode, ex.source]);
 const modalOpen = shortcutsOpen || !!exportWarning || !!resetKind || insertOpen || !!decision || complete || state.storageState?.kind === 'conflict';
 useEffect(() => { editorRoot.current?.focus({ preventScroll: true }); }, [ex.id]);
 useEffect(() => { setChoice(0); }, [wide]);
 useEffect(() => { if (insertOpen) { const button = dialogRefs.current[choice]; button?.focus({ preventScroll: true }); button?.scrollIntoView?.({block:'nearest'}); } }, [insertOpen, choice]);
 function switchQuestion(id: string) { dispatch(actions.switchExercise(id)); setShowResults(false); setManual(''); }
 function focusEditor() { editorRoot.current?.focus({ preventScroll: true }); }
 function openInsert() { insertInvoker.current = document.activeElement as HTMLElement; restoreInsert.current = true; setChoice(0); setInsertOpen(true); }
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
  const data = buildTutorExport(doc), text = JSON.stringify(data, null, 2);
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
  else if (action === 'complete') setComplete(true);
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
  decisionRef.current = null; dispatch(actions.setConfidence(value)); setDecision(null); commit(action);
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
  else if (key === 'Enter' && state.doc.cursor.sequenceId) { event.preventDefault(); openInsert(); }
 }
 function dialogKeys(event: KeyboardEvent<HTMLDivElement>) {
  event.stopPropagation(); const size = insertOptions.length;
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
  <div className="app-content" inert={modalOpen}>
   <header className="app-header"><div><p className="eyebrow">YOUR MATH NOTEBOOK</p><h1>Math Scratchpad</h1><p className="small subtitle">Write. Think. Take the next step.</p></div>
    <div className="header-actions"><span className="local-draft-label save-indicator" role="status" aria-live="polite" title={state.savedAt ? `Saved locally at ${state.savedAt}` : undefined}>{state.storageState ? state.storageState.kind === 'error' ? 'Storage unavailable' : 'Draft conflict' : state.savedAt ? 'Saved ✓' : 'Local draft'}</span>{driveBankAvailable && <Button onClick={() => setDriveBankOpen(true)}>New Drive questions</Button>}{wide && <><Button ref={helpInvoker} onClick={() => setShortcutsOpen(true)}>Keyboard shortcuts</Button></>}<Button className="desktop-action" onClick={() => setSetup(true)}>New Problem</Button><Button className="desktop-action" onClick={() => { jsonForm.reset({ json: serialize(store.getState()) }); setBackup(true); }}>Session JSON</Button>
     <Button className="keyboard-toggle" aria-expanded={state.keyboardOpen} onClick={() => dispatch(actions.keyboard(!state.keyboardOpen))}>{state.keyboardOpen ? '⌨ Hide Keyboard' : '⌨ Show Keyboard'}</Button>
     <DropdownMenu open={menu} onOpenChange={setMenu}><DropdownMenuTrigger asChild><Button aria-label="Exercise menu" size="icon" onPointerDown={event => event.preventDefault()} onClick={() => setMenu(value => !value)}><MoreVertical aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent aria-label="Notebook actions">
      {batch && <DropdownMenuItem onSelect={() => request('copy')}>Check · Copy for Review</DropdownMenuItem>}
      <DropdownMenuItem onSelect={() => { void copySession(); }}><Copy aria-hidden="true" /><span>Copy full session JSON<span className="small menu-description">All questions, answers, steps &amp; session data</span></span></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { void exportTutor(); }}>Export for tutor (JSON)</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { setDriveBankInitialized(true); setDriveBankOpen(true); }}>Google Drive · بانک سؤال</DropdownMenuItem>
      <DropdownMenuItem onSelect={downloadBackup}>Download backup file</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => fileInput.current?.click()}>Import backup file</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => dispatch(actions.setSessionMeta({ endedAt: isoLocal() }))}>End session (record end time)</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setResetKind('session')}>Reset current session</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setResetKind('all')}>Reset all local storage</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setSetup(true)}>New Problem</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { jsonForm.reset({ json: '' }); setBackup(true); }}>Import session JSON</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setConfirmFractions(true)}>Start Round 1 · 20 fraction questions</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setConfirmExam(true)}>Start 30-question diagnostic</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => dispatch(actions.command({ type: 'newExercise', source: example, mode: 'math' }))}>Use example</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => dispatch(actions.command({ type: 'newProblem' }))}>Use current expression as new problem</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => dispatch(actions.setSkipped(!ex.skipped))}>{ex.skipped ? 'Unskip question' : 'Skip question'}</DropdownMenuItem>
     </DropdownMenuContent></DropdownMenu>
    </div></header>

   {driveBankInitialized && <DriveBankPanel open={driveBankOpen} close={() => setDriveBankOpen(false)} onAvailable={setDriveBankAvailable} />}

   {(confirmExam || confirmFractions) && <section className="setup-panel" aria-label={confirmFractions ? 'Confirm fraction round start' : 'Confirm diagnostic start'}><h2>Start {confirmFractions ? 'Round 1 · 20 fraction questions' : 'diagnostic'}?</h2><p>Export Session JSON first to keep your current work.</p><div className="toolbar"><Button variant="default" onClick={() => { dispatch(confirmFractions ? actions.startFractionRound() : actions.startDiagnostic()); if (!wide) dispatch(actions.keyboard(true)); setConfirmExam(false); setConfirmFractions(false); setShowResults(false); }}>{confirmFractions ? 'Start 20 Questions' : 'Start 30 Questions'}</Button><Button onClick={() => { setConfirmExam(false); setConfirmFractions(false); }}>Cancel</Button></div></section>}
   {setup && <section className="setup-panel" aria-label="New exercise"><h2>New exercise</h2><form onSubmit={start} noValidate>
    <label htmlFor="problem-format">Problem format</label><select id="problem-format" {...problemForm.register('mode')}><option value="math">Math / LaTeX</option><option value="text">Persian text</option></select>
    <label htmlFor="problem-input">Problem</label><textarea id="problem-input" {...problemForm.register('source')} maxLength={4000} dir={mode === 'text' ? 'rtl' : 'ltr'} aria-invalid={!!problemForm.formState.errors.source} aria-describedby={problemForm.formState.errors.source ? 'problem-error' : undefined} placeholder={mode === 'math' ? example : 'Describe the question'} />
    {problemForm.formState.errors.source && <p id="problem-error" role="alert">{problemForm.formState.errors.source.message}</p>}
    <div className="toolbar"><Button type="submit" variant="default">Start</Button><Button onClick={() => setSetup(false)}>Cancel</Button></div></form></section>}
   {backup && <section className="setup-panel" aria-label="Session backup"><h2>Session backup</h2><form onSubmit={loadBackup} noValidate><label htmlFor="session-json">Copy or paste session JSON</label><textarea id="session-json" {...jsonForm.register('json')} spellCheck={false} aria-invalid={!!jsonForm.formState.errors.json} aria-describedby={jsonForm.formState.errors.json ? 'json-error' : undefined} /><div className="toolbar"><Button onClick={async () => dispatch(actions.notice(await writeClipboard(jsonForm.getValues('json')) ? 'Session copied.' : 'Select the text and copy manually.'))}>Copy Session</Button><Button type="submit">Restore</Button><Button onClick={() => setBackup(false)}>Close</Button></div>{jsonForm.formState.errors.json && <p id="json-error" role="alert">{jsonForm.formState.errors.json.message}</p>}</form></section>}
   <div className="workspace">{layout === 'desktop' && batch && <QuestionNavigator doc={state.doc} onSelect={switchQuestion} />}
    <div className="question-context" role={wide ? 'region' : undefined} aria-label={wide ? 'Question context' : undefined}>
   {batch && <section className="exercise-bar" hidden={layout === 'desktop'} aria-label="Exercise navigation"><label>Question {exerciseIndex + 1} of {state.doc.exercises.length}<select aria-label="Current exercise" value={ex.id} onChange={e => switchQuestion(e.target.value)}>{state.doc.exercises.map((entry, i) => <option value={entry.id} key={entry.id}>Question {i + 1} / {state.doc.exercises.length}{wide ? ` · ${questionStatus(entry)}` : entry.skipped ? ' · Skipped' : entry.steps.some(s => s.final) ? ' · Final' : ' · Unanswered'}</option>)}</select></label>
    <div role="progressbar" aria-label="Question progress" aria-valuemin={0} aria-valuemax={state.doc.exercises.length} aria-valuenow={completed} className="diagnostic-track"><div style={{ width: `${completed / state.doc.exercises.length * 100}%` }} /></div><p className="small progress-text">{completed} of {state.doc.exercises.length} answered or skipped · Answers hidden until Finish</p></section>}
    <section className="problem" aria-label="Current problem">{wide && <div className="question-heading"><h2>Question {exerciseIndex + 1}</h2>{fractions && <span className="topic-badge">Fractions</span>}</div>}{ex.prompt && <p className="persian-question" lang="fa" dir="rtl">{ex.prompt}</p>}{problemExpression ? <div className="problem-formula" aria-label="Original problem"><Formula sequence={problemExpression} stepId="problem" top readOnly /></div> : !ex.prompt && <p className="persian-question" lang="fa" dir="rtl">{ex.source}</p>}</section>
    <SessionPanel meta={state.doc.session} exercise={ex} onMeta={value => dispatch(actions.setSessionMeta(value))} onHint={value => dispatch(actions.setHint(value))} />
    <QuestionTimer key={ex.id} exerciseId={ex.id} elapsedMs={ex.elapsedMs} suspended={modalOpen || setup || backup || confirmExam || confirmFractions} />
    {layout === 'desktop' && <details className="shortcut-panel" open><summary>Keyboard shortcuts</summary><ShortcutHelp /></details>}
    </div>
    <div className={`editor-layout work-pane ${state.keyboardOpen ? 'keyboard-visible' : 'keyboard-hidden'}`} role={wide ? 'region' : undefined} aria-label={wide ? 'Your work' : undefined}><div className="notebook-main">
    {wide && mathTools}
    {wide && <div className="work-heading"><h2>Your work</h2><p className="small">Write each step. Review when you're ready.</p></div>}

    <section className="steps" aria-label="Solution steps">{ex.steps.map((step, i) => <article className={`step ${step.id === state.doc.cursor.stepId ? 'current-step' : ''}`} key={step.id} data-step-id={step.id}>
     <header className="step-header"><Button className="step-title" variant="ghost" onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); focusEditor(); }}>Step {i + 1}</Button><span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>{step.status === 'needs-review' ? 'Needs review' : step.edited ? 'Edited' : ''}</span>
      <Button className="final-marker" aria-pressed={step.final} aria-label={`Mark Step ${i + 1} as final`} onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); dispatch(actions.command({ type: 'final' })); }}>Final{step.final ? ' ✓' : ''}</Button>
      <Button size="icon" variant="ghost" aria-label={`Reset Step ${i + 1}`} title={`Reset Step ${i + 1}`} onClick={() => resetStep(step.id)}><RotateCcw aria-hidden="true" /></Button><Button size="icon" variant="ghost" disabled={i === 0} aria-label={`Delete Step ${i + 1}`} title={i === 0 ? 'The first step cannot be deleted' : `Delete Step ${i + 1}`} onClick={() => deleteStep(step.id)}><Trash2 aria-hidden="true" /></Button>
     </header><div className="expression" aria-label={`Step ${i + 1} expression`}><Formula sequence={step.expression} stepId={step.id} path={`Step ${i + 1}`} top /></div>
     {step.id === state.doc.cursor.stepId && <p className="selection small"><span className="selection-dot" aria-hidden="true" />{selectionLabel}</p>}
    </article>)}</section>
    <Button className="add-step" onClick={addStep}><Plus aria-hidden="true" />Add step</Button>
    {!wide && mathTools}
    {state.keyboardOpen && <Keyboard />}
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
  <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); helpInvoker.current?.focus({preventScroll:true}); }}><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Use your physical keyboard in the math editor. Tab moves between controls; arrow keys edit within numbers and fields.</DialogDescription><ShortcutHelp /><Button onClick={() => setShortcutsOpen(false)}>Close</Button></DialogContent></Dialog>
  <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Import backup file" onChange={e => { void importFile(e.target.files?.[0]); }} />
  <Dialog open={!!exportWarning} onOpenChange={value => { if (!value) setExportWarning(null); }}><DialogContent><DialogTitle>Final answer missing</DialogTitle><DialogDescription>These questions have work but no marked final answer: {exportWarning?.map(n => `Q${n}`).join(', ')}. Mark a final step so your tutor can verify the result.</DialogDescription><div className="dialog-actions"><Button variant="default" onClick={() => setExportWarning(null)}>Go back and mark</Button><Button onClick={() => { void exportTutor(true); }}>Export anyway</Button></div></DialogContent></Dialog>
  <Dialog open={!!resetKind} onOpenChange={value => { if (!value) setResetKind(null); }}><DialogContent><DialogTitle>{resetKind === 'all' ? 'Reset all local storage?' : 'Reset current session?'}</DialogTitle><DialogDescription>{resetKind === 'all' ? 'This deletes every saved draft, preference and session of this app in this browser. Download a backup first.' : 'This clears all questions and answers of the current session and starts a new one. Download a backup first.'}</DialogDescription><div className="dialog-actions"><Button onClick={() => setResetKind(null)}>Cancel</Button><Button onClick={downloadBackup}>Download backup</Button><Button variant="default" onClick={confirmReset}>{resetKind === 'all' ? 'Delete everything' : 'Reset session'}</Button></div></DialogContent></Dialog>
  <ConfidenceDialog open={!!decision} initial={ex.confidence} onCancel={cancelDecision} onConfirm={confirmDecision} invoker={invoker.current} />
  <CompletionDialog open={complete} onClose={() => setComplete(false)} onReview={() => { setComplete(false); void copyReview(); }} onCopy={() => { setComplete(false); void copySession(); }} onAnalyze={() => { setComplete(false); setShowResults(true); }} />
  <Dialog open={insertOpen} onOpenChange={value => { if (!value) closeInsert(); }}><DialogContent className="insert-dialog" onKeyDown={dialogKeys} onCloseAutoFocus={event => { event.preventDefault(); if (restoreInsert.current && insertInvoker.current?.isConnected) insertInvoker.current.focus({ preventScroll: true }); else focusEditor(); }}>
   <DialogTitle>Insert Math Element</DialogTitle><DialogDescription>/ opens · Arrows choose · Enter inserts · Tab moves focus · Escape closes</DialogDescription><div className="insert-options">{insertOptions.map((option, i) => <Button key={option.kind} data-insert-kind={option.kind} onFocus={() => setChoice(i)} ref={el => { dialogRefs.current[i] = el; }} aria-pressed={choice === i} onClick={() => insert(option.kind)}>{option.name}</Button>)}</div><Button onClick={closeInsert}>Cancel · Esc</Button>
  </DialogContent></Dialog>
  <Dialog open={state.storageState?.kind === 'conflict'}><DialogContent onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}><DialogTitle>Draft conflict</DialogTitle><DialogDescription>Another tab saved a newer draft. Keep your unsaved work or use the saved draft.</DialogDescription><div className="dialog-actions"><Button onClick={() => store.resolveConflict?.('local')}>Keep this tab</Button><Button onClick={() => store.resolveConflict?.('remote')}>Use saved draft</Button></div></DialogContent></Dialog>
 </main>;
}
