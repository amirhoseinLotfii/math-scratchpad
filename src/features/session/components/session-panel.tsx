import { useId } from 'react';
import type { Exercise, SessionMeta } from '../../../model';
const scale = [1, 2, 3, 4, 5];
export function SessionPanel({ meta, exercise, onMeta, onHint }: {
 meta?: SessionMeta; exercise: Exercise;
 onMeta: (value: { anxiety?: number; energy?: number }) => void;
 onHint: (value: { used: boolean; note?: string }) => void;
}) {
 const id = useId();
 const final = exercise.steps.findIndex(s => s.final);
 return <section className="session-panel" aria-label="Session details">
  <p className="small session-id">Session <code>{meta?.id ?? '—'}</code>{meta?.endedAt ? ' · ended' : ''}</p>
  <div className="session-scales">
   <label htmlFor={`${id}-anxiety`}>Math anxiety (1–5)<select id={`${id}-anxiety`} value={meta?.anxiety ?? ''} onChange={e => onMeta({ anxiety: e.target.value ? Number(e.target.value) : undefined })}><option value="">Not set</option>{scale.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
   <label htmlFor={`${id}-energy`}>Energy (1–5)<select id={`${id}-energy`} value={meta?.energy ?? ''} onChange={e => onMeta({ energy: e.target.value ? Number(e.target.value) : undefined })}><option value="">Not set</option>{scale.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
  </div>
  <div className="hint-row">
   <label><input type="checkbox" checked={exercise.hintUsed === true} onChange={e => onHint({ used: e.target.checked, note: exercise.hintNote })} /> Tutor help used on this question</label>
   {exercise.hintUsed && <label htmlFor={`${id}-hint`} className="hint-note">Help note<input id={`${id}-hint`} type="text" maxLength={500} value={exercise.hintNote ?? ''} onChange={e => onHint({ used: true, note: e.target.value })} /></label>}
  </div>
  <p className={`small final-status ${final < 0 ? 'missing' : ''}`} role="status">{final < 0 ? 'No final answer marked yet · press Alt+Enter or “Final” on a step' : `Final answer: Step ${final + 1}`}</p>
 </section>;
}
