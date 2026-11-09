import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppDispatch } from '../hooks';
import { actions } from '../store';
import { ascii, example } from '../model';
import { parse } from '../parser';
import { writeClipboard } from '../review';
import { validateSession } from '../persistence';
import { migrateChatDiagnosticSession } from '../legacyDiagnostic';
import { Button } from '../shared/ui/button';
import { problemSchema, jsonInputSchema } from '../features/session/schemas/session-schema';
import { emitLearnEvent, type LearnEventContext } from '../sync/events';

export type InlinePanel = 'new' | 'backup' | 'fractions' | 'diagnostic';

/** State for the inline practice/setup panels (new problem, session JSON, round/diagnostic confirmation). */
export function usePracticeLauncher() {
 const [setup, setSetup] = useState(false), [backup, setBackup] = useState(false);
 const [confirmExam, setConfirmExam] = useState(false), [confirmFractions, setConfirmFractions] = useState(false);
 const problemForm = useForm({ resolver: zodResolver(problemSchema), defaultValues: { source: '', mode: 'math' as 'math' | 'text' } });
 const jsonForm = useForm({ resolver: zodResolver(jsonInputSchema), defaultValues: { json: '' } });
 // New Problem is an inline form: move keyboard focus into the input after
 // the menu closes, rather than leaving focus on the background menu button.
 useEffect(() => {
  if (!setup) return;
  const frame = requestAnimationFrame(() => {
   document.getElementById('problem-input')?.focus({ preventScroll: true });
  });
  return () => cancelAnimationFrame(frame);
 }, [setup]);
 // Inline setup panels are alternatives, not independently stackable cards.
 // Switching workflows preserves form state but keeps the workspace readable.
 function openInlinePanel(panel: InlinePanel) {
  setSetup(panel === 'new');
  setBackup(panel === 'backup');
  setConfirmFractions(panel === 'fractions');
  setConfirmExam(panel === 'diagnostic');
 }
 return { setup, setSetup, backup, setBackup, confirmExam, setConfirmExam, confirmFractions, setConfirmFractions, problemForm, jsonForm, openInlinePanel };
}
export type PracticeLauncherState = ReturnType<typeof usePracticeLauncher>;

/** Renders the inline practice/setup panels driven by `usePracticeLauncher`. */
export function PracticeLauncher({ launcher, wide, sessionEventContext, onSessionChanged }: { launcher: PracticeLauncherState; wide: boolean; sessionEventContext: LearnEventContext; onSessionChanged: () => void }) {
 const dispatch = useAppDispatch();
 const { setup, setSetup, backup, setBackup, confirmExam, setConfirmExam, confirmFractions, setConfirmFractions, problemForm, jsonForm } = launcher;
 const mode = problemForm.watch('mode');
 const start = problemForm.handleSubmit(value => {
  try {
   if (value.mode === 'math') parse(value.source);
   dispatch(actions.command({ type: 'newExercise', source: value.mode === 'math' ? ascii(value.source) : value.source, mode: value.mode }));
   setSetup(false); problemForm.reset(); onSessionChanged();
  } catch (error) { problemForm.setError('source', { message: error instanceof Error ? error.message : 'Invalid problem.' }, { shouldFocus: true }); }
 });
 const loadBackup = jsonForm.handleSubmit(value => {
  try { const raw = JSON.parse(value.json); dispatch(actions.load(migrateChatDiagnosticSession(raw) ?? validateSession(raw))); emitLearnEvent(sessionEventContext, { type: 'backup_restored', itemId: 'session-json' }); setBackup(false); onSessionChanged(); }
  catch (error) { jsonForm.setError('json', { message: error instanceof Error ? error.message : 'Invalid session JSON.' }, { shouldFocus: true }); }
 });
 return <>
  {(confirmExam || confirmFractions) && <section className="setup-panel" aria-label={confirmFractions ? 'Confirm fraction round start' : 'Confirm diagnostic start'}><h2>Start {confirmFractions ? 'Round 1 · 20 fraction questions' : 'diagnostic'}?</h2><p>Export Session JSON first to keep your current work.</p><div className="toolbar"><Button variant="default" onClick={() => { dispatch(confirmFractions ? actions.startFractionRound() : actions.startDiagnostic()); if (!wide) dispatch(actions.keyboard(true)); setConfirmExam(false); setConfirmFractions(false); onSessionChanged(); }}>{confirmFractions ? 'Start 20 Questions' : 'Start 30 Questions'}</Button><Button onClick={() => { setConfirmExam(false); setConfirmFractions(false); }}>Cancel</Button></div></section>}
  {setup && <section className="setup-panel" aria-label="New exercise"><h2>New exercise</h2><form onSubmit={start} noValidate>
   <label htmlFor="problem-format">Problem format</label><select id="problem-format" {...problemForm.register('mode')}><option value="math">Math / LaTeX</option><option value="text">Persian text</option></select>
   <label htmlFor="problem-input">Problem</label><textarea id="problem-input" {...problemForm.register('source')} maxLength={4000} dir={mode === 'text' ? 'auto' : 'ltr'} aria-invalid={!!problemForm.formState.errors.source} aria-describedby={problemForm.formState.errors.source ? 'problem-error' : undefined} placeholder={mode === 'math' ? example : 'Describe the question'} />
   {problemForm.formState.errors.source && <p id="problem-error" role="alert">{problemForm.formState.errors.source.message}</p>}
   <div className="toolbar"><Button type="submit" variant="default">Start</Button><Button onClick={() => setSetup(false)}>Cancel</Button></div></form></section>}
  {backup && <section className="setup-panel" aria-label="Session backup"><h2>Session backup</h2><form onSubmit={loadBackup} noValidate><label htmlFor="session-json">Copy or paste session JSON</label><textarea id="session-json" {...jsonForm.register('json')} spellCheck={false} aria-invalid={!!jsonForm.formState.errors.json} aria-describedby={jsonForm.formState.errors.json ? 'json-error' : undefined} /><div className="toolbar"><Button onClick={async () => dispatch(actions.notice(await writeClipboard(jsonForm.getValues('json')) ? 'Session copied.' : 'Select the text and copy manually.'))}>Copy Session</Button><Button type="submit">Restore</Button><Button onClick={() => setBackup(false)}>Close</Button></div>{jsonForm.formState.errors.json && <p id="json-error" role="alert">{jsonForm.formState.errors.json.message}</p>}</form></section>}
 </>;
}
