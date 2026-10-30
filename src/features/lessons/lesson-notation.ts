import { parse } from '../../parser';
import type { Sequence } from '../../model';

export type LessonTextPart =
  | { type: 'text'; text: string }
  | { type: 'math'; latex: string };

/** Split only explicitly delimited inline TeX; never send lesson prose to a math parser. */
export function splitLessonText(text: string): LessonTextPart[] {
  const pattern = /\\\(([\s\S]*?)\\\)|\$([^$\n]+)\$/g;
  const parts: LessonTextPart[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) parts.push({ type: 'text', text: text.slice(at, match.index) });
    const latex = match[1] ?? match[2];
    if (latex.trim()) parts.push({ type: 'math', latex: latex.trim() });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ type: 'text', text: text.slice(at) });
  return parts.length ? parts : [{ type: 'text', text }];
}

export type LessonNotationPart =
  | { type: 'formula'; expression: Sequence }
  | { type: 'text'; text: string }
  | { type: 'root'; degree: string; radicand: string };

/** Recognize only simple read-only fragments; leave unknown notation in the raw fallback. */
export function parseLessonNotation(latex: string): LessonNotationPart[] | null {
  if (latex.length > 4000 || latex.includes('\\;')) return null;
  const set = latex.trim().match(/^\\\{([\s\S]*)\\\}$/);
  if (set) {
    const body = set[1].replace(/\\text\{([^{}\\]+)\}/g, '$1').replace(/\\[ ,;!]/g, ' ');
    if (!body.trim() || /[\\{}]/.test(body)) return null;
    return [{ type: 'text', text: `{${body}}` }];
  }
  const tokens = /(\\text\{[^{}\\]*\}|\\quad|;|\\sqrt\[[1-9]\d?\]\{[A-Za-z0-9]+\})/g;
  if (!tokens.test(latex)) return null;
  tokens.lastIndex = 0;
  const parts: LessonNotationPart[] = [];
  let at = 0;
  const appendFormula = (text: string) => {
    if (!text.trim().replace(/\\ /g, '').trim()) return true;
    try { parts.push({ type: 'formula', expression: parse(text.replace(/\\ /g, ' ')) }); return true; } catch { return false; }
  };
  for (const match of latex.matchAll(tokens)) {
    if (!appendFormula(latex.slice(at, match.index))) return null;
    const token = match[0];
    const root = token.match(/^\\sqrt\[([1-9]\d?)\]\{([A-Za-z0-9]+)\}$/);
    if (root) parts.push({ type: 'root', degree: root[1], radicand: root[2] });
    else if (token.startsWith('\\text{')) parts.push({ type: 'text', text: token.slice(6, -1) });
    else parts.push({ type: 'text', text: token === '\\quad' ? ' ' : token });
    at = match.index! + token.length;
  }
  if (!appendFormula(latex.slice(at)) || !parts.length) return null;
  return parts;
}
