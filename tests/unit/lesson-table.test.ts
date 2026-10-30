import { describe, expect, it } from 'vitest';
import { parseLessonTable } from '../../src/features/lessons/lesson-table';

describe('lesson array tables', () => {
  it('parses ruled arrays without changing values or order', () => {
    expect(parseLessonTable(String.raw`\begin{array}{|c|c|c|} \hline Input & 1 & 2 \\ \hline Output & 3 & 4 \\ \hline \end{array}`)).toEqual({ rows: [
      ['Input', '1', '2'], ['Output', '3', '4'],
    ], hasColumnHeaders: true });
  });
  it('renders unruled arrays as tables without inventing a header', () => {
    expect(parseLessonTable(String.raw`\begin{array}{ll} x & \text{ورودی} \\ y & \text{خروجی} \end{array}`)).toEqual({ rows: [['x', '\\text{ورودی}'], ['y', '\\text{خروجی}']], hasColumnHeaders: false });
  });
  it('retains nested mathematical cells for the app math renderer instead of exposing raw array syntax', () => {
    expect(parseLessonTable(String.raw`\begin{array}{ll} 7^2 & 7 \cdot 7 \\ \frac{1}{2} & x_1 \end{array}`)).toEqual({ rows: [['7^2', '7 \\cdot 7'], ['\\frac{1}{2}', 'x_1']], hasColumnHeaders: false });
  });
  it('leaves malformed arrays to the mathematical renderer and treats valid grids as tables', () => {
    expect(parseLessonTable(String.raw`\begin{array}{cc}\hline A & B \\ \hline 1 \end{array}`)).toBeNull();
    expect(parseLessonTable(String.raw`\begin{array}{cc}\hline A & B \\ \hline \frac{1}{2} & 3 \\ \end{array}`)).not.toBeNull();
    expect(parseLessonTable(String.raw`\begin{array}{cc}x & y \\ 1 & 2\end{array}`)).toEqual({ rows: [['x', 'y'], ['1', '2']], hasColumnHeaders: false });
  });
});
