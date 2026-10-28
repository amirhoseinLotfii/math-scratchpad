import { describe, expect, it } from 'vitest';
import { parse } from '../../src/parser';
import { ascii, fields, freshNode, latex, leaves, makeStructure, nodes, templateCounts, findSequence, isoLocal } from '../../src/model';
import { initialState, stepOf } from '../../src/store';
import { serialize, validateSession } from '../../src/persistence';

const stable = ['x^2', '{x+1}^{2}', '5!', '{n+1}!', '3%', '{50}%', 'abs(x)', '|x-1|', '\\sin(x)', 'sin x', '\\frac12', '[1+2]', '20-[3\\times(5-2)]', '\\left[x\\right]^2', '\\frac{1}{2}^2', 'e^{i\\pi}', 'a,b', '\\sqrt{(x)}', 'x^{y^{z}}', '1+2', '\\frac{1}{2}', '\\frac{\\frac{1}{2}}{3}+4', '\\sqrt{x+1}', 'a\\times b\\div c', 'a\\le b', 'a\\ge b', 'a\\ne b', '\\pi +\\theta ', '(1+2)\\times 3', 'f(x)', '-3', '1.5+.5', '\\square', 'x=y'];
describe('serialize -> parse round trips', () => {
  it.each(stable)('latex(parse(latex(parse(%s)))) is a fixed point', s => { const once = latex(parse(s)); expect(latex(parse(once))).toBe(once); });
  it('structural round trip: parse(latex(t)) has the same node types as t', () => {
    const shape = (x: unknown): unknown => Array.isArray(x) ? x.map(shape) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'id').map(([k, v]) => [k, shape(v)])) : x;
    for (const s of stable) { const t = parse(s); expect(shape(parse(latex(t)))).toEqual(shape(t)); }
  });
  it('brackets survive persistence with their delimiter', () => {
    const state = initialState(); stepOf(state.doc).expression = parse('[x]'); const back = validateSession(JSON.parse(serialize(state)));
    expect(back.doc.exercises[0].steps[0].expression.children[0]).toMatchObject({ type: 'group', delim: 'bracket' });
  });
  it('every simple structure survives session serialize/validate', () => {
    for (const s of stable) {
      const state = initialState(); stepOf(state.doc).expression = parse(s);
      const back = validateSession(JSON.parse(serialize(state)));
      expect(latex(back.doc.exercises[0].steps[0].expression)).toBe(latex(parse(s)));
    }
  });
  // BUG-5 regression
  it('BUG-5 x^2 round trip is stable', () => { const once = latex(parse('x^2')); expect(latex(parse(once))).toBe(once); });
  it('BUG-5 5! round trip is stable', () => { const once = latex(parse('5!')); expect(latex(parse(once))).toBe(once); });
  // BUG-6 regression
  it('BUG-6 percent output can be re-imported', () => { expect(() => parse(latex(parse('3%')))).not.toThrow(); });
  it('BUG-6 abs output can be re-imported', () => { expect(() => parse(latex(parse('abs(x)')))).not.toThrow(); });
  // BUG-7 regression
  it('BUG-7 a step containing a comma survives persistence', () => {
    const state = initialState(); stepOf(state.doc).expression = parse('a,b');
    expect(() => validateSession(JSON.parse(serialize(state)))).not.toThrow();
  });
});

describe('model helpers', () => {
  it('ascii converts Persian and Arabic-Indic digits only', () => { expect(ascii('۰۱۲۳۴۵۶۷۸۹ ٠١٢٣٤٥٦٧٨٩ abc')).toBe('0123456789 0123456789 abc'); });
  it('makeStructure builds every template with the right arity', () => {
    for (const [k, n] of Object.entries(templateCounts)) { const s = makeStructure(k); expect(s.type).toBe('template'); expect(fields(s)).toHaveLength(n); }
    for (const k of ['fraction', 'power', 'root', 'group', 'matrix2', 'matrix3']) expect(() => makeStructure(k)).not.toThrow();
    expect(fields(makeStructure('matrix3'))).toHaveLength(9);
    expect(() => makeStructure('nope')).toThrow('Unknown symbol.');
  });
  it('latex renders every template kind', () => {
    const out = Object.keys(templateCounts).map(k => latex(makeStructure(k)));
    expect(out.every(x => x.length > 0)).toBe(true);
    expect(latex(makeStructure('integral'))).toBe('\\int_{\\square}^{\\square}\\square\\,d\\square');
    expect(latex(makeStructure('matrix2'))).toBe('\\begin{bmatrix}\\square&\\square\\\\\\square&\\square\\end{bmatrix}');
  });
  it('freshNode gives new ids at every depth but the same latex', () => {
    const s = parse('\\frac{1}{\\sqrt{2}}'); const c = freshNode(s);
    expect(latex(c)).toBe(latex(s)); const a = new Set(nodes(s).map(x => x.node.id)); expect(nodes(c).some(x => a.has(x.node.id))).toBe(false);
  });
  it('leaves and paths are in reading order', () => {
    const s = parse('\\frac{2}{3}+\\frac{1}{4}');
    expect(leaves(s).map(x => (x.node as { value: string }).value)).toEqual(['2', '3', '+', '1', '4']);
    expect(findSequence(s, s.id)).toBe(s); expect(findSequence(s, 'missing')).toBeUndefined();
  });
  it('isoLocal includes the local offset', () => { expect(isoLocal(new Date())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/); });
});
