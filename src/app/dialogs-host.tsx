import { useRef, type RefObject } from 'react';
import { useAppDispatch, useAppStore } from '../hooks';
import { actions } from '../store';
import type { Exercise, SessionMeta } from '../model';
import { Button } from '../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../shared/ui/dialog';
import { ConfidenceDialog } from '../features/session/components/confidence-dialog';
import { CompletionDialog } from '../features/session/components/completion-dialog';
import { SessionScales } from '../features/session/components/session-panel';
import { ShortcutHelp } from '../features/workspace/components/shortcut-help';
import { MathInsertDialog, type MathInsertDialogProps } from '../features/math-editor/components/math-insert-dialog';
import type { ServerStorageConflict, ServerStorageConflictChoice } from '../sync/server-storage';
import type { useWellbeing } from './use-wellbeing';

export type ResetKind = 'session' | 'all';

/** Session-level modal dialogs that sit outside the workspace: shortcuts, export/reset confirmations, wellbeing, confidence, completion, math insert and draft conflict. */
export function DialogsHost({ menuInvokerRef, focusEditor, session, shortcuts, exportWarning, reset, sessionImport, wellbeing, confidence, completion, insert, storageConflict, serverConflict }: {
 menuInvokerRef: RefObject<HTMLButtonElement | null>;
 focusEditor: () => void;
 session: SessionMeta | undefined;
 shortcuts: { open: boolean; setOpen: (open: boolean) => void };
 exportWarning: { questions: number[] | null; dismiss: () => void; exportAnyway: () => void };
 reset: { kind: ResetKind | null; cancel: () => void; downloadBackup: () => void; confirm: () => void };
 sessionImport: { source: string; currentExercises: number; incomingExercises: number; cancel: () => void; confirm: () => void } | null;
 wellbeing: ReturnType<typeof useWellbeing>;
 confidence: { open: boolean; initial: Exercise['confidence']; invoker: HTMLElement | null; onCancel: () => void; onConfirm: (value: 'low' | 'medium' | 'high') => void };
 completion: { open: boolean; totalQuestions: number; answeredQuestions: number; skippedQuestions: number; draftQuestions: number; onClose: () => void; onReview: () => void; onCopy: () => void; onAnalyze: () => void };
 insert: MathInsertDialogProps;
 storageConflict: boolean;
 serverConflict: {
  conflict: ServerStorageConflict | null;
  busy: boolean;
  error: string;
  onResolve: (choice: ServerStorageConflictChoice) => void;
 };
}) {
 const store = useAppStore(), dispatch = useAppDispatch();
 const resetCancelRef = useRef<HTMLButtonElement>(null), importCancelRef = useRef<HTMLButtonElement>(null);
 const menuInvoker = menuInvokerRef, resetKind = reset.kind;
 return <>
  <Dialog open={shortcuts.open} onOpenChange={shortcuts.setOpen}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); menuInvoker.current?.focus({preventScroll:true}); }}><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Use your physical keyboard in the math editor. Tab moves between controls; arrow keys edit within numbers and fields.</DialogDescription><ShortcutHelp /><Button onClick={() => shortcuts.setOpen(false)}>Close</Button></DialogContent></Dialog>
  <Dialog open={!!exportWarning.questions} onOpenChange={value => { if (!value) exportWarning.dismiss(); }}><DialogContent><DialogTitle>Final answer missing</DialogTitle><DialogDescription>These questions have work but no marked final answer: {exportWarning.questions?.map(n => `Q${n}`).join(', ')}. Mark a final step so your tutor can verify the result.</DialogDescription><div className="dialog-actions"><Button variant="default" onClick={exportWarning.dismiss}>Go back and mark</Button><Button onClick={exportWarning.exportAnyway}>Export anyway</Button></div></DialogContent></Dialog>
  <Dialog open={!!sessionImport} onOpenChange={value => { if (!value) sessionImport?.cancel(); }}><DialogContent onOpenAutoFocus={event => { event.preventDefault(); importCancelRef.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true })); }}><DialogTitle>Replace current session?</DialogTitle><DialogDescription>{sessionImport?.source} contains {sessionImport?.incomingExercises} exercises and will replace the {sessionImport?.currentExercises} exercises in this browser session. You can undo this replacement until the imported session changes or this page reloads.</DialogDescription><div className="dialog-actions"><Button ref={importCancelRef} onClick={() => sessionImport?.cancel()}>Keep current work</Button><Button variant="danger" onClick={() => sessionImport?.confirm()}>Replace session</Button></div></DialogContent></Dialog>
  <Dialog open={!!resetKind} onOpenChange={value => { if (!value) reset.cancel(); }}><DialogContent onOpenAutoFocus={event => { event.preventDefault(); resetCancelRef.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => menuInvoker.current?.focus({ preventScroll: true })); }}><DialogTitle>{resetKind === 'all' ? 'Reset all local storage?' : 'Reset current session?'}</DialogTitle><DialogDescription>{resetKind === 'all' ? 'This deletes every saved draft, preference and session of this app in this browser. Download a backup first.' : 'This clears all questions and answers of the current session and starts a new one. Download a backup first.'}</DialogDescription><div className="dialog-actions"><Button ref={resetCancelRef} onClick={reset.cancel}>Cancel</Button><Button onClick={reset.downloadBackup}>Download backup</Button><Button variant="danger" onClick={reset.confirm}>{resetKind === 'all' ? 'Delete everything' : 'Reset session'}</Button></div></DialogContent></Dialog>
  <Dialog open={wellbeing.askWellbeing} onOpenChange={value => { if (!value) wellbeing.close(); }}><DialogContent className="wellbeing-dialog" aria-describedby="wellbeing-desc" onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { if (wellbeing.editingScales) menuInvoker.current?.focus({ preventScroll: true }); else focusEditor(); }); }}><DialogTitle>{wellbeing.editingScales ? 'Change session ratings' : 'Before you start this batch'}</DialogTitle><DialogDescription id="wellbeing-desc">Optional. You can change this later.</DialogDescription>
   <SessionScales meta={session} onMeta={value => dispatch(actions.setSessionMeta(value))} />
   <div className="dialog-actions"><Button onClick={wellbeing.dismiss}>Skip for now</Button><Button variant="default" onClick={wellbeing.dismiss}>Start</Button></div></DialogContent></Dialog>
  <ConfidenceDialog open={confidence.open} initial={confidence.initial} onCancel={confidence.onCancel} onConfirm={confidence.onConfirm} invoker={confidence.invoker} />
  <CompletionDialog totalQuestions={completion.totalQuestions} answeredQuestions={completion.answeredQuestions} skippedQuestions={completion.skippedQuestions} draftQuestions={completion.draftQuestions} open={completion.open} onClose={completion.onClose} onReview={completion.onReview} onCopy={completion.onCopy} onAnalyze={completion.onAnalyze} />
  <MathInsertDialog
   open={insert.open}
   onOpenChange={insert.onOpenChange}
   wide={insert.wide}
   onInsert={insert.onInsert}
   onCloseAutoFocus={insert.onCloseAutoFocus}
  />
  <Dialog open={storageConflict && !serverConflict.conflict}><DialogContent onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}><DialogTitle>Draft conflict</DialogTitle><DialogDescription>Another tab saved a newer draft. Keep your unsaved work or use the saved draft.</DialogDescription><div className="dialog-actions"><Button onClick={() => store.resolveConflict?.('local')}>Keep this tab</Button><Button onClick={() => store.resolveConflict?.('remote')}>Use saved draft</Button></div></DialogContent></Dialog>
  <Dialog open={!!serverConflict.conflict}><DialogContent onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}>
   <DialogTitle>{serverConflict.conflict?.key === 'math-scratchpad-session-v3' ? 'Session changes overlap' : 'Saved changes overlap'}</DialogTitle>
   <DialogDescription>This item changed on this device and on the server. Choose which version to keep.</DialogDescription>
   {serverConflict.error && <p role="alert">{serverConflict.error}</p>}
   <div className="dialog-actions">
    <Button disabled={serverConflict.busy} onClick={() => serverConflict.onResolve('local')}>Keep this device’s version</Button>
    <Button disabled={serverConflict.busy} onClick={() => serverConflict.onResolve('remote')}>Use server version</Button>
   </div>
  </DialogContent></Dialog>
 </>;
}
