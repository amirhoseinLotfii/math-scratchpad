import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from 'react';
import { symbolList } from '../../../model';
import { Button } from '../../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';

const INSERT_OPTIONS = [
  { name: 'Fraction', kind: 'fraction' },
  { name: 'Number', kind: 'number' },
  { name: '√ Root', kind: 'root' },
  { name: 'Power', kind: 'power' },
  { name: 'Parentheses', kind: 'group' },
  { name: '+', kind: '+' },
  { name: '−', kind: '−' },
  { name: '×', kind: '×' },
  { name: '÷', kind: '÷' },
  { name: '=', kind: '=' },
];

export const INSERT_VISIBLE = 8;

export type MathInsertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (kind: string) => void;
  wide: boolean;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof DialogContent>['onCloseAutoFocus'];
};

/** Shared slash-triggered picker for the main practice editor and lesson step editors. */
export function MathInsertDialog({ open, onOpenChange, onInsert, wide, onCloseAutoFocus }: MathInsertDialogProps) {
  const [expanded, setExpanded] = useState(false);
  const [choice, setChoice] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const options = useMemo(() => wide
    ? [...INSERT_OPTIONS, ...symbolList.filter(item => !INSERT_OPTIONS.some(base => base.kind === item.key)).map(item => ({ name: item.title, kind: item.key }))]
    : INSERT_OPTIONS, [wide]);
  const visible = expanded ? options : options.slice(0, INSERT_VISIBLE);

  useEffect(() => {
    if (open) {
      setChoice(0);
      setExpanded(false);
    }
  }, [open]);
  useEffect(() => { setChoice(0); }, [wide]);
  useEffect(() => {
    if (!open) return;
    const button = refs.current[choice];
    button?.focus({ preventScroll: true });
    button?.scrollIntoView?.({ block: 'nearest' });
  }, [choice, open, visible.length]);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    const size = visible.length;
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const delta = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 } as Record<string, number>)[event.key];
      setChoice(current => (current + delta + size) % size);
    } else if ((event.key === 'Home' || event.key === 'End') && (event.target as HTMLElement).hasAttribute('data-insert-kind')) {
      event.preventDefault();
      setChoice(event.key === 'Home' ? 0 : size - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).hasAttribute('data-insert-kind')) {
      event.preventDefault();
      onInsert((event.target as HTMLElement).getAttribute('data-insert-kind')!);
      onOpenChange(false);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(at + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="insert-dialog"
        onOpenAutoFocus={event => {
          event.preventDefault();
          const first = refs.current[0];
          if (first?.isConnected) first.focus({ preventScroll: true });
          else requestAnimationFrame(() => refs.current[0]?.focus({ preventScroll: true }));
        }}
        onKeyDown={handleKeys}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle>Insert Math Element</DialogTitle>
        <DialogDescription>/ opens · Arrows choose · Enter inserts · Tab moves focus · Escape closes</DialogDescription>
        <div className="insert-options" id="insert-options">
          {visible.map((option, index) => (
            <Button
              key={option.kind}
              data-insert-kind={option.kind}
              ref={element => { refs.current[index] = element; }}
              aria-pressed={choice === index}
              onFocus={() => setChoice(index)}
              onClick={() => { onInsert(option.kind); onOpenChange(false); }}
            >
              {option.name}
            </Button>
          ))}
        </div>
        {options.length > INSERT_VISIBLE && (
          <Button
            className="insert-more"
            aria-expanded={expanded}
            aria-controls="insert-options"
            onClick={() => {
              setExpanded(!expanded);
              if (expanded && choice >= INSERT_VISIBLE) setChoice(0);
            }}
          >
            {expanded ? 'Show fewer' : 'Show more (' + (options.length - INSERT_VISIBLE) + ')'}
          </Button>
        )}
        <Button onClick={() => onOpenChange(false)}>Cancel · Esc</Button>
      </DialogContent>
    </Dialog>
  );
}
