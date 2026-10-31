import { Fragment, useId, useMemo, useState } from 'react';
import { MathDisplay } from '../../MathDisplay';
import { Button } from '../../shared/ui/button';
import { parseLessonTable } from './lesson-table';
import { splitLessonText } from './lesson-notation';
import type { Concept, ExampleBlock, LessonBlock, Lang } from './types';

export function languageForText(text: string, lang?: Lang): Lang | undefined {
  if (lang) return lang;
  if (/[\u0600-\u06ff]/.test(text)) return 'fa';
  return /[A-Za-z]/.test(text) ? 'en' : undefined;
}

export function contentDirection(text: string, lang?: Lang): 'rtl' | 'ltr' | 'auto' {
  const value = languageForText(text, lang);
  return value === 'fa' ? 'rtl' : value === 'en' ? 'ltr' : 'auto';
}

/** Keep a Persian educational heading concise when bank data repeats its English title in parentheses. */
export function displayEducationalHeading(text: string, lang?: Lang): string {
  if (languageForText(text, lang) !== 'fa') return text;
  const match = text.match(/^(.*[\u0600-\u06ff].*?)\s+\(([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)+)\)\s*$/u);
  return match?.[1]?.trim() || text;
}

export function LessonText({ text, lang }: { text: string; lang?: Lang }) {
  const textLang = languageForText(text, lang);
  return <>{splitLessonText(text).map((part, partIndex) => {
    if (part.type === 'math') return <bdi className="lesson-inline-math" key={`math-${partIndex}`} dir="ltr"><MathDisplay latex={part.latex} display={false} /></bdi>;
    if (textLang !== 'fa') return part.text;
    // Keep a complete Latin phrase (including its spaces and punctuation) in one
    // isolate. Word-by-word isolates make bidi resolution reorder spaces and brackets.
    const latinRun = /[([{]?[A-Za-z0-9](?:[A-Za-z0-9 \t.,:;!?\u0027’“”()[\]{}<>/+=\-–—]*[A-Za-z0-9)\]}])?/g;
    const pieces: React.ReactNode[] = [];
    let at = 0, runIndex = 0;
    for (const match of part.text.matchAll(latinRun)) {
      if (match.index > at) pieces.push(part.text.slice(at, match.index));
      pieces.push(<bdi key={`latin-${partIndex}-${runIndex++}`} lang="en" dir="ltr">{match[0]}</bdi>);
      at = match.index + match[0].length;
    }
    if (at < part.text.length || !pieces.length) pieces.push(part.text.slice(at));
    return <Fragment key={`part-${partIndex}`}>{pieces}</Fragment>;
  })}</>;
}

function TableCell({ value }: { value: string }) {
  const text = value.match(/^\\text\{([^{}]*)\}$/)?.[1] ?? (/^[^\\{}_^]+$/.test(value) ? value.replace(/\\ /g, ' ') : null);
  return text !== null
    ? <bdi dir="auto">{text}</bdi>
    : <MathDisplay latex={value} label="Mathematical table entry" display={false} />;
}

export function isRedundantOpeningHeading(concept: Concept, block: LessonBlock, index: number): boolean {
  return index === 0 && block.type === 'heading'
    && block.text.trim().replace(/\s+/g, ' ') === concept.title.trim().replace(/\s+/g, ' ');
}

export function LessonMath({ latex, label }: { latex: string; label: string }) {
  const table = useMemo(() => parseLessonTable(latex), [latex]);
  if (table) return <div className="lesson-table-scroll" role="region" aria-label="Lesson table" tabIndex={0} dir="ltr">
    <table>{table.hasColumnHeaders && <thead><tr>{table.rows[0].map((cell, index) => <th key={index} scope="col"><TableCell value={cell} /></th>)}</tr></thead>}
      <tbody>{table.rows.slice(table.hasColumnHeaders ? 1 : 0).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}><TableCell value={cell} /></td>)}</tr>)}</tbody>
    </table>
  </div>;
  return <div className="lesson-formula" dir="ltr" data-math-label={label}>
    <MathDisplay latex={latex} label={label} />
  </div>;
}

