import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import { type ArchivedSession } from './drive-bank';

import type { RefObject } from 'react';
export type BankConfirmation = { kind: 'batch' } | { kind: 'restore'; saved: ArchivedSession };

export function BankSessionConfirmation({
  confirmation,
  setConfirmation,
  cancelConfirmation,
  confirmationTrigger,
  panel,
  confirmRequestedAction,
}: {
  confirmation: BankConfirmation | null;
  setConfirmation: (value: BankConfirmation | null) => void;
  cancelConfirmation: RefObject<HTMLButtonElement | null>;
  confirmationTrigger: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
  confirmRequestedAction: () => Promise<void>;
}) {
  return (
    <Dialog
      open={!!confirmation}
      onOpenChange={(open) => {
        if (!open) setConfirmation(null);
      }}
    >
      <DialogContent
        aria-describedby="drive-session-confirmation-description"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelConfirmation.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const trigger = confirmationTrigger.current;
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
          else panel.current?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle>{confirmation?.kind === 'batch' ? 'Open a new question batch?' : 'Restore this saved session?'}</DialogTitle>
        <DialogDescription id="drive-session-confirmation-description">
          {confirmation?.kind === 'batch'
            ? 'The current session will be saved in this browser and can be restored from Saved sessions.'
            : 'The current session will also be saved.'}
        </DialogDescription>
        <div className="dialog-actions">
          <Button ref={cancelConfirmation} onClick={() => setConfirmation(null)}>
            Cancel
          </Button>
          <Button variant="default" onClick={confirmRequestedAction}>
            {confirmation?.kind === 'batch' ? 'Open batch' : 'Restore session'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
