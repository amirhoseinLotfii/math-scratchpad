import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { actions, activeInfo, exerciseOf } from './store';
import { ascii, example, leaves, latex } from './model';
import { parse } from './parser';
import { fingerprint, reviewMessage, writeClipboard } from './review';
import { serialize, validateSession } from './persistence';
import { diagnosticQuestions } from './diagnostic';
import { fractionRoundOne } from './fractionRoundOne';
import { gradeDiagnostic } from './assessment';
import { migrateChatDiagnosticSession } from './legacyDiagnostic';
import { Formula } from './Formula';
import { Keyboard } from './Keyboard';

const INSERT_OPTIONS = [
  { name: 'Fraction', kind: 'fraction' }, { name: 'Number', kind: 'number' },
  { name: '√ Root', kind: 'root' }, { name: 'Power', kind: 'power' },
  { name: 'Parentheses', kind: 'group' }, { name: '+', kind: '+' },
  { name: '−', kind: '−' }, { name: '×', kind: '×' },
  { name: '÷', kind: '÷' }, { name: '=', kind: '=' }
];
export function App() {
  const state = useAppSelector(s => s), dispatch = useAppDispatch(), ex = exerciseOf(state.doc);
  const [setup, setSetup] = useState(false), [menu, setMenu] = useState(false), [confirmExam, setConfirmExam] = useState(false);
  const [source, setSource] = useState(''), [mode, setMode] = useState<'math' | 'text'>('math');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [manual, setManual] = useState('');
  const [backup, setBackup] = useState(false), [backupText, setBackupText] = useState('');
  const [insertOpen, setInsertOpen] = useState(false), [choice, setChoice] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [confirmFractions, setConfirmFractions] = useState(false);
  const insertDialogRoot = useRef<HTMLDivElement>(null);
  const checkBusy = useRef(false), manualRef = useRef<HTMLTextAreaElement>(null);
  const editorRoot = useRef<HTMLElement>(null), dialogRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentIndex = ex.steps.findIndex(x => x.id === state.doc.cursor.stepId);
  const exerciseIndex = state.doc.exercises.findIndex(x => x.id === ex.id);
  const fractions = ex.assessment === 'fractions-round-1';
  const questionBank = fractions ? fractionRoundOne : diagnosticQuestions;
  const questionCount = questionBank.length;
  const exam = !!ex.diagnosticId && state.doc.exercises.some(x => x.diagnosticId === questionCount && (x.assessment === 'fractions-round-1') === fractions);
  const completed = state.doc.exercises.filter(x => x.diagnosticId && (x.skipped || x.steps.some(s => latex(s.expression) !== '\\square'))).length;
  const copy = state.copies[ex.id], copied = !copy ? '' : copy === fingerprint(state.doc) ? 'Copied' : 'Changed since copy';
  const selected = activeInfo(state.doc);
  const selectionLabel = state.doc.cursor.sequenceId
    ? 'Step ' + (currentIndex + 1) + ' · Main-line insertion'
    : selected ? 'Step ' + (currentIndex + 1) + selected.path + (state.doc.cursor.selected ? ' · Whole structure' : ' · Caret ' + state.doc.cursor.offset) : '';
  const problemExpression = useMemo(() => {
    if (ex.mode !== 'math') return null;
    try { return parse(ex.source); } catch { return null; }
  }, [ex.source, ex.mode]);

  useEffect(() => { editorRoot.current?.focus({ preventScroll: true }); }, [ex.id]);
  useEffect(() => { if (insertOpen) dialogRefs.current[choice]?.focus({ preventScroll: true }); }, [insertOpen, choice]);
  useEffect(() => {
    if (!insertOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && insertDialogRoot.current && !insertDialogRoot.current.contains(event.target)) {
        setInsertOpen(false);
        editorRoot.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [insertOpen]);
  const examGrades = useMemo(() => {
    if (!showResults || !exam) return [];
    return questionBank.map(question => {
      const entry = state.doc.exercises.find(x => x.diagnosticId === question.id);
      return entry ? { question, result: entry.skipped ? null : gradeDiagnostic(entry, question) } : { question, result: null };
    });
  }, [showResults, exam, state.doc, questionBank]);

  async function check() {
    if (checkBusy.current) return;
    checkBusy.current = true; setBusy(true);
    const prompt = reviewMessage(state.doc), snapshot = fingerprint(state.doc), exerciseId = ex.id;
    try {
      if (await writeClipboard(prompt)) { dispatch(actions.copied({ exerciseId, snapshot })); setManual(''); }
      else { setManual(prompt); dispatch(actions.notice('Clipboard blocked. Select the review message below and copy manually.')); }
    } finally { checkBusy.current = false; setBusy(false); }
  }
  function start() {
    try {
      if (!source.trim()) throw Error('Enter a problem first.');
      if (mode === 'math') parse(source);
      dispatch(actions.command({ type: 'newExercise', source: mode === 'math' ? ascii(source) : source, mode }));
      setSetup(false); setSource(''); setError(''); setShowResults(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open problem.'); }
  }
  function nextProblem(direction: -1 | 1) {
    dispatch(actions.adjacentExercise(direction));
    setShowResults(false); setManual(''); setInsertOpen(false);
  }
  function insert(kind: string) {
    if (kind === 'number') dispatch(actions.command({ type: 'insertBlankNumber' }));
    else if (['+', '−', '×', '÷', '='].includes(kind)) dispatch(actions.command({ type: 'operator', value: kind }));
    else dispatch(actions.command({ type: 'insert', value: kind }));
    setInsertOpen(false); editorRoot.current?.focus({ preventScroll: true });
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    const key = event.key, target = event.target as HTMLElement;
    if (insertOpen || setup || backup) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (event.ctrlKey || event.metaKey) {
      if (key.toLowerCase() === 'z') { event.preventDefault(); dispatch(event.shiftKey ? actions.redo() : actions.undo()); }
      else if (key.toLowerCase() === 'y') { event.preventDefault(); dispatch(actions.redo()); }
      return;
    }
    if (event.altKey) {
      if (key.toLowerCase() === 'f') { event.preventDefault(); insert('fraction'); }
      if (key.toLowerCase() === 'r') { event.preventDefault(); insert('root'); }
      return;
    }
    if (/^[0-9.]$/.test(key)) { event.preventDefault(); dispatch(actions.command({ type: 'digit', value: key })); }
    else if (/^[a-zA-Z]$/.test(key)) { event.preventDefault(); dispatch(actions.command({ type: 'identifier', value: key })); }
    else if (['+', '-', '*', '/', '='].includes(key)) {
      event.preventDefault();
      const k = ({ '-': '−', '*': '×', '/': '÷' } as Record<string, string>)[key] ?? key;
      dispatch(actions.command({ type: 'operator', value: k }));
    }
    else if (key === '(' || key === ')') { event.preventDefault(); if (key === '(') insert('group'); }
    else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      const endGap = state.doc.cursor.sequenceId === ex.steps[currentIndex]?.expression.id
        && state.doc.cursor.index === ex.steps[currentIndex]?.expression.children.length;
      if (key === 'ArrowRight' && endGap) { setChoice(0); setInsertOpen(true); }
      else dispatch(actions.horizontal(key === 'ArrowLeft' ? -1 : 1));
    }
    else if (key === 'ArrowUp' || key === 'ArrowDown') { event.preventDefault(); dispatch(actions.vertical(key === 'ArrowUp' ? -1 : 1)); }
    else if (key === 'Backspace') { event.preventDefault(); dispatch(actions.command({ type: 'backspace' })); }
    else if (key === 'Delete') { event.preventDefault(); dispatch(actions.command({ type: 'deleteStructure' })); }
    else if (key === 'Enter' && state.doc.cursor.sequenceId) { event.preventDefault(); setChoice(0); setInsertOpen(true); }
  }
  function dialogKeys(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setInsertOpen(false); editorRoot.current?.focus({ preventScroll: true }); return; }
    const size = INSERT_OPTIONS.length;
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 3 : -3;
      setChoice(c => (c + delta + size) % size); return;
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); insert(INSERT_OPTIONS[choice].kind); return; }
    if (event.key === 'Tab') { event.preventDefault(); setChoice(c => (c + (event.shiftKey ? size - 1 : 1)) % size); return; }
    const short = ({ '*': '×', '/': '÷', '-': '−', 'f': 'fraction', 'n': 'number', 'r': 'root' } as Record<string, string>)[event.key] ?? event.key;
    if (INSERT_OPTIONS.some(x => x.kind === short)) { event.preventDefault(); insert(short); }
  }
  function loadBackup() {
    try {
      if (backupText.length > 1000000) throw Error('Session is too large.');
      const json = JSON.parse(backupText);
      dispatch(actions.load(migrateChatDiagnosticSession(json) ?? validateSession(json)));
      setBackup(false); setError(''); setShowResults(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Invalid session.'); }
  }
  function startDiagnostic() {
    dispatch(actions.startDiagnostic()); setConfirmExam(false); setSetup(false); setMenu(false); setShowResults(false);
  }
  async function copyDiagnosticReport() {
    const text = examGrades.map(({ question, result }) =>
      'Q' + question.id + ' | ' + question.stem + '\nExpected: ' + question.expected + '\n' +
      (result ? 'Numerical: ' + result.numeric + ', form: ' + result.form + ', steps: ' + result.steps + '\nReason: ' + result.reason : 'Skipped')
    ).join('\n\n');
    if (await writeClipboard(text)) dispatch(actions.notice('Diagnostic report copied.'));
    else setManual(text);
  }
  const skillScores = useMemo(() => {
    const skills = new Map<string, { correct: number; assessed: number; unresolved: number }>();
    for (const row of examGrades) {
      const skill = row.question.skill;
      const previous = skills.get(skill) ?? { correct: 0, assessed: 0, unresolved: 0 };
      if (!row.result || row.result.numeric === 'unverified') previous.unresolved++;
      else { previous.assessed++; if (row.result.numeric === 'correct') previous.correct++; }
      skills.set(skill, previous);
    }
    return [...skills.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) =>
      (a.assessed ? a.correct / a.assessed : -1) - (b.assessed ? b.correct / b.assessed : -1));
  }, [examGrades]);
  const counts = {
    correct: examGrades.filter(x => x.result?.numeric === 'correct').length,
    unresolved: examGrades.filter(x => !x.result || x.result.numeric === 'unverified').length,
    steps: examGrades.filter(x => x.result?.steps === 'inconsistent').length,
    unsimplified: examGrades.filter(x => x.result?.form === 'equivalent-unsimplified').length
  };
  return <main ref={editorRoot} className="scratchpad" dir="ltr" lang="en" tabIndex={0} onKeyDown={keyboard}>
    <header className="app-header">
      <div><p className="eyebrow">YOUR MATH NOTEBOOK</p><h1>Math Scratchpad</h1><p className="small">Write. Think. Take the next step.</p></div>
      <div className="header-actions">
        <button type="button" onClick={() => setSetup(true)}>New Problem</button>
        <button type="button" onClick={() => { setBackupText(serialize(state)); setBackup(true); setError(''); }}>Session JSON</button>
        <button type="button" aria-expanded={state.keyboardOpen} onClick={() => dispatch(actions.keyboard(!state.keyboardOpen))}>
          {state.keyboardOpen ? '⌨ Hide Keyboard' : '⌨ Show Keyboard'}
        </button>
        <button type="button" aria-label="Exercise menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Menu</button>
      </div>
    </header>
    <section className="exercise-bar" aria-label="Exercise navigation">
      <button type="button" disabled={exerciseIndex === 0} onClick={() => nextProblem(-1)}>← Previous</button>
      <label>{fractions ? 'Round 1 · Fractions' : 'Exercise'}
        <select aria-label="Current exercise" value={ex.id} onChange={e => { dispatch(actions.switchExercise(e.target.value)); setManual(''); setShowResults(false); }}>
          {state.doc.exercises.map((x, i) => <option value={x.id} key={x.id}>{x.diagnosticId ? 'Question ' + x.diagnosticId + ' / ' + (x.assessment === 'fractions-round-1' ? 20 : 30) : 'Exercise ' + (i + 1)}{x.skipped ? ' · Skipped' : x.steps.some(st => st.final) ? ' · Final' : fractions ? ' · Unanswered' : ''}</option>)}
        </select>
      </label>
      <button type="button" disabled={exerciseIndex === state.doc.exercises.length - 1} onClick={() => nextProblem(1)}>Next Problem →</button>
    </section>
    {exam && <section className="diagnostic-progress" aria-label="Diagnostic progress">
      <div className="diagnostic-track"><div style={{ width: (completed / questionCount * 100) + '%' }} /></div>
      <p className="small">{completed} of {questionCount} answered or skipped · Answers hidden until Finish</p>
    </section>}
    {menu && <nav className="menu-panel" aria-label="Notebook actions">
      <button type="button" onClick={() => { dispatch(actions.command({ type: 'newExercise', source: example, mode: 'math' })); setMenu(false); }}>Use example</button>
      <button type="button" onClick={() => { dispatch(actions.command({ type: 'newProblem' })); setMenu(false); }}>Use current expression as new problem</button>
      <button type="button" onClick={() => { setConfirmFractions(true); setMenu(false); }}>Start Round 1 · 20 fraction questions</button>
      <button type="button" onClick={() => { setConfirmExam(true); setMenu(false); }}>Start 30-question diagnostic</button>
    </nav>}
    {confirmFractions && <section className="setup-panel" aria-label="Confirm fraction round start">
      <h2>Start Round 1 · 20 fraction questions?</h2><p>Export Session JSON first to keep the current exercise list. Your answers are preserved between questions.</p>
      <div className="toolbar"><button type="button" className="primary" onClick={() => { dispatch(actions.startFractionRound()); dispatch(actions.keyboard(true)); setConfirmFractions(false); setShowResults(false); }}>Start 20 Questions</button><button type="button" onClick={() => setConfirmFractions(false)}>Cancel</button></div>
    </section>}
    {confirmExam && <section className="setup-panel" aria-label="Confirm diagnostic start">
      <h2>Start diagnostic?</h2><p>This opens 30 new questions and replaces the current exercise list. Export a Session JSON backup first if you need to keep it.</p>
      <div className="toolbar"><button type="button" className="primary" onClick={startDiagnostic}>Start 30 Questions</button><button type="button" onClick={() => setConfirmExam(false)}>Cancel</button></div>
    </section>}
    {setup && <section className="setup-panel" aria-label="New exercise">
      <h2>New exercise</h2>
      <label htmlFor="problem-format">Problem format</label><select id="problem-format" value={mode} onChange={e => setMode(e.target.value as 'math' | 'text')}><option value="math">Math / LaTeX</option><option value="text">Persian text</option></select>
      <label htmlFor="problem-input">Problem</label><textarea id="problem-input" maxLength={4000} dir={mode === 'text' ? 'rtl' : 'ltr'} value={source} onChange={e => setSource(e.target.value)} placeholder={mode === 'math' ? example : 'Describe the problem'} />
      {error && <p role="alert">{error}</p>}
      <div className="toolbar"><button type="button" className="primary" onClick={start}>Start</button><button type="button" onClick={() => setSetup(false)}>Cancel</button></div>
    </section>}
    {backup && <section className="setup-panel" aria-label="Session backup">
      <h2>Session backup</h2><p className="small">Export the JSON before replacing a diagnostic. Draft recovery depends on local storage permissions.</p>
      <label htmlFor="session-json">Copy or paste session JSON</label><textarea id="session-json" value={backupText} onChange={e => setBackupText(e.target.value)} spellCheck={false} />
      <div className="toolbar"><button type="button" onClick={async () => dispatch(actions.notice(await writeClipboard(backupText) ? 'Session copied.' : 'Select the text and copy manually.'))}>Copy Session</button><button type="button" onClick={loadBackup}>Restore</button><button type="button" onClick={() => setBackup(false)}>Close</button></div>{error && <p role="alert">{error}</p>}
    </section>}
    <div className={'editor-layout ' + (state.keyboardOpen ? 'keyboard-visible' : 'keyboard-hidden')}>
      <div className="notebook-main">
        <section className="problem" aria-label="Current problem">
          {ex.prompt && <p className="persian-question" lang="fa" dir="rtl">{ex.prompt}</p>}
          {ex.migrationNotes && <p className="small" role="note">Some imported legacy fields contain non-math text. Their original content was retained for manual review; do not treat their score as definitive.</p>}
          {problemExpression ? <div className="problem-formula" aria-label="Original problem"><Formula sequence={problemExpression} stepId="problem" readOnly top /></div> :
            <p dir={ex.mode === 'text' ? 'rtl' : 'ltr'} className={ex.mode === 'math' ? 'latex-source' : ''}>{ex.source}</p>}
        </section>
        <section className="steps" aria-label="Solution steps">
          {ex.steps.map((st, i) => <article className={'step ' + (st.id === state.doc.cursor.stepId ? 'current-step' : '')} key={st.id} data-step-id={st.id}>
            <header className="step-header">
              <button type="button" className="step-title" onClick={() => dispatch(actions.select({ stepId: st.id, nodeId: leaves(st.expression)[0].node.id }))}>Step {i + 1}</button>
              <span className={'step-state ' + (st.status === 'needs-review' ? 'needs-review' : st.edited ? 'edited' : '')}>{st.status === 'needs-review' ? 'Needs review' : st.edited ? 'Edited' : ''}</span>
              <button type="button" aria-pressed={st.final} aria-label={'Mark Step ' + (i + 1) + ' as final'} onClick={() => { dispatch(actions.select({ stepId: st.id, nodeId: leaves(st.expression)[0].node.id })); dispatch(actions.command({ type: 'final' })); }}>Final{st.final ? ' ✓' : ''}</button>
              <details className="step-menu"><summary aria-label={'Step ' + (i + 1) + ' actions'}>•••</summary><div className="step-menu-items">
                <button type="button" onClick={() => { dispatch(actions.select({ stepId: st.id, nodeId: leaves(st.expression)[0].node.id })); dispatch(actions.command({ type: 'clear' })); }}>Clear step</button>
                <button type="button" onClick={() => { dispatch(actions.select({ stepId: st.id, nodeId: leaves(st.expression)[0].node.id })); dispatch(actions.command({ type: 'deleteStep' })); }}>Delete step</button>
              </div></details>
            </header>
            <div className="expression" aria-label={'Step ' + (i + 1) + ' expression'}><Formula sequence={st.expression} stepId={st.id} path={'Step ' + (i + 1)} top /></div>
            {st.id === state.doc.cursor.stepId && <p className="selection small" aria-live="polite"><span className="selection-dot" aria-hidden="true" />{selectionLabel}</p>}
          </article>)}
        </section>
        <div className="insertion-bar" aria-label="Writing tools">
          <button type="button" onClick={() => { setChoice(0); setInsertOpen(true); }}>⊕ Insert…</button>
          <button type="button" onClick={() => insert('fraction')}>+ Fraction</button>
          <button type="button" onClick={() => insert('number')}>+ Number</button>
          <button type="button" onClick={() => dispatch(actions.command({ type: 'deleteStructure' }))}>Delete Item</button>
          <button type="button" onClick={() => dispatch(actions.undo())} disabled={!state.past.length}>Undo</button>
          <button type="button" onClick={() => dispatch(actions.redo())} disabled={!state.future.length}>Redo</button>
        </div>
        <footer className="review-controls">
          <div className="primary-actions">
            <button type="button" onClick={() => dispatch(actions.command({ type: 'newStep' }))}>+ New Step</button>
            <button type="button" className="primary" onClick={check} disabled={busy}>{busy ? 'Copying…' : 'Check · Copy for Review'}</button>
          </div>
          {exam && <div className="diagnostic-controls" aria-label="Diagnostic controls">
            <span className="small">Confidence:</span>
            {(['high','medium','low'] as const).map(v => <button key={v} type="button" aria-pressed={ex.confidence === v} onClick={() => dispatch(actions.setConfidence(v))}>{v[0].toUpperCase() + v.slice(1)}</button>)}
            <button type="button" aria-pressed={!!ex.skipped} onClick={() => dispatch(actions.setSkipped(!ex.skipped))}>Skip</button>
            <button type="button" onClick={() => setShowResults(true)}>Finish & Analyze</button>
          </div>}
          <p className="small">Check copies your steps for manual review. No automatic solving or sending.</p>
          <p className={'copy-state ' + (copied === 'Changed since copy' ? 'changed' : '')} aria-live="polite">{copied}</p>
          <p className="small" role="status">{state.notice}</p>
        </footer>
        {manual && <section className="manual-copy"><label htmlFor="review-text">Review message · select all to copy</label><textarea id="review-text" ref={manualRef} readOnly value={manual} onFocus={e => e.currentTarget.select()} /><div className="toolbar"><button type="button" onClick={() => { manualRef.current?.focus(); manualRef.current?.select(); }}>Select All</button><button type="button" onClick={() => setManual('')}>Close</button></div></section>}
        {exam && showResults && <section className="diagnostic-report" aria-label="Diagnostic report">
          <h2>Diagnostic Review</h2>
          <p><strong>{counts.correct}/{questionCount}</strong> numerically correct · <strong>{counts.unresolved}</strong> skipped/unverified</p>
          <p className="small">Inconsistent equalities: {counts.steps} · Equivalent but not simplified: {counts.unsimplified}. Unverified is never silently scored incorrect.</p>
          <h3>Skill Breakdown (provisional)</h3>
          <div className="report-grid">{skillScores.map(skill => <div key={skill.name}>
            <strong>{skill.name}</strong><br />{skill.correct}/{skill.assessed} numerically correct
            {skill.unresolved > 0 && <span className="small"> · {skill.unresolved} unverified</span>}
            <div className="small">{skill.assessed < 3 ? 'Limited evidence' : skill.correct / skill.assessed >= .8 ? 'Potential strength' : skill.correct / skill.assessed < .6 ? 'Practice priority' : 'Developing'}</div>
          </div>)}</div>
          <h3>Question-by-question detail</h3>
          <div className="report-grid">{examGrades.map(({ question, result }) => <div key={question.id}>
            <strong>Q{question.id}</strong> · <span>{question.skill}</span> · <span>{result?.numeric ?? 'skipped'}</span>
            {result && <span className="small"> / Form: {result.form} / Steps: {result.steps}</span>}
          </div>)}</div>
          <button type="button" onClick={copyDiagnosticReport}>Copy Full Diagnostic Report</button>
          <p className="small">Estimated skill performance only. Manual review is needed for unsupported expressions and reasoning that cannot be proven from one equation.</p>
        </section>}
      </div>
      {state.keyboardOpen && <aside className="keyboard-side"><Keyboard /></aside>}
    </div>
    {insertOpen && <div className="insert-overlay" onKeyDown={dialogKeys} onClick={event => { if (event.target === event.currentTarget) { setInsertOpen(false); editorRoot.current?.focus({ preventScroll: true }); } }}>
      <div ref={insertDialogRoot} className="insert-dialog" role="dialog" aria-modal="true" aria-labelledby="insert-title">
        <h2 id="insert-title">Insert Math Element</h2><p className="small">Arrow keys navigate · Enter inserts · Escape closes · Type an operator to select it</p>
        <div className="insert-options">{INSERT_OPTIONS.map((option, i) =>
          <button type="button" key={option.kind} ref={el => { dialogRefs.current[i] = el; }} aria-pressed={choice === i} onClick={() => insert(option.kind)}>{option.name}</button>)}</div>
        <button type="button" onClick={() => { setInsertOpen(false); editorRoot.current?.focus({ preventScroll: true }); }}>Cancel · Esc</button>
      </div>
    </div>}
  </main>;
}
