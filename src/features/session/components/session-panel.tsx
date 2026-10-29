import { useId, useRef, type KeyboardEvent } from 'react';
import { usePanelOpen } from '../../../shared/lib/ui-prefs';
import type { Exercise, SessionMeta } from '../../../model';
const scale = [1, 2, 3, 4, 5];
export function SessionPanel({ meta, exercise, onEditScales }: {
 meta?: SessionMeta; exercise: Exercise;
 onEditScales: () => void;
}) {
 const [open, setOpen] = usePanelOpen('session-details', true);
 const final = exercise.steps.findIndex(s => s.final);
 return <details className="session-panel" open={open} onToggle={e => { if (e.currentTarget.open !== open) setOpen(e.currentTarget.open); }}><summary>Session details</summary><section aria-label="Session details">
  <p className="small session-id">Session <code>{meta?.id ?? '—'}</code>{meta?.endedAt ? ' · ended' : ''}</p>
  <p className="small session-scales-summary">Math anxiety: {meta?.anxiety ?? 'Not set'} · Energy: {meta?.energy ?? 'Not set'} <button type="button" className="link-button" onClick={onEditScales}>Change</button></p>
  {(exercise.hintUsed || exercise.guidanceOpenedAt) && <p className="small help-status">{exercise.guidanceOpenedAt ? 'Question guidance opened · counted as helped' : 'Tutor help recorded'}{exercise.hintNote ? ` · ${exercise.hintNote}` : ''}</p>}
  <p className={`small final-status ${final < 0 ? 'missing' : ''}`} role="status">{final < 0 ? 'No final answer marked yet · press Alt+Enter or “Final” on a step' : `Final answer: Step ${final + 1}`}</p>
 </section></details>;
}
export function SessionScales({ meta, onMeta }: { meta?: SessionMeta; onMeta: (value: { anxiety?: number; energy?: number }) => void }) {
 const id = useId();
 const rows = [
  { key: 'anxiety' as const, label: 'Math anxiety', value: meta?.anxiety },
  { key: 'energy' as const, label: 'Energy', value: meta?.energy },
 ];
 const refs = useRef<Record<string, HTMLButtonElement[]>>({});
 function move(event: KeyboardEvent<HTMLButtonElement>, key: 'anxiety' | 'energy', index: number) {
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? 4 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % 5 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + 4) % 5 : -1;
  if (next < 0) return;
  event.preventDefault(); refs.current[key]?.[next]?.focus(); onMeta({ [key]: scale[next] });
 }
 return <div className="session-scales">{rows.map(({ key, label, value }) => <fieldset className="scale-row" key={key}>
   <legend>{label}</legend>
   <div className="scale-pills" role="radiogroup" aria-label={label} aria-describedby={`${id}-${key}-bounds`}>
    {scale.map((number, index) => <button key={number} ref={element => { if (element) (refs.current[key] ??= [])[index] = element; }} type="button" role="radio" aria-checked={value === number} tabIndex={value === number || (value === undefined && index === 0) ? 0 : -1} className={value === number ? 'scale-pill selected' : 'scale-pill'} onClick={() => onMeta({ [key]: number })} onKeyDown={event => move(event, key, index)}>{number}</button>)}
   </div>
   <div id={`${id}-${key}-bounds`} className="scale-bounds"><span>Low</span><span>High</span></div>
  </fieldset>)}</div>;
}
