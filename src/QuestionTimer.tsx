import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { actions } from './store';
import { elapsedAt } from './model';

/**
 * Question time from persisted wall-clock timestamps: closed segments (elapsedMs) plus the open
 * segment (timerRunningSince). Time keeps counting while the tab is hidden or closed and survives
 * reloads; only Pause stops it. The 1 s interval only refreshes the display; it never adds time.
 */
export function QuestionTimer({ exerciseId, onPauseChange }: { exerciseId: string; elapsedMs?: number; suspended?: boolean; onPauseChange?: (paused: boolean) => void }) {
  const dispatch = useAppDispatch();
  const ex = useAppSelector(s => s.doc.exercises.find(x => x.id === exerciseId));
  const [now, setNow] = useState(() => Date.now());
  const paused = ex?.timerPaused === true;
  useEffect(() => { dispatch(actions.timerStart({ exerciseId, now: Date.now() })); setNow(Date.now()); }, [exerciseId, dispatch]);
  useEffect(() => {
    if (paused) return;
    const refresh = () => setNow(Date.now());
    const interval = setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [paused]);
  const seconds = Math.floor((ex ? elapsedAt(ex, now) : 0) / 1000);
  const formatted = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return <div className="question-timer" lang="en" dir="ltr">
    <span>Question time <output aria-label="Question elapsed time" aria-live="off" dir="ltr">{formatted}</output></span>
    <button type="button" aria-pressed={paused} onClick={() => { const t = Date.now(), nextPaused = !paused; dispatch(actions.timerPause({ exerciseId, now: t, paused: nextPaused })); onPauseChange?.(nextPaused); setNow(t); }}>{paused ? 'Resume' : 'Pause'}</button>
    <span className="small">{paused ? 'Paused' : 'Recording'} · Keeps counting while away; pause for breaks.</span>
  </div>;
}
