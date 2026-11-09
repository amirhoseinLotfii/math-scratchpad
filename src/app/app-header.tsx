import type { ReactNode } from 'react';
import { Keyboard as KeyboardIcon } from 'lucide-react';
import { Button } from '../shared/ui/button';
import type { ScratchState } from '../store';
import type { SyncStatus } from '../sync/runtime';

/** App title bar: batch progress, save/sync indicator, keyboard toggle and the exercise menu (passed as `children`). */
export function AppHeader({ batch, answeredCount, skippedCount, totalQuestions, savedAt, storageState, syncStatus, showKeyboardToggle, keyboardOpen, onToggleKeyboard, children }: {
 batch: boolean; answeredCount: number; skippedCount: number; totalQuestions: number; savedAt: ScratchState['savedAt']; storageState: ScratchState['storageState'];
 syncStatus: Pick<SyncStatus, 'phase' | 'pending' | 'lastSyncedAt'>; showKeyboardToggle: boolean; keyboardOpen: boolean; onToggleKeyboard: () => void; children: ReactNode;
}) {
 return <header className="app-header"><div className="brand"><h1>Math Scratchpad</h1></div>
  {batch && <p className="header-progress small" role="status" aria-live="polite" aria-label={`${answeredCount} of ${totalQuestions} practice questions answered${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`}><span className="header-progress-copy">{answeredCount} of {totalQuestions} practice questions answered{skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}</span><span className="header-progress-track" role="progressbar" aria-label="Practice questions answered" aria-valuemin={0} aria-valuemax={totalQuestions} aria-valuenow={answeredCount}><span style={{ width: `${answeredCount / totalQuestions * 100}%` }} /></span></p>}<div className="header-actions"><span className="local-draft-label save-indicator" role="status" aria-live="polite" title={savedAt ? `Browser cache updated at ${savedAt}` : undefined}>{storageState ? storageState.kind === 'error' ? 'Storage unavailable' : 'Draft conflict' : syncStatus.pending > 0 ? `Queued ${syncStatus.pending}` : syncStatus.phase === 'syncing' ? 'Syncing…' : syncStatus.phase === 'synced' && (!savedAt || Date.parse(syncStatus.lastSyncedAt ?? '') >= Date.parse(savedAt)) ? 'Synced ✓' : savedAt ? 'Browser cache' : 'Waiting for sync'}</span>
   {showKeyboardToggle && <Button className="keyboard-toggle" aria-label={keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'} aria-expanded={keyboardOpen} onClick={onToggleKeyboard}><KeyboardIcon aria-hidden="true" /><span>{keyboardOpen ? 'Hide Keyboard' : 'Show Keyboard'}</span></Button>}
   {children}
  </div></header>;
}
