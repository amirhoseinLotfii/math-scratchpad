import { vi } from 'vitest';
/**
 * Most legacy suites start batches and drive the editor directly. The once-per-batch
 * anxiety/energy prompt is a modal, so it is treated as already answered unless a test
 * opts in with globalThis.__askWellbeing = true (see tests/ux-batch/*.test.tsx).
 */
vi.mock('../../src/shared/lib/ui-prefs', async importOriginal => {
  const real = await importOriginal<typeof import('../../src/shared/lib/ui-prefs')>();
  return { ...real, wellbeingAsked: (id: string) => (globalThis as { __askWellbeing?: boolean }).__askWellbeing ? real.wellbeingAsked(id) : true };
});

/** MathLive resolves its documented SSR entry under Vitest's Node conditions.
 * Keep component/store tests focused on our adapter contract; Playwright covers
 * the real browser custom element and editing behavior. */
if (typeof customElements !== 'undefined' && !customElements.get('math-field')) {
  class TestMathfield extends HTMLElement {
    defaultMode = 'math';
    smartMode = false;
    mathVirtualKeyboardPolicy = 'manual';
    selection: [number, number] = [0, 0];
    private currentValue = '';
    private undoStack: string[] = [];
    private redoStack: string[] = [];
    position = 0;
    focus() { super.focus(); }
    hasFocus() { return document.activeElement === this; }
    get value() { return this.currentValue; }
    set value(value: string) { this.currentValue = value; this.position = Math.min(this.position, this.lastOffset); }
    get lastOffset() { return this.currentValue.length; }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    connectedCallback() { this.addEventListener('keydown', this.keydown); }
    disconnectedCallback() { this.removeEventListener('keydown', this.keydown); }
    private emitInput() { this.dispatchEvent(new Event('input', { bubbles: true })); }
    private saveUndo() { this.undoStack.push(this.currentValue); this.redoStack = []; }
    private keydown = (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.defaultPrevented) return;
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === 'a') {
        keyEvent.preventDefault(); this.selection = [0, this.lastOffset]; this.position = this.lastOffset; return;
      }
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === 'z') {
        keyEvent.preventDefault(); this.executeCommand(keyEvent.shiftKey ? 'redo' : 'undo'); return;
      }
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === 'y') {
        keyEvent.preventDefault(); this.executeCommand('redo'); return;
      }
      if (keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowRight') {
        const step = keyEvent.key === 'ArrowLeft' ? -1 : 1;
        this.position = Math.max(0, Math.min(this.lastOffset, this.position + step)); this.selection = [this.position, this.position]; return;
      }
      if (keyEvent.key === 'Backspace' || keyEvent.key === 'Delete') {
        this.saveUndo();
        const [start, end] = this.selection;
        if (start !== end) { this.currentValue = this.currentValue.slice(0, start) + this.currentValue.slice(end); this.position = start; }
        else if (keyEvent.key === 'Backspace' && this.position > 0) { this.currentValue = this.currentValue.slice(0, this.position - 1) + this.currentValue.slice(this.position); this.position--; }
        else if (keyEvent.key === 'Delete') this.currentValue = this.currentValue.slice(0, this.position) + this.currentValue.slice(this.position + 1);
        this.selection = [this.position, this.position]; this.emitInput(); return;
      }
      if (keyEvent.key.length === 1 && !keyEvent.ctrlKey && !keyEvent.metaKey && !keyEvent.altKey) this.insert(keyEvent.key);
    };
    insert(latex: string, options?: { selectionMode?: string }) {
      this.saveUndo();
      let start = this.position, end = this.position;
      const placeholder = '\\placeholder{}';
      const candidate = this.currentValue.indexOf(placeholder, this.position);
      if (options?.selectionMode === 'placeholder' && candidate >= 0) { start = candidate; end = candidate + placeholder.length; }
      else if (this.selection[0] !== this.selection[1]) [start, end] = this.selection;
      else if (latex.length === 1 && this.currentValue.slice(this.position).startsWith(placeholder)) { end = start + placeholder.length; }
      this.currentValue = this.currentValue.slice(0, start) + latex + this.currentValue.slice(end);
      this.position = start + latex.length; this.selection = [this.position, this.position];
      if (options?.selectionMode === 'placeholder') {
        const next = this.currentValue.indexOf(placeholder, start + latex.length);
        if (next >= 0) { this.position = next; this.selection = [next, next]; }
        else {
          const inserted = this.currentValue.indexOf(placeholder, start);
          if (inserted >= 0) { this.position = inserted; this.selection = [inserted, inserted]; }
        }
      }
      this.emitInput();
    }
    executeCommand(command: string) {
      if (command === 'undo' && this.undoStack.length) {
        this.redoStack.push(this.currentValue); this.currentValue = this.undoStack.pop()!; this.position = Math.min(this.position, this.lastOffset); this.selection = [this.position, this.position]; this.emitInput();
      } else if (command === 'redo' && this.redoStack.length) {
        this.undoStack.push(this.currentValue); this.currentValue = this.redoStack.pop()!; this.position = Math.min(this.position, this.lastOffset); this.selection = [this.position, this.position]; this.emitInput();
      } else if (command === 'deleteBackward' || command === 'deleteForward') {
        const [start, end] = this.selection;
        if (start !== end) {
          this.saveUndo(); this.currentValue = this.currentValue.slice(0, start) + this.currentValue.slice(end);
          this.position = start; this.selection = [start, start]; this.emitInput();
        } else if (command === 'deleteBackward' && this.position > 0) {
          this.saveUndo(); this.currentValue = this.currentValue.slice(0, this.position - 1) + this.currentValue.slice(this.position);
          this.position--; this.selection = [this.position, this.position]; this.emitInput();
        } else if (command === 'deleteForward' && this.position < this.lastOffset) {
          this.saveUndo(); this.currentValue = this.currentValue.slice(0, this.position) + this.currentValue.slice(this.position + 1);
          this.selection = [this.position, this.position]; this.emitInput();
        }
      } else if (command === 'selectAll') {
        this.selection = [0, this.lastOffset]; this.position = this.lastOffset;
      } else if (command === 'moveToNextPlaceholder') {
        const placeholder = '\\placeholder{}';
        const atCurrent = this.currentValue.slice(this.position).startsWith(placeholder);
        let next = this.currentValue.indexOf(placeholder, this.position + (atCurrent ? placeholder.length : 0));
        if (next < 0) next = this.currentValue.indexOf('\\placeholder{}');
        if (next >= 0) { this.position = next; this.selection = [next, next]; }
      } else if (command === 'moveToNextChar') this.position = Math.min(this.lastOffset, this.position + 1);
      else if (command === 'moveToPreviousChar') this.position = Math.max(0, this.position - 1);
    }
    getValue(_selection: [number, number], _format: string) { return ''; }
  }
  customElements.define('math-field', TestMathfield);
}
