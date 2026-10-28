import { describe, expect, it } from 'vitest';
import { actions, exerciseOf, initialState, makeStore, stepOf } from '../../src/store';
import { latex } from '../../src/model';
import { validateSession, serialize } from '../../src/persistence';

const setup = () => { const s = makeStore(initialState()); const doc = () => s.getState().doc; const tex = () => latex(stepOf(doc()).expression); return { s, doc, tex, d: s.dispatch }; };
const clear = (d: ReturnType<typeof setup>['d']) => d(actions.command({ type: 'clear' }));

describe('editor commands', () => {
  it('typing digits, operators, identifiers builds the expected latex', () => {
    const { d, tex } = setup(); clear(d);
    for (const v of '12') d(actions.command({ type: 'digit', value: v }));
    d(actions.command({ type: 'operator', value: '+' })); d(actions.command({ type: 'identifier', value: 'x' }));
    expect(tex()).toBe('12+x');
  });
  it('clear leaves one blank box', () => { const { d, tex } = setup(); clear(d); expect(tex()).toBe('\\square'); });
  it('inserts each structure from an empty step', () => {
    for (const [k, out] of [['fraction', '\\frac{\\square}{\\square}'], ['root', '\\sqrt{\\square}'], ['power', '{\\square}^{\\square}'], ['group', '\\left(\\square\\right)']]) {
      const { d, tex } = setup(); clear(d); d(actions.command({ type: 'insert', value: k })); expect(tex()).toBe(out);
    }
  });
  it('unknown insert shows a notice and does not change the step', () => {
    const { d, tex, s } = setup(); const before = tex(); d(actions.command({ type: 'insert', value: 'bogus' })); expect(tex()).toBe(before); expect(s.getState().notice).toBe('Unknown symbol.');
  });
  it('backspace removes the last digit', () => { const { d, tex } = setup(); clear(d); for (const v of '123') d(actions.command({ type: 'digit', value: v })); d(actions.command({ type: 'backspace' })); expect(tex()).toBe('12'); });
});

describe('steps, final answer, undo/redo', () => {
  it('adds a blank step and moves the cursor to it', () => {
    const { d, doc, tex } = setup(); d(actions.command({ type: 'newStep' }));
    expect(exerciseOf(doc()).steps).toHaveLength(2); expect(doc().cursor.stepId).toBe(exerciseOf(doc()).steps[1].id); expect(tex()).toBe('\\square');
  });
  it('final toggles and only one step can be final', () => {
    const { d, doc } = setup(); d(actions.command({ type: 'final' })); expect(exerciseOf(doc()).steps.map(x => x.final)).toEqual([true]);
    d(actions.command({ type: 'newStep' })); d(actions.command({ type: 'final' }));
    expect(exerciseOf(doc()).steps.map(x => x.final)).toEqual([false, true]);
    d(actions.command({ type: 'final' })); expect(exerciseOf(doc()).steps.map(x => x.final)).toEqual([false, false]);
  });
  it('deleteStep removes a step but never the last one', () => {
    const { d, doc } = setup(); d(actions.command({ type: 'newStep' })); d(actions.command({ type: 'deleteStep' }));
    expect(exerciseOf(doc()).steps).toHaveLength(1); d(actions.command({ type: 'deleteStep' })); expect(exerciseOf(doc()).steps).toHaveLength(1);
  });
  it('undo/redo restore exact documents and redo is cleared by a new edit', () => {
    const { d, doc, s } = setup(); const snap = () => JSON.stringify([exerciseOf(doc()).steps, doc().cursor]); const a = snap();
    d(actions.command({ type: 'newStep' })); const b = snap();
    d(actions.undo()); expect(snap()).toBe(a); d(actions.redo()); expect(snap()).toBe(b);
    expect(exerciseOf(doc()).startedAt).toBeTruthy(); // startedAt is intentionally kept across undo
    d(actions.undo()); d(actions.command({ type: 'digit', value: '5' })); expect(s.getState().future).toHaveLength(0);
    d(actions.redo()); expect(s.getState().future).toHaveLength(0);
  });
  it('undo on empty history is a no-op', () => { const { d, doc } = setup(); const a = JSON.stringify(doc()); d(actions.undo()); d(actions.undo()); expect(JSON.stringify(doc())).toBe(a); });
  it('history stays bounded under many edits', () => { const { d, s } = setup(); for (let i = 0; i < 500; i++) d(actions.command({ type: 'digit', value: '1' })); expect(s.getState().past.length).toBeLessThanOrEqual(80); });
  it('after many random commands the document always validates', () => {
    const { d, s } = setup(); const cmds = [() => d(actions.command({ type: 'digit', value: '7' })), () => d(actions.command({ type: 'operator', value: '+' })), () => d(actions.command({ type: 'insert', value: 'fraction' })), () => d(actions.command({ type: 'newStep' })), () => d(actions.command({ type: 'deleteStep' })), () => d(actions.command({ type: 'backspace' })), () => d(actions.command({ type: 'final' })), () => d(actions.undo()), () => d(actions.redo()), () => d(actions.next()), () => d(actions.horizontal(1)), () => d(actions.horizontal(-1)), () => d(actions.command({ type: 'insert', value: 'integral' }))];
    let seed = 11; for (let i = 0; i < 400; i++) { seed = (seed * 16807) % 2147483647; cmds[seed % cmds.length](); }
    expect(() => validateSession(JSON.parse(serialize(s.getState())))).not.toThrow();
  });
});

describe('session metadata', () => {
  it('anxiety and energy in range are stored', () => { const { d, doc } = setup(); d(actions.setSessionMeta({ anxiety: 1, energy: 5 })); expect(doc().session).toMatchObject({ anxiety: 1, energy: 5 }); });
  it('BUG-8 out-of-range or non-integer anxiety/energy are rejected by the reducer', () => {
    const { d, doc } = setup(); d(actions.setSessionMeta({ anxiety: 3, energy: 4 }));
    for (const bad of [9, 0, -1, 2.5, NaN, '3' as unknown as number]) { d(actions.setSessionMeta({ anxiety: bad })); expect(doc().session?.anxiety).toBeUndefined(); }
    d(actions.setSessionMeta({ anxiety: 5 })); expect(doc().session).toMatchObject({ anxiety: 5, energy: 4 });
    d(actions.setSessionMeta({ endedAt: 'x' })); expect(doc().session?.energy).toBe(4); // untouched when not in payload
  });
  it('persistence drops out-of-range anxiety/energy', () => {
    const st = initialState(); st.doc.session = { ...st.doc.session!, anxiety: 9, energy: 0 };
    const back = validateSession(JSON.parse(serialize(st))); expect(back.doc.session?.anxiety).toBeUndefined(); expect(back.doc.session?.energy).toBeUndefined();
  });
  it('skip and confidence are recorded per exercise', () => { const { d, doc } = setup(); d(actions.setSkipped(true)); d(actions.setConfidence('low')); expect(exerciseOf(doc())).toMatchObject({ skipped: true, confidence: 'low' }); });
  it('addQuestionTime accumulates and ignores unknown exercises', () => {
    const { d, doc } = setup(); const id = doc().exerciseId; d(actions.addQuestionTime({ exerciseId: id, milliseconds: 1500 })); d(actions.addQuestionTime({ exerciseId: id, milliseconds: 500 })); d(actions.addQuestionTime({ exerciseId: 'nope', milliseconds: 99 }));
    expect(exerciseOf(doc()).elapsedMs).toBe(2000);
  });
});
