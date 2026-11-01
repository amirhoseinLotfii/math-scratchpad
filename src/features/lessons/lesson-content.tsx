import { Fragment, useId, useMemo, useState } from 'react';
import { MathDisplay } from '../../MathDisplay';
import { Button } from '../../shared/ui/button';
import { parseLessonTable } from './lesson-table';
import { splitLessonText } from './lesson-notation';
import type { Concept, ExampleBlock, Lesson, LessonBlock, Lang } from './types';

export function languageForText(text: string, lang?: Lang): Lang | undefined {
  if (lang) return lang;
  if (/[\u0600-\u06ff]/.test(text)) return 'fa';
  return /[A-Za-z]/.test(text) ? 'en' : undefined;
}

export function lessonUiLanguage(lesson: Pick<Lesson, 'title'>): Lang {
  return languageForText(lesson.title) ?? 'en';
}

export function contentDirection(text: string, lang?: Lang): 'rtl' | 'ltr' | 'auto' {
  const value = languageForText(text, lang);
  return value === 'fa' ? 'rtl' : value === 'en' ? 'ltr' : 'auto';
}

export function localizeLessonDigits(value: number | string, lang: Lang = 'fa'): string {
  const text = String(value);
  return lang === 'fa' ? text.replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) : text;
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

function TableCell({ value, uiLang }: { value: string; uiLang: Lang }) {
  const text = value.match(/^\\text\{([^{}]*)\}$/)?.[1] ?? (/^[^\\{}_^]+$/.test(value) ? value.replace(/\\ /g, ' ') : null);
  return text !== null
    ? <bdi dir="auto">{text}</bdi>
    : <MathDisplay latex={value} label={uiLang === 'fa' ? 'درایهٔ ریاضی جدول' : 'Mathematical table entry'} display={false} />;
}

export function isRedundantOpeningHeading(concept: Concept, block: LessonBlock, index: number): boolean {
  return index === 0 && block.type === 'heading'
    && block.text.trim().replace(/\s+/g, ' ') === concept.title.trim().replace(/\s+/g, ' ');
}

export function LessonMath({ latex, label, uiLang = 'en' }: { latex: string; label: string; uiLang?: Lang }) {
  const table = useMemo(() => parseLessonTable(latex), [latex]);
  if (table) return <div className="lesson-table-scroll" role="region" aria-label={uiLang === 'fa' ? 'جدول درس' : 'Lesson table'} tabIndex={0} dir="ltr">
    <table>{table.hasColumnHeaders && <thead><tr>{table.rows[0].map((cell, index) => <th key={index} scope="col"><TableCell value={cell} uiLang={uiLang} /></th>)}</tr></thead>}
      <tbody>{table.rows.slice(table.hasColumnHeaders ? 1 : 0).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}><TableCell value={cell} uiLang={uiLang} /></td>)}</tr>)}</tbody>
    </table>
  </div>;
  return <div className="lesson-formula" dir="ltr" data-math-label={label}>
    <MathDisplay latex={latex} label={uiLang === 'fa' ? 'فرمول درس' : label} />
  </div>;
}

const mathIdentifiers = new Set(['a', 'b', 'c', 'f', 'g', 'h', 'i', 'j', 'k', 'm', 'n', 'p', 'q', 'r', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'sin', 'cos', 'tan', 'log', 'ln', 'sqrt']);

