import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import type { BankQuestion } from '../drive-bank/drive-bank';

import type { RefObject, Dispatch, SetStateAction } from 'react';
type Set<T> = Dispatch<SetStateAction<T>>;

export function LessonSkipDialogs({
  skipQuestion,
  setSkipQuestion,
  skipPracticeOpen,
  setSkipPracticeOpen,
  skipCheckInvoker,
  skipPracticeInvoker,
  headingRef,
  fa,
  confirmSkip,
  confirmSkipToPractice,
}: {
  skipQuestion: BankQuestion | null;
  setSkipQuestion: Set<BankQuestion | null>;
  skipPracticeOpen: boolean;
  setSkipPracticeOpen: Set<boolean>;
  skipCheckInvoker: RefObject<HTMLElement | null>;
  skipPracticeInvoker: RefObject<HTMLButtonElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  fa: boolean;
  confirmSkip: () => void;
  confirmSkipToPractice: () => void;
}) {
  return (
    <>
      <Dialog
        open={!!skipQuestion}
        onOpenChange={(open) => {
          if (!open) setSkipQuestion(null);
        }}
      >
        <DialogContent
          aria-describedby="lesson-skip-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const target = skipCheckInvoker.current;
              if (target?.isConnected) target.focus({ preventScroll: true });
              else headingRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          <DialogTitle>{fa ? 'از این تمرین بگذرم؟' : 'Skip this check?'}</DialogTitle>
          <DialogDescription id="lesson-skip-description">
            {fa ? 'این تمرین به‌عنوان ردشده ثبت می‌شود.' : 'This check will be logged as skipped.'}
          </DialogDescription>
          <div className="dialog-actions">
            <Button onClick={() => setSkipQuestion(null)}>{fa ? 'انصراف' : 'Cancel'}</Button>
            <Button variant="default" className="lesson-primary-action" onClick={confirmSkip}>
              {fa ? 'رد کردن تمرین' : 'Skip check'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={skipPracticeOpen} onOpenChange={setSkipPracticeOpen}>
        <DialogContent
          aria-describedby="lesson-skip-practice-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const target = skipPracticeInvoker.current;
              if (target?.isConnected) target.focus({ preventScroll: true });
              else headingRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          <DialogTitle>{fa ? 'از درس‌نامه به تمرین پایانی بروم؟' : 'Skip to practice?'}</DialogTitle>
          <DialogDescription id="lesson-skip-practice-description">
            {fa ? 'این انتخاب برای این درس ثبت می‌شود.' : 'This choice will be recorded for this lesson.'}
          </DialogDescription>
          <div className="dialog-actions">
            <Button onClick={() => setSkipPracticeOpen(false)}>{fa ? 'ادامهٔ درس‌نامه' : 'Cancel'}</Button>
            <Button variant="default" className="lesson-primary-action" onClick={confirmSkipToPractice}>
              {fa ? 'رفتن به تمرین پایانی' : 'Skip to practice'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
