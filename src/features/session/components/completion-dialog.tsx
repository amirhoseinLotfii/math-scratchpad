import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';
import { Button } from '../../../shared/ui/button';
export function CompletionDialog({ open, onClose, onReview, onCopy, onAnalyze, answered, skipped, total, canAnalyze, onReturnFocus }: {
 answered:number;skipped:number;total:number;canAnalyze:boolean;onReturnFocus:()=>void;open: boolean; onClose: () => void; onReview: () => void; onCopy: () => void; onAnalyze: () => void;
}) {
 return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent onCloseAutoFocus={e=>{e.preventDefault();onReturnFocus();}}>
  <DialogTitle>Session complete</DialogTitle><DialogDescription>Your work stays in this browser. Export a backup to keep a separate copy.</DialogDescription>
  <p className="completion-summary">{answered} answered · {skipped} skipped · {total-answered-skipped} unanswered</p><div className="completion-actions"><Button variant="default" onClick={onReview}>Check · Copy for Review</Button><Button onClick={onCopy}>Copy full session JSON</Button>{canAnalyze&&<Button onClick={onAnalyze}>Finish &amp; Analyze</Button>}<Button onClick={onClose}>Close</Button></div>
 </DialogContent></Dialog>;
}
