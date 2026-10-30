/** Parse a deliberately limited LaTeX array containing plain table cells.
 * Unknown commands and malformed arrays stay in the existing raw fallback.
 */
export function parseLessonTable(latex: string): string[][] | null {
  if (latex.length > 20000) return null;
  const match = latex.trim().match(/^\\begin\{array\}\{([|clr\s]+)\}([\s\S]*)\\end\{array\}$/);
  if (!match || !match[2].includes('\\hline')) return null;
  const columns = match[1].replace(/[|\s]/g, '').length;
  if (columns < 2 || columns > 40) return null;
  const body = match[2].replace(/\\hline\b/g, '');
  const rows = body.split('\\\\').map(row => row.trim());
  if (rows.at(-1) === '') rows.pop();
  if (rows.length < 2 || rows.length > 100) return null;
  const cells = rows.map(row => row.split('&').map(cell => cell.trim()));
  if (cells.some(row => row.length !== columns || row.some(cell => !cell || cell.length > 1000 || /[\\{}]/.test(cell)))) return null;
  return cells;
}
