import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import { RotateCcw, Trash2, Copy, ChevronDown, ChevronRight, Download, Upload, HelpCircle, BookOpen, Cloud } from 'lucide-react';
import type { SessionMeta } from '../model';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '../shared/ui/dropdown-menu';
import { isServerStorageActive } from '../sync/browser-db';
import type { ExerciseMenuActions } from './exercise-menu';
type Section = 'practice' | 'data' | null;
export function ExerciseMenuMore({
  a,
  setMenu,
  session,
  sessionDetailsOpen,
  setSessionDetailsOpen,
  compactMenu,
  inlineMenuSubmenu,
  setInlineMenuSubmenu,
  inlineMenuHover,
}: {
  a: ExerciseMenuActions;
  setMenu: (open: boolean) => void;
  session?: SessionMeta;
  sessionDetailsOpen: boolean;
  setSessionDetailsOpen: Dispatch<SetStateAction<boolean>>;
  compactMenu: boolean;
  inlineMenuSubmenu: Section;
  setInlineMenuSubmenu: Dispatch<SetStateAction<Section>>;
  inlineMenuHover: RefObject<Section>;
}) {
  const practiceMenuActions = (
    <>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onStartFractions();
        }}
      >
        Start Round 1 · 20 fraction questions
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onStartDiagnostic();
        }}
      >
        Start 30-question diagnostic
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onUseExample();
        }}
      >
        Use example
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onUseCurrentExpression();
        }}
      >
        Use current expression as new problem
      </DropdownMenuItem>
    </>
  );
  const dataMenuActions = (
    <>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onCopySession();
        }}
      >
        <Copy aria-hidden="true" />
        <span>
          Copy full session JSON<span className="small menu-description">All questions, answers, steps &amp; session data</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onDownloadBackup();
        }}
      >
        <Download aria-hidden="true" />
        Download backup file
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onImportFile();
        }}
      >
        <Upload aria-hidden="true" />
        Import backup file
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onImportJson();
        }}
      >
        <Upload aria-hidden="true" />
        Import session JSON
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setMenu(false);
          a.onOpenSync();
        }}
      >
        <Cloud aria-hidden="true" />
        Cloud sync and migration
      </DropdownMenuItem>
    </>
  );
  return (
    <div id="more-notebook-actions" className="menu-more-content">
      <DropdownMenuLabel className="menu-section-heading">Session</DropdownMenuLabel>
      <DropdownMenuItem
        className="menu-disclosure"
        aria-expanded={sessionDetailsOpen}
        aria-controls={sessionDetailsOpen ? 'session-details-info' : undefined}
        onSelect={(event) => {
          event.preventDefault();
          setSessionDetailsOpen((value) => !value);
        }}
      >
        <BookOpen aria-hidden="true" />
        <span>Session details</span>
        <ChevronDown className={sessionDetailsOpen ? 'menu-chevron menu-chevron-open' : 'menu-chevron'} aria-hidden="true" />
      </DropdownMenuItem>
      {sessionDetailsOpen && (
        <div id="session-details-info" role="group" aria-label="Session details" className="session-details-panel">
          <p className="menu-info-value">
            <span>Session ID</span>
            <span dir="ltr">{session?.id ?? '—'}</span>
          </p>
          <p className="menu-info-value">
            <span>Math anxiety</span>
            <span>{session?.anxiety ?? 'Not set'}</span>
          </p>
          <p className="menu-info-value">
            <span>Energy</span>
            <span>{session?.energy ?? 'Not set'}</span>
          </p>
          <DropdownMenuItem onSelect={a.onEditScales}>Change</DropdownMenuItem>
        </div>
      )}
      <DropdownMenuItem onSelect={a.onEndSession}>End session (record end time)</DropdownMenuItem>
      <DropdownMenuItem className="menu-danger" onSelect={a.onResetSession}>
        <RotateCcw aria-hidden="true" />
        Reset current session
      </DropdownMenuItem>

      {compactMenu ? (
        <>
          <DropdownMenuItem
            className="menu-disclosure"
            aria-expanded={inlineMenuSubmenu === 'practice'}
            aria-controls={inlineMenuSubmenu === 'practice' ? 'mobile-practice-actions' : undefined}
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse') {
                inlineMenuHover.current = 'practice';
                setInlineMenuSubmenu('practice');
              } else inlineMenuHover.current = null;
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== 'mouse') return;
              if (inlineMenuHover.current === 'practice') inlineMenuHover.current = null;
              // This inline disclosure is part of the same menu. Prevent Radix from
              // dropping focus to the menu root while scrolling into its child items.
              if (inlineMenuSubmenu === 'practice') event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                setInlineMenuSubmenu('practice');
              } else if (event.key === 'ArrowLeft' && inlineMenuSubmenu === 'practice') {
                event.preventDefault();
                inlineMenuHover.current = null;
                setInlineMenuSubmenu(null);
              }
            }}
            onSelect={(event) => {
              event.preventDefault();
              if (inlineMenuHover.current === 'practice') {
                inlineMenuHover.current = null;
                setInlineMenuSubmenu('practice');
              } else {
                inlineMenuHover.current = null;
                setInlineMenuSubmenu((value) => (value === 'practice' ? null : 'practice'));
              }
            }}
          >
            <span>Practice</span>
            <ChevronDown
              className={inlineMenuSubmenu === 'practice' ? 'menu-chevron menu-chevron-open' : 'menu-chevron'}
              aria-hidden="true"
            />
          </DropdownMenuItem>
          {inlineMenuSubmenu === 'practice' && (
            <div id="mobile-practice-actions" role="group" aria-label="Practice actions" className="dropdown-sub-content-inline">
              {practiceMenuActions}
            </div>
          )}
          <DropdownMenuItem
            className="menu-disclosure"
            aria-expanded={inlineMenuSubmenu === 'data'}
            aria-controls={inlineMenuSubmenu === 'data' ? 'mobile-data-actions' : undefined}
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse') {
                inlineMenuHover.current = 'data';
                setInlineMenuSubmenu('data');
              } else inlineMenuHover.current = null;
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== 'mouse') return;
              if (inlineMenuHover.current === 'data') inlineMenuHover.current = null;
              // Keep focus in an expanded inline group when the pointer leaves its trigger.
              if (inlineMenuSubmenu === 'data') event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                setInlineMenuSubmenu('data');
              } else if (event.key === 'ArrowLeft' && inlineMenuSubmenu === 'data') {
                event.preventDefault();
                inlineMenuHover.current = null;
                setInlineMenuSubmenu(null);
              }
            }}
            onSelect={(event) => {
              event.preventDefault();
              if (inlineMenuHover.current === 'data') {
                inlineMenuHover.current = null;
                setInlineMenuSubmenu('data');
              } else {
                inlineMenuHover.current = null;
                setInlineMenuSubmenu((value) => (value === 'data' ? null : 'data'));
              }
            }}
          >
            <span>Data</span>
            <ChevronDown className={inlineMenuSubmenu === 'data' ? 'menu-chevron menu-chevron-open' : 'menu-chevron'} aria-hidden="true" />
          </DropdownMenuItem>
          {inlineMenuSubmenu === 'data' && (
            <div id="mobile-data-actions" role="group" aria-label="Data actions" className="dropdown-sub-content-inline">
              {dataMenuActions}
            </div>
          )}
        </>
      ) : (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Practice
              <ChevronRight aria-hidden="true" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent aria-label="Practice actions">{practiceMenuActions}</DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Data
              <ChevronRight aria-hidden="true" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent aria-label="Data actions">{dataMenuActions}</DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      )}

      <DropdownMenuLabel className="menu-section-heading">Help</DropdownMenuLabel>
      <DropdownMenuItem onSelect={a.onShortcuts}>
        <HelpCircle aria-hidden="true" />
        Keyboard shortcuts
      </DropdownMenuItem>

      <DropdownMenuLabel className="menu-section-heading danger-heading">Danger zone</DropdownMenuLabel>
      {isServerStorageActive() ? (
        <DropdownMenuItem className="menu-danger" onSelect={a.onCloudPreview}>
          <Trash2 aria-hidden="true" />
          <span>
            Preview cloud reset impact
            <span className="small menu-description">Read-only verification; no data is deleted and the question bank is protected.</span>
          </span>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem className="menu-danger" onSelect={a.onResetAll}>
          <Trash2 aria-hidden="true" />
          Reset all local storage
        </DropdownMenuItem>
      )}
    </div>
  );
}