function LessonExample({ block, blockKey, revealed, onReveal }: {
  block: ExampleBlock; blockKey: string; revealed: number; onReveal: (value: number) => void;
}) {
  const id = useId();
  const count = Math.min(block.steps.length, Math.max(0, revealed));
  return <section className="lesson-block lesson-example" aria-label={block.title || 'Worked example'}>
    {block.title && <h4 lang={languageForText(block.title, block.lang)} dir={contentDirection(block.title, block.lang)}><LessonText text={displayEducationalHeading(block.title, block.lang)} lang={block.lang} /></h4>}
    {block.text && <p lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></p>}
    {block.latex && <LessonMath latex={block.latex} label={block.title || 'Worked example'} />}
    {block.steps.length > 0 && <p className="lesson-example-progress" aria-live="polite">
      {count === 0 ? 'Try it yourself first' : count === block.steps.length ? `All ${count} steps shown` : `${count} of ${block.steps.length} steps shown`}
    </p>}
    <div className="lesson-example-steps" id={`${id}-steps`}>
      {block.steps.slice(0, count).map((step, index) => <div className={`lesson-example-step ${index === count - 1 ? 'is-latest' : ''}`} key={`${blockKey}-${index}`} aria-current={index === count - 1 ? 'step' : undefined}>
        <span className="lesson-example-step-label">Step {index + 1}</span>
        <p lang={languageForText(step, block.lang)} dir={contentDirection(step, block.lang)}><LessonText text={step} lang={block.lang} /></p>
      </div>)}
    </div>
    {count < block.steps.length && <Button className="lesson-reveal-button" aria-expanded={count > 0} aria-controls={`${id}-steps`} onClick={() => onReveal(count + 1)}>Show next step</Button>}
    {block.steps.length > 1 && count < block.steps.length && <Button className="lesson-reveal-all" aria-expanded={count === block.steps.length} aria-controls={`${id}-steps`} onClick={() => onReveal(block.steps.length)}>Show all steps</Button>}
  </section>;
}

function LessonImage({ src, alt, lang }: { src: string; alt: string; lang?: Lang }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <figure className="lesson-image-fallback"><span className="lesson-image-fallback-label" role="status">Image unavailable.</span><figcaption><details><summary>Show image description</summary><p lang={languageForText(alt, lang)} dir={contentDirection(alt, lang)}><LessonText text={alt} lang={lang} /></p></details></figcaption></figure>
    : <img className="lesson-image" src={src} alt={alt} lang={languageForText(alt, lang)} onError={() => setFailed(true)} />;
}

export function LessonBlockView({ block, blockKey, revealed, onReveal }: {
  block: LessonBlock; blockKey: string; revealed: number; onReveal: (value: number) => void;
}) {
  if (block.type === 'heading') return <h3 className="lesson-block-heading" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></h3>;
  if (block.type === 'paragraph') return <p className="lesson-block-paragraph" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></p>;
  if (block.type === 'note') return <aside className="lesson-block lesson-note" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><p><LessonText text={block.text} lang={block.lang} /></p></aside>;
  if (block.type === 'definition') return <section className="lesson-block lesson-definition" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}>
    <h4>Definition</h4><p><LessonText text={block.text} lang={block.lang} /></p>{block.latex && <LessonMath latex={block.latex} label="Definition formula" />}
  </section>;
  if (block.type === 'example') return <LessonExample block={block} blockKey={blockKey} revealed={revealed} onReveal={onReveal} />;
  if (block.type === 'math') return block.text ? <figure className="lesson-math-figure"><figcaption lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></figcaption><LessonMath latex={block.latex} label="Lesson formula" /></figure> : <LessonMath latex={block.latex} label="Lesson formula" />;
  if (block.type === 'image') return <LessonImage src={block.src} alt={block.alt} lang={block.lang} />;
  if (block.type === 'image-description') return <figure className="lesson-image-fallback"><figcaption><span className="lesson-image-fallback-label">Image description</span><p lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></p></figcaption></figure>;
  if (block.type === 'unsupported') return <aside className="lesson-unsupported" role="note">
    <p>Unsupported block: {block.originalType}. Original content is shown as data.</p>
    {block.source && <pre dir="ltr">{block.source}</pre>}
  </aside>;
  return null;
}

export function LessonConceptContent({ concept, revealedSteps, onReveal }: {
  concept: Concept; revealedSteps: Record<string, number>; onReveal: (key: string, value: number) => void;
}) {
  return <div className="lesson-concept-blocks">
    {concept.blocks.map((block, index) => {
      if (isRedundantOpeningHeading(concept, block, index)) return null;
      const key = `${concept.id}:${index}`;
      return <Fragment key={key}><LessonBlockView block={block} blockKey={key} revealed={revealedSteps[key] ?? 0} onReveal={value => onReveal(key, value)} /></Fragment>;
    })}
  </div>;
}
