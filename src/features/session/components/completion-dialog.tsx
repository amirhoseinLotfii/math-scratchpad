import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';
import { Button } from '../../../shared/ui/button';
export function CompletionDialog({ open, onClose, onReview, onCopy, onAnalyze }: {
 open: boolean; onClose: () => void; onReview: () => void; onCopy: () => void; onAnalyze: () => void;
}) {
 return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent>
  <DialogTitle>Session complete</DialogTitle><DialogDescription>Your work is saved locally. Choose an action to copy or review it.</DialogDescription>
  <div className="completion-actions"><Button variant="default" onClick={onReview}>Check · Copy for Review</Button><Button onClick={onCopy}>Copy full session JSON</Button><Button onClick={onAnalyze}>Finish &amp; Analyze</Button><Button onClick={onClose}>Close</Button></div>
 </DialogContent></Dialog>;
}
