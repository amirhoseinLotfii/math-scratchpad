import { useEffect, useState } from 'react';
import { useAppDispatch } from './hooks';
import { actions } from './store';

/** Observed visible time, not a claim about attention or study outside this app. */
export function QuestionTimer({ exerciseId, elapsedMs = 0, suspended = false }: { exerciseId: string; elapsedMs?: number; suspended?: boolean }) {
  const dispatch = useAppDispatch();
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    let baseline = performance.now();
    let active = !paused && !suspended && !document.hidden;
    dispatch(actions.addQuestionTime({ exerciseId, milliseconds: 0 }));
    const flush = () => {
      const now = performance.now();
      if (active) dispatch(actions.addQuestionTime({ exerciseId, milliseconds: Math.max(0, now - baseline) }));
      baseline = now;
    };
    const visibility = () => { flush(); active = !paused && !suspended && !document.hidden; setVisible(!document.hidden); };
    const blur = () => { flush(); active = false; setVisible(false); };
    const focus = () => { baseline = performance.now(); active = !paused && !suspended && !document.hidden; setVisible(!document.hidden); };
    const hide = () => { flush(); active = false; };
    const interval = setInterval(flush, 1000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur); window.addEventListener('focus', focus); window.addEventListener('pagehide', hide);
    return () => { flush(); clearInterval(interval); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); window.removeEventListener('pagehide', hide); };
  }, [exerciseId, paused, suspended, dispatch]);
  const seconds = Math.floor(elapsedMs / 1000);
  const formatted = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const stopped = paused || suspended || !visible;
  return <div className="question-timer" lang="en" dir="ltr">
    <span>Question time <output aria-label="Question elapsed time" aria-live="off" dir="ltr">{formatted}</output></span>
    <button type="button" aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause'}</button>
    <span className="small">{stopped ? 'Paused' : 'Recording'} · Visible time only; pause for breaks.</span>
  </div>;
}
