import { describe, expect, it } from 'vitest';
import { actions, activeInfo, exerciseOf, initialState, makeStore, stepOf } from '../src/store';
import { fields, latex, leaves, nodes, symbolList } from '../src/model';
import { parse } from '../src/parser';
import { fingerprint, reviewPayload } from '../src/review';
import { serialize, validateSession } from '../src/persistence';
const create = () => makeStore(initialState());

describe('Structural editing and Redux history', () => {
  it('keeps the required 2, 3, +, 1, 4 logical order and independent selections', () => {
    const store = create(); const step = stepOf(store.getState().doc);
    const all = leaves(step.expression); expect(all.map(x => 'value' in x.node && x.node.value)).toEqual(['2', '3', '+', '1', '4']);
    all.forEach(info => { store.dispatch(actions.select({ stepId: step.id, nodeId: info.node.id })); expect(activeInfo(store.getState().doc)?.node.id).toBe(info.node.id); });
    expect(all[0].path).toContain('Fraction 1 Numerator'); expect(all[1].path).toContain('Fraction 1 Denominator'); expect(all[3].path).toContain('Fraction 2 Numerator'); expect(all[4].path).toContain('Fraction 2 Denominator');
  });
  it('inserts operator and a new empty fraction on the main line without changing denominator', () => {
    const store = create(); const step = stepOf(store.getState().doc);
    store.dispatch(actions.select({ stepId: step.id, sequenceId: step.expression.id, index: 1 }));
    store.dispatch(actions.command({ type: 'operator', value: '×' }));
    store.dispatch(actions.command({ type: 'insert', value: 'fraction' }));
    const now = stepOf(store.getState().doc).expression;
    expect(latex(now)).toBe('\\frac{2}{3}\\times \\frac{\\square}{\\square}+\\frac{1}{4}');
    expect(activeInfo(store.getState().doc)?.path).toContain('Fraction 2 Numerator');
  });
  it('Next moves numerator to denominator then outside the fraction', () => {
    const store = create(); const step = stepOf(store.getState().doc);
    store.dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id }));
    store.dispatch(actions.next()); expect(activeInfo(store.getState().doc)?.path).toContain('Fraction 1 Denominator');
    store.dispatch(actions.next()); expect(store.getState().doc.cursor.sequenceId).toBe(step.expression.id); expect(store.getState().doc.cursor.index).toBe(1);
  });
  it('Next follows every integral field and exits at the main line', () => {
    const store = create(); store.dispatch(actions.command({ type: 'clear' })); store.dispatch(actions.command({ type: 'insert', value: 'integral' }));
    const ids = []; for (let i = 0; i < 4; i++) { ids.push(store.getState().doc.cursor.nodeId); store.dispatch(actions.next()); }
    expect(new Set(ids).size).toBe(4); expect(store.getState().doc.cursor.sequenceId).toBe(stepOf(store.getState().doc).expression.id);
  });
  it('edits the touched digit within 123', () => {
    const store = create(); store.dispatch(actions.command({ type: 'clear' })); for (const value of '123') store.dispatch(actions.command({ type: 'digit', value }));
    const step = stepOf(store.getState().doc); store.dispatch(actions.select({ stepId: step.id, nodeId: leaves(step.expression)[0].node.id, offset: 1 })); store.dispatch(actions.command({ type: 'digit', value: '9' }));
    expect(latex(stepOf(store.getState().doc).expression)).toBe('1923'); store.dispatch(actions.undo()); expect(latex(stepOf(store.getState().doc).expression)).toBe('123'); store.dispatch(actions.redo()); expect(latex(stepOf(store.getState().doc).expression)).toBe('1923');
  });
  it('duplicates, cuts and pastes entire structures using distinct IDs and undo', () => {
    const store = create(); store.dispatch(actions.selectParent()); const original = store.getState().doc.cursor.selected; expect(original).toBeTruthy();
    store.dispatch(actions.copyStructure()); store.dispatch(actions.command({ type: 'duplicate' })); expect(store.getState().doc.cursor.selected).not.toBe(original);
    store.dispatch(actions.command({ type: 'cut' })); const afterCut = latex(stepOf(store.getState().doc).expression);
    store.dispatch(actions.command({ type: 'paste' })); expect(latex(stepOf(store.getState().doc).expression)).not.toBe(afterCut);
    const ids = nodes(stepOf(store.getState().doc).expression).map(x => x.node.id); expect(new Set(ids).size).toBe(ids.length);
    store.dispatch(actions.undo()); expect(latex(stepOf(store.getState().doc).expression)).toBe(afterCut);
  });
  it('keeps later steps, marks them for review, and adds an empty line', () => {
    const store = create(), first = stepOf(store.getState().doc); store.dispatch(actions.command({ type: 'newStep' })); store.dispatch(actions.command({ type: 'digit', value: '7' }));
    const secondId = store.getState().doc.cursor.stepId; store.dispatch(actions.select({ stepId: first.id, nodeId: leaves(first.expression)[0].node.id })); store.dispatch(actions.command({ type: 'digit', value: '9' }));
    const second = exerciseOf(store.getState().doc).steps.find(s => s.id === secondId)!; expect(latex(second.expression)).toBe('7'); expect(second.status).toBe('needs-review');
    store.dispatch(actions.command({ type: 'newStep' })); expect(latex(stepOf(store.getState().doc).expression)).toBe('\\square');
  });
  it('creates a new problem and preserves the previous notebook', () => {
    const store = create(), before = exerciseOf(store.getState().doc); store.dispatch(actions.command({ type: 'newProblem' })); const all = store.getState().doc.exercises;
    expect(all).toHaveLength(2); expect(all[0]).toEqual(before); expect(all[1].source).toBe(latex(before.steps[0].expression)); expect(latex(all[1].steps[0].expression)).toBe('\\square');
  });
  it('supports all catalog templates and keeps 4 unique recent items plus favorites', () => {
    const store = create(); for (const value of ['root', 'power', 'integral', 'sum', 'limit', 'root']) { store.dispatch(actions.command({ type: 'clear' })); store.dispatch(actions.command({ type: 'insert', value })); }
    expect(store.getState().prefs.recent).toEqual(['root', 'limit', 'sum', 'integral']); store.dispatch(actions.favorite('integral')); expect(store.getState().prefs.favorites).toContain('integral');
    for (const symbol of symbolList.filter(x => !['x', 'y', 'n', 't', 'infinity', 'sigma', '≤', '≥', '≠', '<', '>'].includes(x.key))) { store.dispatch(actions.command({ type: 'clear' })); store.dispatch(actions.command({ type: 'insert', value: symbol.key })); expect(fields(stepOf(store.getState().doc).expression.children[0]).length).toBeGreaterThan(0); expect(store.getState().notice).toBe(''); }
  });
});
describe('Review payload and persistence', () => {
  it('includes all ordered steps, current scope and only explicitly marked final', () => {
    const store = create(); const first = stepOf(store.getState().doc); store.dispatch(actions.command({ type: 'newStep' })); store.dispatch(actions.command({ type: 'digit', value: '5' }));
    expect(reviewPayload(store.getState().doc).finalAnswer).toBeNull(); store.dispatch(actions.command({ type: 'final' })); store.dispatch(actions.select({ stepId: first.id, nodeId: leaves(first.expression)[0].node.id })); const p = reviewPayload(store.getState().doc);
    expect(p.reviewThroughStep).toBe(1); expect(p.steps.map(s => s.number)).toEqual([1, 2]); expect(p.finalAnswer).toEqual({ step: 2, latex: '5' });
  });
  it('tracks copied snapshot truthfully through edits and undo', () => {
    const store = create(); const before = fingerprint(store.getState().doc), id = store.getState().doc.exerciseId; store.dispatch(actions.copied({ exerciseId: id, snapshot: before }));
    store.dispatch(actions.command({ type: 'digit', value: '5' })); expect(fingerprint(store.getState().doc)).not.toBe(store.getState().copies[id]); store.dispatch(actions.undo()); expect(fingerprint(store.getState().doc)).toBe(store.getState().copies[id]);
  });
  it('roundtrips v2 and migrates legacy v1 without losing math', () => {
    const store = create(); const { doc, prefs } = validateSession(JSON.parse(serialize(store.getState()))); expect(doc.exercises).toEqual(store.getState().doc.exercises); expect(prefs).toEqual(store.getState().prefs);
    const legacy = { version: 1, state: { exercises: doc.exercises, exercise: doc.exerciseId, step: doc.cursor.stepId, node: doc.cursor.nodeId, caret: 1 } }; expect(validateSession(legacy).doc.cursor.offset).toBe(1);
  });
  it('rejects malformed, duplicate-ID and excessive sessions', () => {
    const store = create(); const data = JSON.parse(serialize(store.getState())); data.doc.exercises[0].steps[0].expression.children[0].numerator.children[0].value = '<script>bad</script>';
    expect(() => validateSession(data)).toThrow(); const d = JSON.parse(serialize(store.getState())); d.doc.exercises[0].steps[0].id = d.doc.exercises[0].id; expect(() => validateSession(d)).toThrow();
  });
  it('normalizes Persian/Arabic digits and fails unsupported LaTeX explicitly', () => {
    expect(latex(parse('۲/۳ + ١/٤'))).toBe('\\frac{2}{3}+\\frac{1}{4}'); expect(() => parse('\\unknown{x}')).toThrow('Cannot import'); expect(() => parse('1.2.3')).toThrow();
  });
});
