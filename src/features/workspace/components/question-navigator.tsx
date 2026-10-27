import type { KeyboardEvent } from 'react';
import type { Document } from '../../../model';
import { Button } from '../../../shared/ui/button';
import { questionStatus } from '../model/workspace-layout';
export function QuestionNavigator({ doc, onSelect }: { doc: Document; onSelect: (id: string) => void }) {
 const settled = doc.exercises.filter(ex => ['Answered','Skipped'].includes(questionStatus(ex))).length;
 function keys(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement); if (at < 0) return;
  event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
  buttons[next]?.focus();
 }
 return <nav className="question-navigator" aria-label="Questions" onKeyDown={keys}>
  <h2>Questions</h2><p className="small">{settled} of {doc.exercises.length} answered or skipped</p>
  <div role="progressbar" aria-label="Question progress" aria-valuemin={0} aria-valuemax={doc.exercises.length} aria-valuenow={settled} className="diagnostic-track"><div style={{width:`${settled / doc.exercises.length * 100}%`}} /></div>
  <ol>{doc.exercises.map((ex,index) => { const status = questionStatus(ex); return <li key={ex.id}>
   <Button variant="ghost" className="question-destination" aria-current={doc.exerciseId === ex.id ? 'page' : undefined} onClick={() => onSelect(ex.id)}>
    <span className={`question-state-dot state-${status.toLowerCase().replace(' ','-')}`} aria-hidden="true">{status === 'Answered' ? '✓' : status === 'Skipped' ? '−' : ''}</span>
    <span>Question {index + 1}<span className="destination-status"> {status}</span></span>
   </Button></li>; })}</ol>
 </nav>;
}
