import { ScaleGroup } from './scale-group';
import { usePanelOpen } from '../../../shared/lib/ui-prefs';
import type { Exercise, SessionMeta } from '../../../model';

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
 return <div className="session-scales">
  <ScaleGroup label="Math anxiety" value={meta?.anxiety} onChange={anxiety=>onMeta({anxiety})}/>
  <ScaleGroup label="Energy" value={meta?.energy} onChange={energy=>onMeta({energy})}/>
 </div>;
}
