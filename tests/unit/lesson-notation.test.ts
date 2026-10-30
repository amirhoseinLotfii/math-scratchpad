import { describe, expect, it } from 'vitest';
import { parseLessonNotation, splitLessonText } from '../../src/features/lessons/lesson-notation';

describe('read-only lesson notation', () => {
  it('renders escaped sets and text without displaying LaTeX commands', () => {
    expect(parseLessonNotation(String.raw`\{(\text{odd},1),\ (\text{even},2)\}`)).toEqual([{ type: 'text', text: '{(odd,1), (even,2)}' }]);
  });
  it('recognizes simple text, equation fragments and indexed roots', () => {
    const parts = parseLessonNotation(String.raw`f(x)=x^2;\quad \text{(a) } 2\quad \text{(b) } \sqrt[3]{x}`);
    expect(parts?.filter(part => part.type === 'formula')).toHaveLength(2);
    expect(parts).toContainEqual({ type: 'root', degree: '3', radicand: 'x' });
    expect(parts).toContainEqual({ type: 'text', text: '(a) ' });
    expect(parseLessonNotation(String.raw`f(x)=c,\ \text{where } c \text{ is constant}`)).not.toBeNull();
  });
  it('leaves unsupported or malformed notation for the raw fallback', () => {
    expect(parseLessonNotation(String.raw`x;\unsupported{y}`)).toBeNull();
    expect(parseLessonNotation(String.raw`\{\frac{1}{2}\}`)).toBeNull();
    expect(parseLessonNotation(String.raw`x\;y`)).toBeNull();
  });
  it('isolates only explicitly delimited math inside Persian prose', () => {
    expect(splitLessonText('توان $7^2$ را با \\(x^2+1\\) مقایسه کن.')).toEqual([
      { type: 'text', text: 'توان ' },
      { type: 'math', latex: '7^2' },
      { type: 'text', text: ' را با ' },
      { type: 'math', latex: 'x^2+1' },
      { type: 'text', text: ' مقایسه کن.' },
    ]);
  });
  it('leaves unmarked and unmatched delimiters as prose without parsing', () => {
    expect(splitLessonText(String.raw`عبارت \\cdot و $x^2 را بررسی کن.`)).toEqual([{ type: 'text', text: String.raw`عبارت \\cdot و $x^2 را بررسی کن.` }]);
  });
});
