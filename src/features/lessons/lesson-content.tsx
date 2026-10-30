import { Fragment, useId, useMemo, useState } from 'react';
import { Formula } from '../../Formula';
import { parse } from '../../parser';
import { Button } from '../../shared/ui/button';
import type { Concept, ExampleBlock, LessonBlock, Lang } from './types';

function direction(lang?: Lang): 'rtl' | 'ltr' | 'auto' {
  return lang === 'fa' ? 'rtl' : lang === 'en' ? 'ltr' : 'auto';
}

export function LessonMath({ latex, label }: { latex: string; label: string }) {
  const expression = useMemo(() => { try { return parse(latex); } catch { return null; } }, [latex]);
  if (!expression) return <code className="lesson-raw-math" dir="ltr">{latex}</code>;
  return <div className="lesson-formula" dir="ltr" role="math" aria-label={label}>
    <Formula sequence={expression} stepId={`lesson-${label}`} path={label} top readOnly />
  </div>;
}

function LessonExample({ block, blockKey, revealed, onReveal }: {
  block: ExampleBlock; blockKey: string; revealed: number; onReveal: (value: number) => void;
}) {
  const id = useId();
  const count = Math.min(block.steps.length, Math.max(0, revealed));
  return <section className="lesson-block lesson-example" aria-label={block.title || 'Worked example'}>
    {block.title && <h4 lang={block.lang} dir={direction(block.lang)}>{block.title}</h4>}
    {block.text && <p lang={block.lang} dir={direction(block.lang)}>{block.text}</p>}
    {block.latex && <LessonMath latex={block.latex} label={block.title || 'Worked example'} />}
    <p className="lesson-example-progress" aria-live="polite">
      {count === 0 ? 'Try it yourself first' : count === block.steps.length ? `All ${count} steps shown` : `${count} of ${block.steps.length} steps shown`}
    </p>
    <div className="lesson-example-steps" id={`${id}-steps`}>
      {block.steps.slice(0, count).map((step, index) => <div className={`lesson-example-step ${index === count - 1 ? 'is-latest' : ''}`} key={`${blockKey}-${index}`} aria-current={index === count - 1 ? 'step' : undefined}>
        <span className="lesson-example-step-label">Step {index + 1}</span>
        <p lang={block.lang} dir={direction(block.lang)}>{step}</p>
      </div>)}
    </div>
    {count < block.steps.length && <Button className="lesson-reveal-button" aria-expanded={count > 0} aria-controls={`${id}-steps`} onClick={() => onReveal(count + 1)}>Show next step</Button>}
    {block.steps.length > 1 && count < block.steps.length && <Button className="lesson-reveal-all" aria-expanded={count === block.steps.length} aria-controls={`${id}-steps`} onClick={() => onReveal(block.steps.length)}>Show all steps</Button>}
  </section>;
}

function LessonImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <p className="lesson-image-fallback" role="status">{alt}</p>
    : <img className="lesson-image" src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function LessonBlockView({ block, blockKey, revealed, onReveal }: {
  block: LessonBlock; blockKey: string; revealed: number; onReveal: (value: number) => void;
}) {
  if (block.type === 'heading') return <h3 className="lesson-block-heading" lang={block.lang} dir={direction(block.lang)}>{block.text}</h3>;
  if (block.type === 'paragraph') return <p className="lesson-block-paragraph" lang={block.lang} dir={direction(block.lang)}>{block.text}</p>;
  if (block.type === 'note') return <aside className="lesson-block lesson-note" lang={block.lang} dir={direction(block.lang)}><p>{block.text}</p></aside>;
  if (block.type === 'definition') return <section className="lesson-block lesson-definition" lang={block.lang} dir={direction(block.lang)}>
    <h4>Definition</h4><p>{block.text}</p>{block.latex && <LessonMath latex={block.latex} label="Definition formula" />}
  </section>;
  if (block.type === 'example') return <LessonExample block={block} blockKey={blockKey} revealed={revealed} onReveal={onReveal} />;
  if (block.type === 'math') return <LessonMath latex={block.latex} label="Lesson formula" />;
  if (block.type === 'image') return <LessonImage src={block.src} alt={block.alt} />;
  return <p className="lesson-unsupported" role="note">Unsupported block</p>;
}

export function LessonConceptContent({ concept, revealedSteps, onReveal }: {
  concept: Concept; revealedSteps: Record<string, number>; onReveal: (key: string, value: number) => void;
}) {
  return <div className="lesson-concept-blocks">
    {concept.blocks.map((block, index) => {
      const key = `${concept.id}:${index}`;
      return <Fragment key={key}><LessonBlockView block={block} blockKey={key} revealed={revealedSteps[key] ?? 0} onReveal={value => onReveal(key, value)} /></Fragment>;
    })}
  </div>;
}
