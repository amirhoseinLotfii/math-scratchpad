import { describe, expect, it } from 'vitest';
import { parseLessonTable } from '../../src/features/lessons/lesson-table';

describe('lesson array tables', () => {
  it('parses ruled arrays without changing values or order', () => {
    expect(parseLessonTable(String.raw`\begin{array}{|c|c|c|} \hline Input & 1 & 2 \\ \hline Output & 3 & 4 \\ \hline \end{array}`)).toEqual([
      ['Input', '1', '2'], ['Output', '3', '4'],
    ]);
  });
  it('rejects malformed or unsupported arrays instead of inventing cells', () => {
    expect(parseLessonTable(String.raw`\begin{array}{cc}\hline A & B \\ \hline 1 \end{array}`)).toBeNull();
    expect(parseLessonTable(String.raw`\begin{array}{cc}\hline A & B \\ \hline \frac{1}{2} & 3 \end{array}`)).toBeNull();
    expect(parseLessonTable(String.raw`\begin{array}{cc}x & y \\ 1 & 2\end{array}`)).toBeNull();
  });
});
