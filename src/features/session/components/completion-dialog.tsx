import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';
import { Button } from '../../../shared/ui/button';
export function CompletionDialog({ open, onClose, onReview, onCopy, onAnalyze, totalQuestions, answeredQuestions, skippedQuestions }: {
 open: boolean; onClose: () => void; onReview: () => void; onCopy: () => void; onAnalyze: () => void;
 totalQuestions: number; answeredQuestions: number; skippedQuestions: number;
}) {
 const unansweredQuestions = Math.max(0, totalQuestions - answeredQuestions - skippedQuestions);
 return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent>
  <DialogTitle>Session complete</DialogTitle><DialogDescription>Your work is saved locally. Choose an action to copy or review it.</DialogDescription>
  <p className="completion-coverage" role="status" aria-live="polite">
    {answeredQuestions} of {totalQuestions} questions answered
    {skippedQuestions > 0 && <span> · {skippedQuestions} skipped</span>}
    {unansweredQuestions > 0 && <span> · {unansweredQuestions} not answered (unverified)</span>}.
  </p>
  <div className="completion-actions"><Button variant="default" onClick={onReview}>Check · Copy for Review</Button><Button onClick={onCopy}>Copy full session JSON</Button><Button onClick={onAnalyze}>Finish &amp; Analyze</Button><Button onClick={onClose}>Close</Button></div>
 </DialogContent></Dialog>;
}
