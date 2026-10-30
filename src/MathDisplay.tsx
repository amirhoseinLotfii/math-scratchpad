import { useId, useMemo } from 'react';
import { Formula } from './Formula';
import { parse } from './parser';
import { Provider } from './app/store-provider';
import { initialState, makeStore } from './store';
import { parseLessonNotation, type LessonNotationPart } from './features/lessons/lesson-notation';
import type { Sequence } from './model';

function StaticFormula({ expression, stepId, label, display }: { expression: Sequence; stepId: string; label: string; display: boolean }) {
  const store = useMemo(() => makeStore(initialState()), []);
  return <span className={`math-display ${display ? 'math-display-block' : 'math-display-inline'}`} dir="ltr" role="math" aria-label={label}>
    <Provider store={store}><Formula sequence={expression} stepId={stepId} path={label} top readOnly /></Provider>
  </span>;
}

function NotationPart({ part, stepId, label, display }: { part: LessonNotationPart; stepId: string; label: string; display: boolean }) {
  if (part.type === 'formula') return <StaticFormula expression={part.expression} stepId={stepId} label={label} display={display} />;
  if (part.type === 'root') return <span className="math-display-root" aria-label={`${part.degree} root of ${part.radicand}`}><sup>{part.degree}</sup>√<i>{part.radicand}</i></span>;
  return <bdi className="math-display-text" dir="ltr">{part.text}</bdi>;
}

/** Read-only renderer for the app's bounded notation. Unknown syntax remains visible as source. */
export function MathDisplay({ latex, label = 'Mathematical expression', display = true }: { latex: string; label?: string; display?: boolean }) {
  const id = useId();
  const parsed = useMemo(() => {
    try { return { expression: parse(latex), notation: null as LessonNotationPart[] | null }; }
    catch {
      return { expression: null, notation: parseLessonNotation(latex) };
    }
  }, [latex]);

  if (parsed.expression) return <StaticFormula expression={parsed.expression} stepId={`math-display-${id}`} label={label} display={display} />;
  if (parsed.notation?.length) return <span className={`math-display ${display ? 'math-display-block' : 'math-display-inline'}`} dir="ltr" role="math" aria-label={label}>
    {parsed.notation.map((part, index) => <NotationPart key={index} part={part} stepId={`math-display-${id}-${index}`} label={label} display={display} />)}
  </span>;

  return <span className="math-display-fallback" role="note" dir="ltr">
    <span className="math-display-fallback-label">Formula preview unavailable. Original notation:</span>
    <code>{latex}</code>
  </span>;
}
