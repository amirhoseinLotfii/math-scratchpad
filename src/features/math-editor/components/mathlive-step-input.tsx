import { createElement, useLayoutEffect, useRef } from 'react';
import { MathfieldElement } from 'mathlive';
import { mathfieldForStep, registerMathfield } from '../mathlive-adapter';

// The Node test resolver selects MathLive's SSR entry, which intentionally does
// not export the browser custom-element class. The browser build does.
if (typeof MathfieldElement !== 'undefined') MathfieldElement.fontsDirectory = null;

function fieldValue(value: string) {
  const normalized = value || String.raw`\placeholder{}`;
  // Older AST-backed drafts serialize every empty math slot as \square.
  // In MathLive these must become editable placeholders, not literal squares.
  return normalized.replaceAll(String.raw`\square`, String.raw`\placeholder{}`);
}

export function MathLiveStepInput({
  stepId,
  value,
  label,
  onInput,
  onFocusStep,
}: {
  stepId: string;
  value: string;
  label: string;
  onInput: (value: string) => void;
  onFocusStep: () => void;
}) {
  const ref = useRef<MathfieldElement>(null);
  const onInputRef = useRef(onInput);
  const onFocusRef = useRef(onFocusStep);
  const valueRef = useRef(value);
  onInputRef.current = onInput;
  onFocusRef.current = onFocusStep;
  valueRef.current = value;

  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    let disposed = false;
    let attached = false;
    const input = () => onInputRef.current(field.value);
    const focus = () => onFocusRef.current();
    const attach = () => {
      if (disposed || typeof field.executeCommand !== 'function') return;
      attached = true;
      registerMathfield(stepId, field);
      field.defaultMode = 'math';
      field.smartMode = false;
      // Keep MathLive's own floating keyboard opt-in. The app's existing keyboard
      // remains under the user's Show Keyboard control.
      field.mathVirtualKeyboardPolicy = 'manual';
      field.value = fieldValue(valueRef.current);
      if (field.value.includes('\\placeholder')) field.executeCommand('moveToNextPlaceholder');
      field.addEventListener('input', input);
      field.addEventListener('focus', focus);
    };

    // A React layout effect can run before a lazily registered custom element is
    // upgraded. Wait for MathLive so the adapter always captures the real field.
    if (typeof customElements !== 'undefined' && !customElements.get('math-field')) {
      void customElements.whenDefined('math-field').then(attach);
    } else attach();

    return () => {
      disposed = true;
      if (attached) {
        field.removeEventListener('input', input);
        field.removeEventListener('focus', focus);
        if (mathfieldForStep(stepId) === field) registerMathfield(stepId, null);
      }
    };
  }, [stepId]);

  useLayoutEffect(() => {
    const field = ref.current;
    if (!field || typeof field.executeCommand !== 'function') return;
    const next = fieldValue(value);
    if (field.value === next) return;
    const position = field.position;
    field.value = next;
    field.position = Math.min(position, field.lastOffset);
  }, [value]);

  return createElement('math-field', {
    ref,
    className: 'mathlive-step-input',
    'data-step-id': stepId,
    'aria-label': label,
    dir: 'ltr',
    lang: 'en',
    tabIndex: 0,
    'virtual-keyboard-mode': 'manual',
    spellCheck: false,
  });
}
