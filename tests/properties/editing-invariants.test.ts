import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { actions, activeInfo, initialState, makeStore, stepOf } from '../../src/store';
import { latex } from '../../src/model';
import { serialize, validateSession } from '../../src/persistence';
const options = { seed: 20261026, numRuns: 75 };

describe('PROP: deterministic generated editing histories', () => {
 it('arbitrary valid numeric text survives export/import without changing its expression', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 60 }), digits => {
   const s = makeStore(initialState()); s.dispatch(actions.command({ type: 'clear' }));
   for (const value of digits) s.dispatch(actions.command({ type: 'digit', value: String(value) }));
   const restored = validateSession(JSON.parse(serialize(s.getState()))).doc;
   expect(latex(stepOf(restored).expression)).toBe(digits.join('')); expect(activeInfo(restored)).toBeDefined();
  }), options);
 });
 it('Undo reverses exactly the committed text edit for every generated input', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 30 }), digits => {
   const s = makeStore(initialState()); s.dispatch(actions.command({ type: 'clear' }));
   for (const value of digits) s.dispatch(actions.command({ type: 'digit', value: String(value) }));
   const before = s.getState().doc;
   s.dispatch(actions.command({ type: 'digit', value: '7' })); s.dispatch(actions.undo());
   expect(s.getState().doc).toEqual(before);
  }), options);
 });
 it('generated bounded edit/navigation sequences preserve valid exportable trees and caret bounds', () => {
  fc.assert(fc.property(fc.array(fc.constantFrom('digit', 'backspace', 'deleteForward', 'left', 'right', 'undo', 'redo'), { maxLength: 50 }), commands => {
   const s = makeStore(initialState());
   for (const command of commands) {
    if (command === 'left' || command === 'right') s.dispatch(actions.horizontal(command === 'left' ? -1 : 1));
    else if (command === 'undo') s.dispatch(actions.undo()); else if (command === 'redo') s.dispatch(actions.redo());
    else if (command === 'digit') s.dispatch(actions.command({ type: 'digit', value: '6' }));
    else s.dispatch(actions.command({ type: command }));
    const doc = s.getState().doc, info = activeInfo(doc);
    if (info?.node.type === 'number') { expect(doc.cursor.offset).toBeGreaterThanOrEqual(0); expect(doc.cursor.offset).toBeLessThanOrEqual(info.node.value.length); }
    expect(validateSession(JSON.parse(serialize(s.getState()))).doc.exercises).toEqual(doc.exercises);
   }
  }), options);
 });
});
