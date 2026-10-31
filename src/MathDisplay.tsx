import { createElement } from 'react';
import 'mathlive';
import 'mathlive/fonts.css';
import 'mathlive/static.css';

/** Read-only mathematical rendering shared by questions, lesson blocks, and reference content. */
export function MathDisplay({ latex, label = 'Mathematical expression', display = true }: { latex: string; label?: string; display?: boolean }) {
  const tag = display ? 'math-div' : 'math-span';
  return createElement(tag, {
    className: `math-display ${display ? 'math-display-block' : 'math-display-inline'}`,
    dir: 'ltr',
    role: 'math',
    'aria-label': label,
    format: 'latex',
  }, latex);
}
