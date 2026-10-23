import { useRef, useState, type KeyboardEvent } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { actions, activeInfo, exerciseOf } from './store';
import { ascii, example, leaves } from './model';
import { parse } from './parser';
import { fingerprint, reviewMessage, writeClipboard } from './review';
import { serialize, validateSession } from './persistence';
import { Formula } from './Formula';
import { Keyboard } from './Keyboard';

export function App() {
  const s = useAppSelector(s => s), dispatch = useAppDispatch(), ex = exerciseOf(s.doc);
  const [setup, setSetup] = useState(false), [menu, setMenu] = useState(false);
  const [source, setSource] = useState(''), [mode, setMode] = useState<'math' | 'text'>('math');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [manual, setManual] = useState('');
  const [backup, setBackup] = useState(false), [backupText, setBackupText] = useState('');
  const checkBusy = useRef(false), manualRef = useRef<HTMLTextAreaElement>(null);
  const currentIndex = ex.steps.findIndex(x => x.id === s.doc.cursor.stepId);
  const currentCopy = s.copies[ex.id]; const copyState = !currentCopy ? '' : currentCopy === fingerprint(s.doc) ? 'Copied' : 'Changed since copy';
  const selected = activeInfo(s.doc);
  const selectionLabel = s.doc.cursor.sequenceId ? `Step ${currentIndex + 1} / Main line insertion` : selected ? `Step ${currentIndex + 1}${selected.path}${s.doc.cursor.selected ? ' / Whole structure' : ` / Cursor ${s.doc.cursor.offset}`}` : '';
  async function check() {
    if (checkBusy.current) return; checkBusy.current = true; setBusy(true);
    const prompt = reviewMessage(s.doc), snapshot = fingerprint(s.doc), exerciseId = ex.id;
    try {
      if (await writeClipboard(prompt)) { dispatch(actions.copied({ exerciseId, snapshot })); setManual(''); }
      else { setManual(prompt); dispatch(actions.notice('Clipboard blocked. Long-press the text below, select all, then copy.')); }
    } finally { checkBusy.current = false; setBusy(false); }
  }
  function start() {
    try {
      if (!source.trim()) throw Error('Enter a problem first.');
      // Parse math to reject unsupported imports before creating an exercise. Persian prose remains prose.
      if (mode === 'math') parse(source);
      dispatch(actions.command({ type: 'newExercise', source: mode === 'math' ? ascii(source) : source, mode }));
      setSetup(false); setSource(''); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open problem.'); }
  }
  function keys(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || event.ctrlKey || event.metaKey || event.altKey || setup || backup || !s.keyboardOpen) return;
    if (/^[0-9.]$/.test(event.key)) { event.preventDefault(); dispatch(actions.command({ type: 'digit', value: event.key })); }
    else if (/^[a-zA-Z]$/.test(event.key)) { event.preventDefault(); dispatch(actions.command({ type: 'identifier', value: event.key })); }
    else if (['+', '-', '*', '/', '='].includes(event.key)) { event.preventDefault(); dispatch(actions.command({ type: 'operator', value: ({ '-': '−', '*': '×', '/': '÷' } as Record<string, string>)[event.key] ?? event.key })); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); dispatch(actions.move(event.key === 'ArrowLeft' ? -1 : 1)); }
    else if (event.key === 'Backspace') { event.preventDefault(); dispatch(actions.command({ type: 'backspace' })); }
  }
  function useExample() {
    dispatch(actions.command({ type: 'newExercise', source: example, mode: 'math', expression: parse(example) })); setSetup(false); setMenu(false);
  }
  function loadBackup() {
    try { if (backupText.length > 1000000) throw Error('Session is too large.'); dispatch(actions.load(validateSession(JSON.parse(backupText)))); setBackup(false); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Invalid session.'); }
  }
  return <main className="scratchpad" dir="ltr" lang="en" onKeyDown={keys}>
    <header className="app-header"><div><h1>Math Scratchpad</h1><p className="small">Write. Think. Take the next step.</p></div><button type="button" aria-label="Exercise menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Menu</button></header>
    <div className="exercise-bar"><label>Exercise <select aria-label="Current exercise" value={ex.id} onChange={e => { dispatch(actions.switchExercise(e.target.value)); setManual(''); }}>{s.doc.exercises.map((x, i) => <option value={x.id} key={x.id}>Exercise {i + 1}{x.steps.some(s => s.final) ? ' · Final marked' : ' · In progress'}</option>)}</select></label><button type="button" onClick={() => { setSetup(true); setError(''); }}>New</button></div>
    {menu && <nav className="menu-panel" aria-label="Notebook actions">
      <button type="button" onClick={useExample}>Use example</button>
      <button type="button" onClick={() => { dispatch(actions.command({ type: 'newProblem' })); setMenu(false); setManual(''); }}>Use this expression as a new problem</button>
      <button type="button" onClick={() => { setBackupText(serialize(s)); setBackup(true); setMenu(false); setError(''); }}>Session backup / restore</button>
    </nav>}
    {setup && <section className="setup-panel" aria-label="New exercise">
      <h2>New exercise</h2><label htmlFor="problem-format">Problem format</label><select id="problem-format" value={mode} onChange={e => setMode(e.target.value as 'math' | 'text')}><option value="math">Math / LaTeX</option><option value="text">Persian text</option></select>
      <label htmlFor="problem-input">Problem</label><textarea id="problem-input" maxLength={4000} dir={mode === 'text' ? 'auto' : 'ltr'} value={source} onChange={e => setSource(e.target.value)} placeholder={mode === 'math' ? example : 'Describe the problem'} />
      <p className="small">{mode === 'text' ? 'The original text is preserved for review. Write your math in the steps.' : 'Fractions, powers, roots and common functions can be pasted. More templates are in Symbols.'}</p>
      {error && <p role="alert">{error}</p>}<div className="toolbar"><button type="button" className="primary" onClick={start}>Start</button><button type="button" onClick={() => setSetup(false)}>Cancel</button></div>
    </section>}
    {backup && <section className="setup-panel" aria-label="Session backup"><h2>Session backup</h2><label htmlFor="session-json">Copy to save, or paste a session to restore</label><textarea id="session-json" value={backupText} onChange={e => setBackupText(e.target.value)} spellCheck={false} /><div className="toolbar"><button type="button" onClick={async () => dispatch(actions.notice(await writeClipboard(backupText) ? 'Session copied.' : 'Select the session text and copy it manually.'))}>Copy session</button><button type="button" onClick={loadBackup}>Restore</button><button type="button" onClick={() => setBackup(false)}>Close</button></div>{error && <p role="alert">{error}</p>}</section>}
    <details className="problem"><summary>Problem</summary><p dir={ex.mode === 'text' ? 'auto' : 'ltr'} className={ex.mode === 'math' ? 'latex-source' : ''}>{ex.source}</p></details>
    <section className="steps" aria-label="Solution steps">
      {ex.steps.map((step, i) => <article className={`step ${step.id === s.doc.cursor.stepId ? 'current-step' : ''}`} key={step.id} data-step-id={step.id}>
        <header className="step-header"><button type="button" className="step-title" onClick={() => dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id }))}>Step {i + 1}</button><span className="step-state">{step.status === 'needs-review' ? 'Needs review' : ''}</span><button type="button" aria-pressed={step.final} aria-label={`Mark Step ${i + 1} as final`} onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); dispatch(actions.command({ type: 'final' })); }}>Final{step.final ? ' ✓' : ''}</button><details className="step-menu"><summary aria-label={`Step ${i + 1} actions`}>•••</summary><div className="step-menu-items"><button type="button" onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); dispatch(actions.command({ type: 'clear' })); }}>Clear step</button><button type="button" onClick={() => { dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id })); dispatch(actions.command({ type: 'deleteStep' })); }}>Delete step</button></div></details></header>
        <div className="expression" aria-label={`Step ${i + 1} expression`}><Formula sequence={step.expression} stepId={step.id} path={`Step ${i + 1}`} top /></div>
        {step.id === s.doc.cursor.stepId && <><p className="selection small" aria-live="polite">{selectionLabel}</p>{s.keyboardOpen ? <Keyboard /> : <button type="button" className="show-keys" onClick={() => dispatch(actions.keyboard(true))}>Show keys</button>}</>}
      </article>)}
    </section>
    <footer className="review-controls"><div className="primary-actions"><button type="button" onClick={() => dispatch(actions.command({ type: 'newStep' }))}>+ New step</button><button type="button" className="primary" onClick={check} disabled={busy}>{busy ? 'Copying…' : 'Check'}</button></div><p className="small">Check copies the problem and all steps. Paste into this chat and send.</p><p className={`copy-state ${copyState === 'Changed since copy' ? 'changed' : ''}`} aria-live="polite">{copyState}</p><p className="small" role="status">{s.notice}</p></footer>
    {manual && <section className="manual-copy"><label htmlFor="review-text">Review message · long-press to copy</label><textarea id="review-text" readOnly ref={manualRef} value={reviewMessage(s.doc)} onFocus={e => e.currentTarget.select()} /><div className="toolbar"><button type="button" onClick={() => { manualRef.current?.focus(); manualRef.current?.select(); }}>Select all</button><button type="button" onClick={() => setManual('')}>Close</button></div></section>}
  </main>;
}
