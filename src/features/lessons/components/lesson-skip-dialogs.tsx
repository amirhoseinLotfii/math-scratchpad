import type { RefObject } from 'react';
import type { BankQuestion } from '../../../domain/entities/drive-bank.types';
import { Button } from '../../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';

export function LessonSkipDialogs({
  uiLang,
  skipQuestion,
  onCloseSkipQuestion,
  onConfirmSkip,
  skipCheckInvoker,
  skipPracticeOpen,
  onOpenSkipPracticeChange,
  onConfirmSkipToPractice,
  skipPracticeInvoker,
  headingRef,
}: {
  uiLang: 'fa' | 'en';
  skipQuestion: BankQuestion | null;
  onCloseSkipQuestion: () => void;
  onConfirmSkip: () => void;
  skipCheckInvoker: RefObject<HTMLElement | null>;
  skipPracticeOpen: boolean;
  onOpenSkipPracticeChange: (open: boolean) => void;
  onConfirmSkipToPractice: () => void;
  skipPracticeInvoker: RefObject<HTMLButtonElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const fa = uiLang === 'fa';
  return (
    <>
      <Dialog open={!!skipQuestion} onOpenChange={open => { if (!open) onCloseSkipQuestion(); }}>
        <DialogContent
          aria-describedby="lesson-skip-description"
          onCloseAutoFocus={event => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const target = skipCheckInvoker.current;
              if (target?.isConnected) target.focus({ preventScroll: true });
              else headingRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          <DialogTitle>{fa ? 'از این تمرین بگذرم؟' : 'Skip this check?'}</DialogTitle>
          <DialogDescription id="lesson-skip-description">{fa ? 'این تمرین به‌عنوان ردشده ثبت می‌شود.' : 'This check will be logged as skipped.'}</DialogDescription>
          <div className="dialog-actions">
            <Button onClick={onCloseSkipQuestion}>{fa ? 'انصراف' : 'Cancel'}</Button>
            <Button variant="default" className="lesson-primary-action" onClick={onConfirmSkip}>{fa ? 'رد کردن تمرین' : 'Skip check'}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={skipPracticeOpen} onOpenChange={onOpenSkipPracticeChange}>
        <DialogContent
          aria-describedby="lesson-skip-practice-description"
          onCloseAutoFocus={event => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const target = skipPracticeInvoker.current;
              if (target?.isConnected) target.focus({ preventScroll: true });
              else headingRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          <DialogTitle>{fa ? 'از درس‌نامه به تمرین پایانی بروم؟' : 'Skip to practice?'}</DialogTitle>
          <DialogDescription id="lesson-skip-practice-description">{fa ? 'این انتخاب برای این درس ثبت می‌شود.' : 'This choice will be recorded for this lesson.'}</DialogDescription>
          <div className="dialog-actions">
            <Button onClick={() => onOpenSkipPracticeChange(false)}>{fa ? 'ادامهٔ درس‌نامه' : 'Cancel'}</Button>
            <Button variant="default" className="lesson-primary-action" onClick={onConfirmSkipToPractice}>{fa ? 'رفتن به تمرین پایانی' : 'Skip to practice'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
