import { Fragment, useMemo } from 'react';
import { MathDisplay } from '../math-editor/components/math-display';
import { parseLessonTable } from './lesson-table';
import { splitLessonText } from './lesson-notation';
import type { Concept, Lesson, LessonBlock, Lang } from './types';

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
  return lang === 'fa' ? text.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) : text;
}

/** Keep a Persian educational heading concise when bank data repeats its English title in parentheses. */
export function displayEducationalHeading(text: string, lang?: Lang): string {
  if (languageForText(text, lang) !== 'fa') return text;
  const match = text.match(/^(.*[\u0600-\u06ff].*?)\s+\(([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)+)\)\s*$/u);
  return match?.[1]?.trim() || text;
}

export function LessonText({ text, lang }: { text: string; lang?: Lang }) {
  const textLang = languageForText(text, lang);
  return (
    <>
      {splitLessonText(text).map((part, partIndex) => {
        if (part.type === 'math')
          return (
            <bdi className="lesson-inline-math" key={`math-${partIndex}`} dir="ltr">
              <MathDisplay latex={part.latex} display={false} />
            </bdi>
          );
        if (textLang !== 'fa') return part.text;
        // Keep a complete Latin phrase (including its spaces and punctuation) in one
        // isolate. Word-by-word isolates make bidi resolution reorder spaces and brackets.
        const latinRun = /[([{]?[A-Za-z0-9](?:[A-Za-z0-9 \t.,:;!?\u0027’“”()[\]{}<>/+=\-–—]*[A-Za-z0-9)\]}])?/g;
        const pieces: React.ReactNode[] = [];
        let at = 0,
          runIndex = 0;
        for (const match of part.text.matchAll(latinRun)) {
          if (match.index > at) pieces.push(part.text.slice(at, match.index));
          pieces.push(
            <bdi key={`latin-${partIndex}-${runIndex++}`} lang="en" dir="ltr">
              {match[0]}
            </bdi>,
          );
          at = match.index + match[0].length;
        }
        if (at < part.text.length || !pieces.length) pieces.push(part.text.slice(at));
        return <Fragment key={`part-${partIndex}`}>{pieces}</Fragment>;
      })}
    </>
  );
}

function TableCell({ value, uiLang }: { value: string; uiLang: Lang }) {
  const text = value.match(/^\\text\{([^{}]*)\}$/)?.[1] ?? (/^[^\\{}_^]+$/.test(value) ? value.replace(/\\ /g, ' ') : null);
  return text !== null ? (
    <bdi dir="auto">{text}</bdi>
  ) : (
    <MathDisplay latex={value} label={uiLang === 'fa' ? 'درایهٔ ریاضی جدول' : 'Mathematical table entry'} display={false} />
  );
}

export function isRedundantOpeningHeading(concept: Concept, block: LessonBlock, index: number): boolean {
  return index === 0 && block.type === 'heading' && block.text.trim().replace(/\s+/g, ' ') === concept.title.trim().replace(/\s+/g, ' ');
}

export function LessonMath({ latex, label, uiLang = 'en' }: { latex: string; label: string; uiLang?: Lang }) {
  const table = useMemo(() => parseLessonTable(latex), [latex]);
  if (table)
    return (
      <div className="lesson-table-scroll" role="region" aria-label={uiLang === 'fa' ? 'جدول درس' : 'Lesson table'} tabIndex={0} dir="ltr">
        <table>
          {table.hasColumnHeaders && (
            <thead>
              <tr>
                {table.rows[0].map((cell, index) => (
                  <th key={index} scope="col">
                    <TableCell value={cell} uiLang={uiLang} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {table.rows.slice(table.hasColumnHeaders ? 1 : 0).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index}>
                    <TableCell value={cell} uiLang={uiLang} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="lesson-formula" dir="ltr" data-math-label={label}>
      <MathDisplay latex={latex} label={uiLang === 'fa' ? 'فرمول درس' : label} />
    </div>
  );
}

const mathIdentifiers = new Set([
  'a',
  'b',
  'c',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'm',
  'n',
  'p',
  'q',
  'r',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'sqrt',
]);

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
  const identifiers =
    text
      .replace(/(?:^|\s)\([A-H]\)\s*/gi, ' ')
      .match(/[A-Za-z]+/g)
      ?.map((value) => value.toLowerCase()) ?? [];
  const relationWithOperands = /(?:[A-Za-z0-9)}]|\\\))\s*[<>≤≥≠∈∉∪∩]\s*(?:[A-Za-z0-9({]|\\)/u.test(text);
  const compactMath =
    /^[\sA-Za-z0-9()+\-*/=.,;:?^_|{}\[\]\\∛√<>≤≥≠∈∉∪∩]+$/u.test(text) &&
    (/[=+*/^]|(?:^|\s)-\d/u.test(text) || relationWithOperands) &&
    identifiers.every((identifier) => mathIdentifiers.has(identifier));
  return compactMath;
}

/** Render answer options containing expressions as math while keeping prose choices readable. */
export function QuestionChoice({ choice, index, uiLang = 'en' }: { choice: string; index: number; uiLang?: Lang }) {
  if (isMathQuestionSource(choice, 'text'))
    return (
      <span className="lesson-choice-math" dir="ltr">
        <MathDisplay
          latex={choice}
          label={`${uiLang === 'fa' ? 'گزینهٔ ریاضی' : 'Mathematical answer choice'} ${localizeLessonDigits(index + 1, uiLang)}`}
          display={false}
        />
      </span>
    );
  return (
    <span lang={languageForText(choice)} dir={contentDirection(choice)}>
      <LessonText text={choice} />
    </span>
  );
}

export function QuestionSource({
  source,
  mode,
  label = 'Question expression',
  mathLabel = label,
  textClassName,
  mathClassName,
}: {
  source: string;
  mode: 'math' | 'text';
  label?: string;
  mathLabel?: string;
  textClassName: string;
  mathClassName: string;
}) {
  if (!source.trim()) return null;
  if (isMathQuestionSource(source, mode))
    return (
      <div className={`${mathClassName} lesson-question-math`} dir="ltr" role="group" aria-label={label}>
        {mode === 'math' ? <MathDisplay latex={source} label={mathLabel} /> : <LessonMath latex={source} label={mathLabel} />}
      </div>
    );
  return (
    <p className={textClassName} lang={languageForText(source)} dir={contentDirection(source)}>
      <LessonText text={source} />
    </p>
  );
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
  return (
    <p className="lesson-source-attribution">
      متن، تعریف‌ها، تمرین‌ها و شکل‌های این درس از{' '}
      <a href={'https://openstax.org/books/precalculus-2e/pages/' + sourceSlug} target="_blank" rel="noreferrer">
        OpenStax، کتاب Precalculus 2e، {sourceLabel}
      </a>{' '}
      گرفته و به فارسی ترجمه یا بازآرایی شده‌اند. مثال‌های «آموزشی تکمیلی» برای روشن‌کردن گام‌های کوتاه طراحی شده‌اند. © Rice University.
      مجوز:{' '}
      <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">
        CC BY-NC-SA 4.0
      </a>
      .
    </p>
  );
}

export { LessonBlockView, LessonConceptContent } from './lesson-block-view';
