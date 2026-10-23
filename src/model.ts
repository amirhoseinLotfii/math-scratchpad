export type Leaf = { id: string; type: 'number' | 'operator' | 'identifier'; value: string };
export type Sequence = { id: string; type: 'sequence'; children: MathNode[] };
export type Structure =
  | { id: string; type: 'fraction'; numerator: Sequence; denominator: Sequence }
  | { id: string; type: 'power'; base: Sequence; exponent: Sequence }
  | { id: string; type: 'root' | 'group'; body: Sequence }
  | { id: string; type: 'matrix'; size: number; cells: Sequence[] }
  | { id: string; type: 'template'; kind: string; args: Sequence[] };
export type MathNode = Leaf | Structure;
export type Step = { id: string; expression: Sequence; final: boolean; status: 'unchecked' | 'needs-review' };
export type Exercise = { id: string; source: string; mode: 'math' | 'text'; steps: Step[] };
export type Cursor = { stepId: string; nodeId: string | null; sequenceId: string | null; index: number; offset: number; selected: string | null };
export type Document = { exercises: Exercise[]; exerciseId: string; cursor: Cursor };
export type Preferences = { compact: boolean; favorites: string[]; recent: string[] };
export const uid = () => `m${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const num = (value = ''): Leaf => ({ id: uid(), type: 'number', value });
export const ident = (value: string): Leaf => ({ id: uid(), type: 'identifier', value });
export const op = (value: string): Leaf => ({ id: uid(), type: 'operator', value });
export const seq = (children: MathNode[] = [num()]): Sequence => ({ id: uid(), type: 'sequence', children });
export const blank = () => seq();
export const frac = (numerator = blank(), denominator = blank()): Structure => ({ id: uid(), type: 'fraction', numerator, denominator });
export const template = (kind: string, args: Sequence[]): Structure => ({ id: uid(), type: 'template', kind, args });
export const blankStep = (): Step => ({ id: uid(), expression: blank(), final: false, status: 'unchecked' });
export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const example = String.raw`\frac{2}{3} + \frac{1}{4}`;
export const templateCounts: Record<string, number> = { integral: 4, sum: 3, limit: 3, derivative: 2, choose: 2, percent: 1, factorial: 1, abs: 1, mean: 1, f: 1, sin: 1, cos: 1, tan: 1, ln: 1, log: 1, exp: 1, det: 1, probability: 1 };
export const ascii = (s: string) => s.replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
export function fields(n: MathNode): [Sequence, string][] {
  if (n.type === 'fraction') return [[n.numerator, 'Numerator'], [n.denominator, 'Denominator']];
  if (n.type === 'power') return [[n.base, 'Base'], [n.exponent, 'Exponent']];
  if (n.type === 'root' || n.type === 'group') return [[n.body, n.type === 'root' ? 'Radicand' : 'Parentheses']];
  if (n.type === 'matrix') return n.cells.map((c, i) => [c, `Row ${Math.floor(i / n.size) + 1} column ${i % n.size + 1}`]);
  if (n.type === 'template') {
    const names: Record<string, string[]> = { integral: ['Lower bound', 'Upper bound', 'Integrand', 'Variable'], sum: ['Lower bound', 'Upper bound', 'Body'], limit: ['Variable', 'Approach', 'Body'], derivative: ['Body', 'Variable'], choose: ['Top', 'Bottom'] };
    return n.args.map((a, i) => [a, names[n.kind]?.[i] ?? 'Body']);
  }
  return [];
}
export type NodeInfo = { node: MathNode; parent: Sequence; index: number; ancestors: NodeInfo[]; path: string };
export function nodes(s: Sequence, path = '', ancestors: NodeInfo[] = []): NodeInfo[] {
  return s.children.flatMap((node, index) => {
    const fractionIndex = s.children.filter(x => x.type === 'fraction').findIndex(x => x.id === node.id) + 1;
    const label = node.type === 'fraction' ? `Fraction ${fractionIndex}` : node.type === 'template' ? node.kind : node.type;
    const item: NodeInfo = { node, parent: s, index, ancestors, path };
    return [item, ...fields(node).flatMap(([child, name]) => nodes(child, `${path} / ${label} ${name}`, [...ancestors, item]))];
  });
}
export const leaves = (s: Sequence) => nodes(s).filter(x => fields(x.node).length === 0);
export function findSequence(s: Sequence, id: string): Sequence | undefined {
  if (s.id === id) return s;
  for (const { node } of nodes(s)) for (const [child] of fields(node)) if (child.id === id) return child;
}
export function freshNode<T extends MathNode | Sequence>(node: T): T {
  const copy = clone(node);
  function reset(n: MathNode | Sequence) { n.id = uid(); if (n.type === 'sequence') n.children.forEach(reset); else fields(n).forEach(([s]) => reset(s)); }
  reset(copy); return copy;
}
export function makeStructure(kind: string): Structure {
  if (kind === 'fraction') return frac();
  if (kind === 'power') return { id: uid(), type: 'power', base: blank(), exponent: blank() };
  if (kind === 'root' || kind === 'group') return { id: uid(), type: kind, body: blank() };
  if (kind === 'matrix2' || kind === 'matrix3') { const size = kind === 'matrix2' ? 2 : 3; return { id: uid(), type: 'matrix', size, cells: Array.from({ length: size * size }, blank) }; }
  if (!templateCounts[kind]) throw Error('Unknown symbol.');
  return template(kind, Array.from({ length: templateCounts[kind] }, blank));
}
export function latex(n: MathNode | Sequence): string {
  if (n.type === 'sequence') return n.children.map(latex).join('');
  if (n.type === 'number') return n.value || '\\square';
  if (n.type === 'identifier') return ({ 'π': '\\pi ', 'θ': '\\theta ', '∞': '\\infty ', 'σ': '\\sigma ' } as Record<string, string>)[n.value] || n.value;
  if (n.type === 'operator') return ({ '×': '\\times ', '÷': '\\div ', '−': '-', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ' } as Record<string, string>)[n.value] || n.value;
  if (n.type === 'fraction') return `\\frac{${latex(n.numerator)}}{${latex(n.denominator)}}`;
  if (n.type === 'power') return `{${latex(n.base)}}^{${latex(n.exponent)}}`;
  if (n.type === 'root') return `\\sqrt{${latex(n.body)}}`;
  if (n.type === 'group') return `\\left(${latex(n.body)}\\right)`;
  if (n.type === 'matrix') { const rows = []; for (let i = 0; i < n.size; i++) rows.push(n.cells.slice(i * n.size, (i + 1) * n.size).map(latex).join('&')); return `\\begin{bmatrix}${rows.join('\\\\')}\\end{bmatrix}`; }
  if (n.type !== 'template') return '';
  const a = n.args.map(latex);
  if (n.kind === 'integral') return `\\int_{${a[0]}}^{${a[1]}}${a[2]}\\,d${a[3]}`;
  if (n.kind === 'sum') return `\\sum_{${a[0]}}^{${a[1]}}${a[2]}`;
  if (n.kind === 'limit') return `\\lim_{${a[0]}\\to ${a[1]}}${a[2]}`;
  if (n.kind === 'derivative') return `\\frac{d}{d${a[1]}}${a[0]}`;
  if (n.kind === 'choose') return `\\binom{${a[0]}}{${a[1]}}`;
  if (n.kind === 'percent') return `{${a[0]}}\\%`;
  if (n.kind === 'factorial') return `{${a[0]}}!`;
  if (n.kind === 'abs') return `\\left|${a[0]}\\right|`;
  if (n.kind === 'mean') return `\\overline{${a[0]}}`;
  return `${n.kind === 'probability' ? 'P' : n.kind === 'f' ? 'f' : '\\' + n.kind}\\left(${a[0]}\\right)`;
}
export type SymbolItem = { key: string; label: string; title: string };
const symbol = (key: string, label: string, title: string): SymbolItem => ({ key, label, title });
export const topics: Record<string, SymbolItem[]> = {
  Numbers: [symbol('fraction', 'a/b', 'Fraction'), symbol('power', 'xⁿ', 'Power'), symbol('root', '√', 'Root'), symbol('percent', '%', 'Percent'), symbol('group', '( )', 'Parentheses')],
  Algebra: ['x', 'y', 'n', 't'].map(x => symbol(x, x, `Variable ${x}`)).concat([symbol('abs', '|x|', 'Absolute value'), ...['≤', '≥', '≠', '<', '>'].map(x => symbol(x, x, x))]),
  Functions: ['f', 'sin', 'cos', 'tan', 'ln', 'log', 'exp'].map(x => symbol(x, x === 'f' ? 'f(x)' : x, x)),
  Calculus: [symbol('derivative', 'd/dx', 'Derivative'), symbol('integral', '∫', 'Integral'), symbol('limit', 'lim', 'Limit'), symbol('sum', 'Σ', 'Sum'), symbol('infinity', '∞', 'Infinity')],
  Matrices: [symbol('matrix2', '[2×2]', '2 by 2 matrix'), symbol('matrix3', '[3×3]', '3 by 3 matrix'), symbol('det', 'det', 'Determinant')],
  'Probability & stats': [symbol('probability', 'P(A)', 'Probability'), symbol('factorial', 'n!', 'Factorial'), symbol('choose', 'nCk', 'Binomial coefficient'), symbol('mean', 'x̄', 'Mean'), symbol('sigma', 'σ', 'Sigma')]
};
export const symbolList = Object.values(topics).flat();
