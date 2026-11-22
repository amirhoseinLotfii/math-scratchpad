import type { RefObject } from 'react';
import { Button } from '../../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';
import type { BankConfirmation } from '../hooks/use-drive-bank-panel';

export function BankConfirmationDialog({
  confirmation,
  onClose,
  onConfirm,
  cancelConfirmationRef,
  confirmationTriggerRef,
  panelRef,
}: {
  confirmation: BankConfirmation;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  cancelConfirmationRef: RefObject<HTMLButtonElement | null>;
  confirmationTriggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        aria-describedby="drive-session-confirmation-description"
        onOpenAutoFocus={event => {
          event.preventDefault();
          cancelConfirmationRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const trigger = confirmationTriggerRef.current;
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
          else panelRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle>{confirmation?.kind === 'batch' ? 'Open a new question batch?' : 'Restore this saved session?'}</DialogTitle>
        <DialogDescription id="drive-session-confirmation-description">
          {confirmation?.kind === 'batch'
            ? 'The current session will be saved in this browser and can be restored from Saved sessions.'
            : 'The current session will also be saved.'}
        </DialogDescription>
        <div className="dialog-actions">
          <Button ref={cancelConfirmationRef} onClick={onClose}>Cancel</Button>
          <Button variant="default" onClick={onConfirm}>{confirmation?.kind === 'batch' ? 'Open batch' : 'Restore session'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