/** Identify unmistakable TeX and compact equations inside text-mode question sources. */
export function isMathQuestionSource(source: string, mode: 'math' | 'text'): boolean {
  if (mode === 'math') return true;
  const text = source.trim();
  if (!text) return false;
  if (parseLessonTable(text)) return true;
  // Mixed Persian prose with explicitly delimited inline TeX must remain prose;
  // LessonText renders each inline formula without passing the whole sentence
  // to the math parser.
  if (/\\\([\s\S]*?\\\)|\$[^$\n]+\$/.test(text)) return false;
  // Any TeX control word is a reliable signal that this source contains a
  // mathematical fragment. Keep escaped braces in the same path so sets and
  // piecewise expressions also render as math instead of raw TeX text.
  if (/\\[A-Za-z]+/.test(text) || /\\[{}]/.test(text)) return true;
  const identifiers = text.replace(/(?:^|\s)\([A-H]\)\s*/gi, ' ').match(/[A-Za-z]+/g)?.map(value => value.toLowerCase()) ?? [];
  const relationWithOperands = /(?:[A-Za-z0-9)}]|\\\))\s*[<>≤≥≠∈∉∪∩]\s*(?:[A-Za-z0-9({]|\\)/u.test(text);
  const compactMath = /^[\sA-Za-z0-9()+\-*/=.,;:?^_|{}\[\]\\∛√<>≤≥≠∈∉∪∩]+$/u.test(text)
    && (/[=+*/^]|(?:^|\s)-\d/u.test(text) || relationWithOperands)
    && identifiers.every(identifier => mathIdentifiers.has(identifier));
  return compactMath;
}

/** Render answer options containing expressions as math while keeping prose choices readable. */
export function QuestionChoice({ choice, index, uiLang = 'en' }: { choice: string; index: number; uiLang?: Lang }) {
  if (isMathQuestionSource(choice, 'text')) return <span className="lesson-choice-math" dir="ltr"><MathDisplay latex={choice} label={`${uiLang === 'fa' ? 'گزینهٔ ریاضی' : 'Mathematical answer choice'} ${localizeLessonDigits(index + 1, uiLang)}`} display={false} /></span>;
  return <span lang={languageForText(choice)} dir={contentDirection(choice)}><LessonText text={choice} /></span>;
}

export function QuestionSource({ source, mode, label = 'Question expression', mathLabel = label, textClassName, mathClassName }: {
  source: string;
  mode: 'math' | 'text';
  label?: string;
  mathLabel?: string;
  textClassName: string;
  mathClassName: string;
}) {
  if (!source.trim()) return null;
  if (isMathQuestionSource(source, mode)) return <div className={`${mathClassName} lesson-question-math`} dir="ltr" role="group" aria-label={label}>{mode === 'math' ? <MathDisplay latex={source} label={mathLabel} /> : <LessonMath latex={source} label={mathLabel} />}</div>;
  return <p className={textClassName} lang={languageForText(source)} dir={contentDirection(source)}><LessonText text={source} /></p>;
}

function LessonExample({ block, blockKey, revealed, onReveal, uiLang, solutionLocked = false }: {
  block: ExampleBlock; blockKey: string; revealed: number; onReveal: (value: number) => void; uiLang: Lang; solutionLocked?: boolean;
}) {
  const id = useId();
  const count = Math.min(block.steps.length, Math.max(0, revealed));
  const labels = uiLang === 'fa'
    ? { workedExample: 'مثال حل‌شده', tryFirst: 'ابتدا خودتان حل کنید', allShown: (n: number) => `هر ${localizeLessonDigits(n, uiLang)} گام نمایش داده شد`, someShown: (n: number, total: number) => `${localizeLessonDigits(n, uiLang)} از ${localizeLessonDigits(total, uiLang)} گام نمایش داده شد`, step: 'گام', next: 'نمایش گام بعدی', all: 'نمایش همهٔ گام‌ها' }
    : { workedExample: 'Worked example', tryFirst: 'Try it yourself first', allShown: (n: number) => `All ${n} steps shown`, someShown: (n: number, total: number) => `${n} of ${total} steps shown`, step: 'Step', next: 'Show next step', all: 'Show all steps' };
  return <section className="lesson-block lesson-example" aria-label={block.title || labels.workedExample}>
    {block.title && <h4 lang={languageForText(block.title, block.lang)} dir={contentDirection(block.title, block.lang)}><LessonText text={displayEducationalHeading(block.title, block.lang)} lang={block.lang} /></h4>}
    {block.text && <p lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></p>}
    {block.latex && <LessonMath latex={block.latex} label={block.title || labels.workedExample} uiLang={uiLang} />}
    {block.steps.length > 0 && solutionLocked
      ? <p className="lesson-example-progress">{uiLang === 'fa' ? 'ابتدا تلاش خودت را در «کار من» بنویس؛ راه‌حل بعد از تلاش در دسترس است.' : 'Write your attempt in Your work first; the solution unlocks after an attempt.'}</p>
      : <>
        {block.steps.length > 0 && <p className="lesson-example-progress" aria-live="polite">
          {count === 0 ? labels.tryFirst : count === block.steps.length ? labels.allShown(count) : labels.someShown(count, block.steps.length)}
        </p>}
        <div className="lesson-example-steps" id={`${id}-steps`}>
          {block.steps.slice(0, count).map((step, index) => <div className={`lesson-example-step ${index === count - 1 ? 'is-latest' : ''}`} key={`${blockKey}-${index}`} aria-current={index === count - 1 ? 'step' : undefined}>
            <span className="lesson-example-step-label">{labels.step} {localizeLessonDigits(index + 1, uiLang)}</span>
            <p lang={languageForText(step, block.lang)} dir={contentDirection(step, block.lang)}><LessonText text={step} lang={block.lang} /></p>
          </div>)}
        </div>
        {count < block.steps.length && <Button className="lesson-reveal-button" aria-expanded={count > 0} aria-controls={`${id}-steps`} onClick={() => onReveal(count + 1)}>{labels.next}</Button>}
        {block.steps.length > 1 && count < block.steps.length && <Button className="lesson-reveal-all" aria-expanded={count === block.steps.length} aria-controls={`${id}-steps`} onClick={() => onReveal(block.steps.length)}>{labels.all}</Button>}
      </>}
  </section>;
}

function LessonImage({ src, alt, caption, lang, uiLang }: { src: string; alt: string; caption?: string; lang?: Lang; uiLang: Lang }) {
  const [failed, setFailed] = useState(false);
  const unavailable = uiLang === 'fa' ? 'تصویر در دسترس نیست.' : 'Image unavailable.';
  const description = uiLang === 'fa' ? 'نمایش توضیح تصویر' : 'Show image description';
  const captionView = caption && <figcaption className="lesson-image-caption" lang={languageForText(caption, lang)} dir={contentDirection(caption, lang)}><LessonText text={caption} lang={lang} /></figcaption>;
  return failed
    ? <figure className="lesson-image-fallback"><span className="lesson-image-fallback-label" role="status" lang={uiLang}>{unavailable}</span>{captionView}<figcaption><details><summary lang={uiLang}>{description}</summary><p lang={languageForText(alt, lang)} dir={contentDirection(alt, lang)}><LessonText text={alt} lang={lang} /></p></details></figcaption></figure>
    : <figure className="lesson-image-figure"><img className="lesson-image" src={src} alt={alt} lang={languageForText(alt, lang)} onError={() => setFailed(true)} />{captionView}</figure>;
}

const openStaxSectionSlugs: Record<string, string> = {
  '1.1': '1-1-functions-and-function-notation',
  '1.2': '1-2-domain-and-range',
  '1.3': '1-3-rates-of-change-and-behavior-of-graphs',
  '1.4': '1-4-composition-of-functions',
  '1.5': '1-5-transformation-of-functions',
  '1.6': '1-6-absolute-value-functions',
  '1.7': '1-7-inverse-functions',
  Review: '1-key-concepts',
};

export function LessonSourceAttribution({ book, section }: { book: Lesson['book']; section: Lesson['section'] }) {
  if (!/openstax.*precalculus\s*2e/i.test(book)) return null;
  const sourceSlug = openStaxSectionSlugs[section] ?? '1-key-concepts';
  const sourceLabel = section === 'Review' ? 'مرور فصل ۱' : 'بخش ' + section;
  return <p className="lesson-source-attribution">
    متن، تعریف‌ها، تمرین‌ها و شکل‌های این درس از <a href={'https://openstax.org/books/precalculus-2e/pages/' + sourceSlug} target="_blank" rel="noreferrer">OpenStax، کتاب Precalculus 2e، {sourceLabel}</a> گرفته و به فارسی ترجمه یا بازآرایی شده‌اند. مثال‌های «آموزشی تکمیلی» برای روشن‌کردن گام‌های کوتاه طراحی شده‌اند. © Rice University. مجوز: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>.
  </p>;
}

export function LessonBlockView({ block, blockKey, revealed, onReveal, uiLang = 'en', solutionLocked = false }: {
  block: LessonBlock; blockKey: string; revealed: number; onReveal: (value: number) => void; uiLang?: Lang; solutionLocked?: boolean;
}) {
  const formula = (latex?: string) => latex?.trim() ? <div className="lesson-attached-formula" dir="ltr"><LessonMath latex={latex} label={uiLang === 'fa' ? 'فرمول همراه متن' : 'Text formula'} uiLang={uiLang} /></div> : null;
  if (block.type === 'heading') return <div className="lesson-text-block"><h3 className="lesson-block-heading" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></h3>{formula(block.latex)}</div>;
  if (block.type === 'paragraph') return <div className="lesson-text-block"><p className="lesson-block-paragraph" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></p>{formula(block.latex)}</div>;
  if (block.type === 'note') return <aside className="lesson-block lesson-note" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><p><LessonText text={block.text} lang={block.lang} /></p>{formula(block.latex)}</aside>;
  if (block.type === 'definition') return <section className="lesson-block lesson-definition" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}>
    <h4>{uiLang === 'fa' ? 'تعریف' : 'Definition'}</h4><p><LessonText text={block.text} lang={block.lang} /></p>{block.latex && <LessonMath latex={block.latex} label={uiLang === 'fa' ? 'فرمول تعریف' : 'Definition formula'} uiLang={uiLang} />}
  </section>;
  if (block.type === 'example') return <LessonExample block={block} blockKey={blockKey} revealed={revealed} onReveal={onReveal} uiLang={uiLang} solutionLocked={solutionLocked} />;
  if (block.type === 'math') return block.text ? <figure className="lesson-math-figure"><figcaption lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></figcaption><LessonMath latex={block.latex} label={uiLang === 'fa' ? 'فرمول درس' : 'Lesson formula'} uiLang={uiLang} /></figure> : <LessonMath latex={block.latex} label={uiLang === 'fa' ? 'فرمول درس' : 'Lesson formula'} uiLang={uiLang} />;
  if (block.type === 'image') return <LessonImage src={block.src} alt={block.alt} caption={block.caption} lang={block.lang} uiLang={uiLang} />;
  if (block.type === 'image-description') return <figure className="lesson-image-fallback"><span className="lesson-image-fallback-label" role="status" lang={uiLang}>{uiLang === 'fa' ? 'تصویر در دسترس نیست.' : 'Image unavailable.'}</span><figcaption><details><summary lang={uiLang}>{uiLang === 'fa' ? 'نمایش توضیح تصویر' : 'Show image description'}</summary><p lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}><LessonText text={block.text} lang={block.lang} /></p></details></figcaption></figure>;
  if (block.type === 'unsupported') return <aside className="lesson-unsupported" role="note">
    <p>{uiLang === 'fa' ? `محتوای این بخش (${block.originalType}) هنوز پشتیبانی نمی‌شود؛ دادهٔ اصلی در ادامه نمایش داده شده است.` : `Unsupported block: ${block.originalType}. Original content is shown as data.`}</p>
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
