import { useId, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePanelOpen } from '../../../shared/lib/ui-prefs';
import type { Document } from '../../../model';
import { Button } from '../../../shared/ui/button';
import { questionStatus } from '../model/workspace-layout';
export function QuestionNavigator({ doc, onSelect }: { doc: Document; onSelect: (id: string) => void }) {
 const [open, setOpen] = usePanelOpen('questions', true), listId = useId();
 function keys(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.question-destination'));
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement); if (at < 0) return;
  event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
  buttons[next]?.focus();
 }
 return <nav className="question-navigator" data-collapsed={open ? undefined : 'true'} aria-label="Questions" onKeyDown={keys}>
  <div className="navigator-heading"><h2>Questions</h2><Button size="icon" variant="ghost" className="navigator-toggle" aria-expanded={open} aria-controls={listId} aria-label={open ? 'Collapse questions panel' : 'Expand questions panel'} title={open ? 'Collapse questions panel' : 'Expand questions panel'} onClick={() => setOpen(!open)}>{open ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</Button></div>
  <ol id={listId} hidden={!open}>{doc.exercises.map((ex,index) => { const status = questionStatus(ex); return <li key={ex.id}>
   <Button variant="ghost" className="question-destination" aria-current={doc.exerciseId === ex.id ? 'page' : undefined} onClick={() => onSelect(ex.id)}>
    <span className={`question-state-dot state-${status.toLowerCase().replace(' ','-')}`} aria-hidden="true">{status === 'Answered' ? '✓' : status === 'Skipped' ? '−' : ''}</span>
    <span>Question {index + 1}<span className="destination-status"> {status}</span></span>
   </Button></li>; })}</ol>
 </nav>;
}
