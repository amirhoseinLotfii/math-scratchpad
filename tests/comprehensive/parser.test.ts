import { describe, expect, it, test } from 'vitest';
import { parse } from '../../src/parser';
import { latex, type MathNode, type Sequence } from '../../src/model';

const tex = (s: string) => latex(parse(s));
const types = (s: Sequence) => s.children.map((n: MathNode) => n.type);

describe('parser: supported constructs', () => {
  it.each([
    ['1+2', '1+2'], ['12-3', '12-3'], ['a−b', 'a-b'], ['a*b', 'a\\times b'], ['a×b', 'a\\times b'], ['a÷b', 'a\\div b'],
    ['a=b', 'a=b'], ['a<b', 'a<b'], ['a>b', 'a>b'], ['a≤b', 'a\\le b'], ['a≥b', 'a\\ge b'], ['a≠b', 'a\\ne b'],
    ['a\\times b', 'a\\times b'], ['a\\cdot b', 'a·b'], ['a\\div b', 'a\\div b'],
    ['a\\le b', 'a\\le b'], ['a\\leq b', 'a\\le b'], ['a\\ge b', 'a\\ge b'], ['a\\geq b', 'a\\ge b'], ['a\\ne b', 'a\\ne b'], ['a\\neq b', 'a\\ne b'],
    ['\\frac{1}{2}', '\\frac{1}{2}'], ['\\dfrac{a}{b}', '\\frac{a}{b}'], ['\\tfrac{a}{b}', '\\frac{a}{b}'], ['1/2', '\\frac{1}{2}'], ['1/2^3', '\\frac{1}{{2}^{3}}'],
    ['x^2', '{x}^{2}'], ['x^{10}', '{x}^{10}'], ['2^10', '{2}^{10}'], ['e^{i\\pi}', '{e}^{i\\pi }'],
    ['\\sqrt{4}', '\\sqrt{4}'], ['\\sqrt4', '\\sqrt{4}'], ['√4', '\\sqrt{4}'], ['√{x+1}', '\\sqrt{x+1}'],
    ['3%', '{3}\\%'], ['5!', '{5}!'],
    ['\\pi', '\\pi '], ['π', '\\pi '], ['\\theta', '\\theta '], ['θ', '\\theta '], ['\\infty', '\\infty '], ['∞', '\\infty '], ['\\sigma', '\\sigma '], ['σ', '\\sigma '],
    ['sin(x)', '\\sin\\left(x\\right)'], ['cos(x)', '\\cos\\left(x\\right)'], ['tan(x)', '\\tan\\left(x\\right)'], ['ln(x)', '\\ln\\left(x\\right)'], ['log(x)', '\\log\\left(x\\right)'], ['exp(x)', '\\exp\\left(x\\right)'], ['f(x)', 'f\\left(x\\right)'], ['abs(x)', '\\left|x\\right|'],
    ['\\sin x', '\\sin\\left(x\\right)'], ['\\ln{e}', '\\ln\\left(e\\right)'], ['\\abs{x}', '\\left|x\\right|'],
    ['(1+2)', '\\left(1+2\\right)'], ['\\left(x\\right)', '\\left(x\\right)'], ['2(3)', '2\\left(3\\right)'],
    ['-3', '-3'], ['--3', '--3'], ['a,b', 'a,b'], ['a،b', 'a,b'], ['\\square', '\\square'], ['abc', 'abc'], ['\\frac{\\frac{1}{2}}{3}', '\\frac{\\frac{1}{2}}{3}'],
    ['\\frac{1}{2}^2', '{\\frac{1}{2}}^{2}'],
  ])('%s -> %s', (input, expected) => expect(tex(input)).toBe(expected));

  it('parses numbers and decimals as single number leaves', () => {
    for (const n of ['0', '7', '123', '1.5', '.5', '5.', '00012']) { const s = parse(n); expect(s.children).toHaveLength(1); expect(s.children[0]).toMatchObject({ type: 'number', value: n }); }
  });
  it('builds the correct node types', () => {
    expect(types(parse('\\frac{1}{2}+x^2'))).toEqual(['fraction', 'operator', 'power']);
    expect(types(parse('√4'))).toEqual(['root']);
    expect(types(parse('(1)'))).toEqual(['group']);
    expect(parse('3%').children[0]).toMatchObject({ type: 'template', kind: 'percent' });
    expect(parse('5!').children[0]).toMatchObject({ type: 'template', kind: 'factorial' });
    expect(parse('sin(x)').children[0]).toMatchObject({ type: 'template', kind: 'sin' });
  });
  it('gives every node a unique id', () => {
    const ids: string[] = []; const walk = (x: unknown) => { if (x && typeof x === 'object') { const o = x as Record<string, unknown>; if (typeof o.id === 'string') ids.push(o.id); Object.values(o).forEach(walk); } };
    walk(parse('\\frac{1+x}{2^{3}}+\\sqrt{(4)}')); expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parser: whitespace, $ wrappers, unicode digits', () => {
  it.each([['$1+2$', '1+2'], ['$$x$$', 'x'], ['  3 ', '3'], ['\t1\n+\n2 ', '1+2'], ['1 000', '1000'], ['a\\,b', 'ab'], ['a\\;b', 'ab'], ['a\\ b', 'ab'], ['a\\!b', 'ab'], ['۱۲+٣', '12+3'], ['۰.۵', '0.5'], ['\\frac {1} {2}', '\\frac{1}{2}']])('%j -> %s', (i, o) => expect(tex(i)).toBe(o));
});

describe('parser: malformed input gives clear errors', () => {
  it.each([
    ['', 'Enter a formula first.'], ['   ', 'Enter a formula first.'], ['$$', 'Enter a formula first.'], ['{}', 'Enter a formula first.'], ['()', 'Enter a formula first.'],
    ['1.2.3', 'Check the decimal number.'], ['..', 'Check the decimal number.'],
    ['/2', 'Put a value before this operator.'], ['+/2', 'Put a value before this operator.'], ['!', 'Put a value before this operator.'], ['%', 'Put a value before this operator.'], ['^2', 'Put a value before this operator.'],
    ['(x', 'Close the parenthesis.'], ['{x', 'Close the LaTeX brace.'], ['x)', 'Unsupported input near ).'], ['x}', 'Unsupported input near }.'],
    ['x^', 'Complete the expression.'], ['\\frac{1}', 'Complete the expression.'], ['\\sqrt', 'Complete the expression.'],
    ['\\', 'Check the LaTeX command.'], ['\\\\', 'Check the LaTeX command.'], ['\\%', 'Put a value before this operator.'], ['\\{x\\}', 'Check the LaTeX command.'],
    ['\\alpha', 'Cannot import \\alpha yet. Insert its template from Symbols.'], ['\\timesx', 'Cannot import \\timesx yet. Insert its template from Symbols.'],
    ['|x', 'Close the absolute value bar.'], ['[x', 'Close the square bracket.'], ['x]', 'Unsupported input near ].'], ['sin', 'Add the argument of sin, e.g. sin(x).'], ['\\cos+1', 'Add the argument of cos, e.g. cos(x).'], ['x_1', 'Unsupported input near _1.'], ['x²', 'Unsupported input near ².'], ['٫5', 'Unsupported input near ٫5.'], ['x^^2', 'Unsupported input near ^2.'],
    ['\\sqrt[3]{8}', 'nth roots like \\sqrt[3]{x} are not supported yet'],
    ['sin x)', 'Unsupported input near ).'],
  ])('%j -> %s', (input, message) => expect(() => parse(input)).toThrow(message));
  it('rejects input over 4000 characters, accepts exactly 4000 and large flat expressions', () => {
    expect(() => parse('1'.repeat(4001))).toThrow('Use at most 4000 characters.');
    expect(() => parse('1'.repeat(4000))).not.toThrow();
    expect(() => parse('1+'.repeat(299) + '1')).not.toThrow();
  });
  it('limits node count to 600 atoms', () => {
    expect(() => parse(Array.from({ length: 601 }, () => 'x').join('+'))).toThrow('Expression is too large.');
  });
  it('limits nesting to 16 levels', () => {
    expect(() => parse('('.repeat(16) + 'x' + ')'.repeat(16))).not.toThrow();
    expect(() => parse('('.repeat(17) + 'x' + ')'.repeat(17))).toThrow('Expression nesting is too deep.');
    expect(() => parse('\\sqrt{'.repeat(17) + 'x' + '}'.repeat(17))).toThrow('Expression nesting is too deep.');
    expect(() => parse('('.repeat(5000))).toThrow();
  });
  it('never throws non-Error values on random garbage', () => {
    const chars = '0123456789+-*/^%!(){}[]|\\$ ,.xπ√_abcfrqst';
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) { const s = Array.from({ length: 1 + Math.floor(rnd() * 20) }, () => chars[Math.floor(rnd() * chars.length)]).join(''); try { parse(s); } catch (e) { expect(e).toBeInstanceOf(Error); expect((e as Error).message.length).toBeGreaterThan(0); } }
  });
});

describe('parser: regressions for fixed bugs', () => {
  it('BUG-1 square brackets are real bracket groups and serialize as brackets', () => {
    expect(tex('20-[3\\times(5-2)]')).toBe('20-\\left[3\\times \\left(5-2\\right)\\right]');
    expect(parse('[x]').children[0]).toMatchObject({ type: 'group', delim: 'bracket' });
    expect(parse('(x)').children[0]).not.toHaveProperty('delim');
    expect(tex('\\left[x+1\\right]^2')).toBe('{\\left[x+1\\right]}^{2}');
    expect(tex('[[1]]')).toBe('\\left[\\left[1\\right]\\right]');
    expect(() => parse('[x)')).toThrow('Unsupported input near ).');
  });
  it('BUG-1 nth root gives a clear error (the root node has no index)', () => expect(() => parse('\\sqrt[3]{8}')).toThrow(/nth roots/));
  it('BUG-2 \\frac12 shorthand uses one digit per argument', () => {
    expect(tex('\\frac12')).toBe('\\frac{1}{2}'); expect(tex('\\frac123')).toBe('\\frac{1}{2}3'); expect(tex('\\frac1{23}')).toBe('\\frac{1}{23}'); expect(tex('\\frac ab')).toBe('\\frac{a}{b}'); expect(tex('\\sqrt12')).toBe('\\sqrt{1}2');
    expect(tex('x^10')).toBe('{x}^{10}'); // students mean x^{10}; ^ keeps the whole number
  });
  it('BUG-3 \\sin(x) has one pair of parentheses', () => {
    for (const f of ['sin', 'cos', 'tan', 'log', 'ln', 'exp']) { expect(tex(`\\${f}(x)`)).toBe(tex(`${f}(x)`)); expect(tex(`\\${f}(x)`)).toBe(`\\${f}\\left(x\\right)`); }
    expect(tex('\\log(10)')).toBe('\\log\\left(10\\right)');
  });
  it('BUG-4 bare function names are read as functions', () => {
    expect(tex('sin x')).toBe('\\sin\\left(x\\right)'); expect(tex('cos 30')).toBe('\\cos\\left(30\\right)'); expect(tex('2sin x+1')).toBe('2\\sin\\left(x\\right)+1');
    expect(tex('ln{e}')).toBe('\\ln\\left(e\\right)'); expect(tex('sine')).toBe('sine'); expect(tex('x')).toBe('x');
  });
});
