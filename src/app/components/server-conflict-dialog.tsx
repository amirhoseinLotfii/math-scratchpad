import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import type { ServerStorageConflict, ServerStorageConflictChoice } from '../../sync/server-storage';

export function ServerConflictDialog({
  conflict,
  busy,
  error,
  onResolve,
}: {
  conflict: ServerStorageConflict | null;
  busy: boolean;
  error: string;
  onResolve: (choice: ServerStorageConflictChoice) => void;
}) {
  return (
    <Dialog open={!!conflict}>
      <DialogContent
        onEscapeKeyDown={event => event.preventDefault()}
        onPointerDownOutside={event => event.preventDefault()}
      >
        <DialogTitle>
          {conflict?.key === 'math-scratchpad-session-v3'
            ? 'Session changes overlap'
            : 'Saved changes overlap'}
        </DialogTitle>
        <DialogDescription>
          This item changed on this device and on the server. Choose which version to keep.
        </DialogDescription>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <Button disabled={busy} onClick={() => onResolve('local')}>
            Keep this device’s version
          </Button>
          <Button disabled={busy} onClick={() => onResolve('remote')}>
            Use server version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
