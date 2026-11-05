import { createElement } from 'react';
import 'mathlive';
import 'mathlive/fonts.css';
import 'mathlive/static.css';

/** Read-only mathematical rendering shared by questions, lesson blocks, and reference content. */
export function MathDisplay({ latex, label = 'Mathematical expression', display = true }: { latex: string; label?: string; display?: boolean }) {
  const tag = display ? 'math-div' : 'math-span';
  // MathLive renders <math-div>/<math-span> once on connection. A changed React
  // text child does not refresh its shadow DOM: remount for each new expression.
  return createElement(tag, {
    key: `${tag}:${latex}`,
    className: `math-display ${display ? 'math-display-block' : 'math-display-inline'}`,
    dir: 'ltr',
    role: 'math',
    'aria-label': label,
    format: 'latex',
  }, latex);
}
