import type { Exercise, MathNode, Sequence } from './model';
import type { DiagnosticQuestion } from './diagnostic';

export type FractionResult = { n: bigint; d: bigint };
export type DiagnosticGrade = {
  numeric: 'correct' | 'incorrect' | 'unverified';
  form: 'simplified' | 'equivalent-unsimplified' | 'not-required' | 'unverified';
  steps: 'consistent' | 'inconsistent' | 'unverified';
  reason: string;
};

function fraction(n: bigint, d: bigint): FractionResult {
  if (d === 0n) throw Error('Division by zero');
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) { const r = a % b; a = b; b = r; }
  const g = a || 1n;
  return { n: n / g, d: d / g };
}
const add = (a: FractionResult, b: FractionResult) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: FractionResult, b: FractionResult) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: FractionResult, b: FractionResult) => fraction(a.n * b.n, a.d * b.d);
const div = (a: FractionResult, b: FractionResult) => fraction(a.n * b.d, a.d * b.n);
const same = (a: FractionResult, b: FractionResult) => a.n === b.n && a.d === b.d;
function num(value: string): FractionResult {
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(value)) throw Error('Incomplete numeric field');
  const [whole, part = ''] = value.split('.');
  return fraction(BigInt((whole || '0') + part), 10n ** BigInt(part.length));
}
function squareRoot(value: bigint) {
  if (value < 0n) throw Error('Negative radicand');
  if (value < 2n) return value;
  let a = value, b = (a + 1n) / 2n;
  while (b < a) { a = b; b = (b + value / b) / 2n; }
  if (a * a !== value) throw Error('Non-rational root requires review');
  return a;
}
type Value = { value: FractionResult; whole?: boolean; frac?: boolean };
type Op = { op: string };
type Item = Value | Op;
function valueNode(node: MathNode): Value {
  if (node.type === 'number') return { value: num(node.value), whole: /^\d+$/.test(node.value) };
  if (node.type === 'fraction') return { value: div(evaluateSequence(node.numerator), evaluateSequence(node.denominator)), frac: true };
  if (node.type === 'group') return { value: evaluateSequence(node.body) };
  if (node.type === 'power') {
    const base = evaluateSequence(node.base), exp = evaluateSequence(node.exponent);
    if (exp.d !== 1n || exp.n < 0n || exp.n > 32n) throw Error('Unsupported exponent');
    return { value: fraction(base.n ** exp.n, base.d ** exp.n) };
  }
  if (node.type === 'root') {
    const r = evaluateSequence(node.body);
    return { value: fraction(squareRoot(r.n), squareRoot(r.d)) };
  }
  if (node.type === 'template' && node.kind === 'abs') {
    const r = evaluateSequence(node.args[0]);
    return { value: fraction(r.n < 0n ? -r.n : r.n, r.d) };
  }
  throw Error('Notation requires manual review');
}
function tokenize(nodes: MathNode[]): Item[] {
  return nodes.map(n => n.type === 'operator' ? { op: n.value === '−' ? '-' : n.value === '×' ? '*' : n.value === '÷' ? '/' : n.value } : valueNode(n));
}
/** Exact rational evaluation of complete, supported mathematical expressions. */
export function evaluateSequence(seq: Sequence): FractionResult {
  const arr = tokenize(seq.children);
  let i = 0;
  const isValue = (v?: Item): v is Value => !!v && 'value' in v;
  const isOp = (v: Item | undefined, op: string) => !!v && 'op' in v && v.op === op;
  function atom(): FractionResult {
    if (!isValue(arr[i])) throw Error('Missing operand');
    const v = arr[i++] as Value;
    // A whole number immediately followed by a fraction is a mixed number.
    if (v.whole && isValue(arr[i]) && (arr[i] as Value).frac) {
      return add(v.value, (arr[i++] as Value).value);
    }
    return v.value;
  }
  function unary(): FractionResult {
    if (isOp(arr[i], '-')) { i++; const v = unary(); return fraction(-v.n, v.d); }
    if (isOp(arr[i], '+')) { i++; return unary(); }
    return atom();
  }
  function product(): FractionResult {
    let a = unary();
    while (isOp(arr[i], '*') || isOp(arr[i], '/')) {
      const operator = (arr[i++] as Op).op, b = unary();
      a = operator === '*' ? mul(a, b) : div(a, b);
    }
    return a;
  }
  function expression(): FractionResult {
    let a = product();
    while (isOp(arr[i], '+') || isOp(arr[i], '-')) {
      const operator = (arr[i++] as Op).op, b = product();
      a = operator === '+' ? add(a, b) : sub(a, b);
    }
    return a;
  }
  const result = expression();
  if (i !== arr.length) throw Error('Missing operator or unsupported notation');
  return result;
}
function splitEquality(seq: Sequence): Sequence[] {
  const parts: Sequence[] = [];
  let tokens: MathNode[] = [];
  for (const node of seq.children) {
    if (node.type === 'operator' && node.value === '=') {
      parts.push({ id: seq.id, type: 'sequence', children: tokens }); tokens = [];
    } else tokens.push(node);
  }
  parts.push({ id: seq.id, type: 'sequence', children: tokens });
  return parts;
}
function evaluateExpected(text: string) {
  const bits = text.split('/');
  const make = (s: string) => {
    const negative = s.startsWith('-');
    const r = num(negative ? s.slice(1) : s);
    return negative ? fraction(-r.n, r.d) : r;
  };
  return bits.length === 2 ? div(make(bits[0]), make(bits[1])) : make(text);
}
function simpleForm(seq: Sequence, result: FractionResult) {
  // Unary negative values in lowest terms are simplified, not unsimplified.
  let children = seq.children;
  let sign = 1n;
  if (children.length === 2 && children[0].type === 'operator' && children[0].value === '−') {
    sign = -1n;
    children = children.slice(1);
  }
  if (children.length !== 1) return false;
  const only = children[0];
  if (only.type === 'number') {
    return /^\d+$/.test(only.value) && result.d === 1n && sign * BigInt(only.value) === result.n;
  }
  if (only.type !== 'fraction') return false;
  let numerator = only.numerator.children;
  if (numerator.length === 2 && numerator[0].type === 'operator' && numerator[0].value === '−') {
    sign = -sign;
    numerator = numerator.slice(1);
  }
  if (numerator.length !== 1 || only.denominator.children.length !== 1) return false;
  const n = numerator[0], d = only.denominator.children[0];
  if (n.type !== 'number' || d.type !== 'number' || !/^\d+$/.test(n.value) || !/^\d+$/.test(d.value)) return false;
  return sign * BigInt(n.value) === result.n && BigInt(d.value) === result.d;
}
export function gradeDiagnostic(exercise: Exercise, question: DiagnosticQuestion): DiagnosticGrade {
  const marked = exercise.steps.find(s => s.final);
  const last = marked ?? exercise.steps.at(-1);
  if (!last) return { numeric: 'unverified', form: 'unverified', steps: 'unverified', reason: 'No solution entered' };
  let consistency: DiagnosticGrade['steps'] = 'consistent';
  for (const step of exercise.steps) {
    const parts = splitEquality(step.expression);
    if (parts.length < 2) continue;
    try {
      const evaluated = parts.map(evaluateSequence);
      if (evaluated.some((v, i) => i > 0 && !same(evaluated[i - 1], v))) consistency = 'inconsistent';
    } catch { consistency = 'unverified'; }
  }
  const parts = splitEquality(last.expression), lastPart = parts.at(-1)!;
  try {
    const actual = evaluateSequence(lastPart), expected = evaluateExpected(question.expected);
    const numeric = same(actual, expected) ? 'correct' as const : 'incorrect' as const;
    const form = numeric !== 'correct' || !question.simplest ? 'not-required' as const :
      simpleForm(lastPart, actual) ? 'simplified' as const : 'equivalent-unsimplified' as const;
    return { numeric, form, steps: consistency, reason: numeric === 'correct' ? 'Equivalent numerical value' : 'Different numerical value' };
  } catch (err) {
    return { numeric: 'unverified', form: 'unverified', steps: consistency === 'consistent' ? 'unverified' : consistency, reason: err instanceof Error ? err.message : 'Expression requires manual review' };
  }
}
