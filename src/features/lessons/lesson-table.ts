/** Parse a bounded LaTeX array as a semantic, locally scrollable table.
 * Cell notation is retained verbatim and rendered through the app's math model.
 */
export type LessonTable = { rows: string[][]; hasColumnHeaders: boolean };

export function parseLessonTable(latex: string): LessonTable | null {
  if (latex.length > 20000) return null;
  const match = latex.trim().match(/^\\begin\{array\}\{([|clr\s]+)\}([\s\S]*)\\end\{array\}$/);
  if (!match) return null;
  const columns = match[1].replace(/[|\s]/g, '').length;
  if (columns < 2 || columns > 40) return null;

  const source = match[2], rows: string[][] = [];
  let row: string[] = [], cell = '', depth = 0, hasColumnHeaders = false;
  const pushCell = () => { row.push(cell.trim()); cell = ''; };
  const pushRow = () => { pushCell(); rows.push(row); row = []; };

  for (let i = 0; i < source.length;) {
    if (depth === 0 && source.startsWith('\\hline', i) && !/[A-Za-z]/.test(source[i + 6] ?? '')) {
      if (rows.length > 0) hasColumnHeaders = true;
      i += 6;
      continue;
    }
    if (source[i] === '\\') {
      if (depth === 0 && source[i + 1] === '\\') {
        pushRow(); i += 2;
        while (/\s/.test(source[i] ?? '')) i++;
        if (source[i] === '[') {
          const close = source.indexOf(']', i + 1);
          if (close < 0) return null;
          i = close + 1;
        }
        continue;
      }
      if (source[i + 1] === '{' || source[i + 1] === '}') {
        cell += source.slice(i, i + 2); i += 2; continue;
      }
      cell += source[i++];
      continue;
    }
    const char = source[i++];
    if (char === '{') depth++;
    else if (char === '}') { if (depth === 0) return null; depth--; }
    if (depth === 0 && char === '&') pushCell();
    else cell += char;
  }
  if (depth !== 0) return null;
  if (cell.trim() || row.length) pushRow();
  if (rows.at(-1)?.every(value => !value.trim())) rows.pop();
  if (rows.length < 2 || rows.length > 100 || rows.some(item => item.length !== columns || item.some(value => value.length > 1000))) return null;
  return { rows, hasColumnHeaders };
}
