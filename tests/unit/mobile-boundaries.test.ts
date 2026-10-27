import { describe, it, expect } from 'vitest';
import { actions, activeInfo, exerciseOf, initialState, makeStore, stepOf } from '../../src/store';
import { latex } from '../../src/model';
import { serialize, validateSession } from '../../src/persistence';
const fresh = () => makeStore(initialState());

describe('Number editing boundaries', () => {
 it.each(['12.30', '0', '999999', '0.125'])('preserves the entered value %s through delete and Undo', value => {
  const s = fresh(); s.dispatch(actions.command({ type: 'clear' }));
  for (const digit of value) s.dispatch(actions.command({ type: 'digit', value: digit }));
  const before = latex(stepOf(s.getState().doc).expression);
  s.dispatch(actions.command({ type: 'backspace' })); s.dispatch(actions.undo());
  expect(latex(stepOf(s.getState().doc).expression)).toBe(before);
 });
 it('rejects a second decimal point without adding an Undo entry', () => {
  const s = fresh(); s.dispatch(actions.command({ type: 'clear' }));
  for (const value of '1.2') s.dispatch(actions.command({ type: 'digit', value }));
  const count = s.getState().past.length;
  s.dispatch(actions.command({ type: 'digit', value: '.' }));
  expect(latex(stepOf(s.getState().doc).expression)).toBe('1.2');
  expect(s.getState().past).toHaveLength(count);
 });
 it('bounds number length and keeps a valid caret after the rejected input', () => {
  const s = fresh(); s.dispatch(actions.command({ type: 'clear' }));
  for (let i = 0; i < 61; i++) s.dispatch(actions.command({ type: 'digit', value: '1' }));
  expect(latex(stepOf(s.getState().doc).expression)).toHaveLength(60);
  expect(s.getState().doc.cursor.offset).toBe(60);
 });
 it.each(['fraction', 'group', 'root', 'power'])('supports filling %s after insertion and restoring it through Undo', value => {
  const s = fresh(); s.dispatch(actions.command({ type: 'clear' }));
  s.dispatch(actions.command({ type: 'insert', value }));
  const before = latex(stepOf(s.getState().doc).expression);
  s.dispatch(actions.command({ type: 'digit', value: '4' }));
  expect(latex(stepOf(s.getState().doc).expression)).not.toBe(before);
  s.dispatch(actions.undo()); expect(latex(stepOf(s.getState().doc).expression)).toBe(before);
  expect(activeInfo(s.getState().doc)).toBeDefined();
 });
});
describe('Step limits and history', () => {
 it('rejects a forty-first step atomically', () => {
  const s = fresh(); for (let i = 1; i < 40; i++) s.dispatch(actions.command({ type: 'newStep' }));
  const before = s.getState().doc;
  s.dispatch(actions.command({ type: 'newStep' }));
  expect(s.getState().doc).toEqual(before);
  expect(s.getState().notice).toContain('40');
 });
 it('does not clear the only first step when its delete action is dispatched', () => {
  const s = fresh(), before = s.getState().doc;
  s.dispatch(actions.command({ type: 'deleteStep' })); expect(s.getState().doc).toEqual(before);
 });
 it('new editing after Undo invalidates Redo for that question', () => {
  const s = fresh(); s.dispatch(actions.command({ type: 'digit', value: '5' })); s.dispatch(actions.undo());
  s.dispatch(actions.command({ type: 'digit', value: '6' }));
  const before = s.getState().doc; s.dispatch(actions.redo()); expect(s.getState().doc).toEqual(before);
 });
 it('only one step can be marked final and toggling final does not change mathematics', () => {
  const s = fresh(); const first = latex(stepOf(s.getState().doc).expression);
  s.dispatch(actions.command({ type: 'final' })); s.dispatch(actions.command({ type: 'newStep' })); s.dispatch(actions.command({ type: 'final' }));
  expect(exerciseOf(s.getState().doc).steps.filter(x => x.final)).toHaveLength(1);
  expect(latex(exerciseOf(s.getState().doc).steps[0].expression)).toBe(first);
 });
});
describe('Question and timer isolation', () => {
 it.each([-1, NaN, Infinity])('ignores invalid elapsed-time delta %s', milliseconds => {
  const s = fresh(); s.dispatch(actions.addQuestionTime({ exerciseId: s.getState().doc.exerciseId, milliseconds }));
  expect(exerciseOf(s.getState().doc).elapsedMs ?? 0).toBe(0);
 });
 it('attributes a delayed timer flush to its original question', () => {
  const s = fresh(); s.dispatch(actions.startFractionRound()); const first = s.getState().doc.exerciseId;
  s.dispatch(actions.adjacentExercise(1)); s.dispatch(actions.addQuestionTime({ exerciseId: first, milliseconds: 1000 }));
  expect(s.getState().doc.exercises[0].elapsedMs).toBe(1000);
  expect(exerciseOf(s.getState().doc).elapsedMs ?? 0).toBe(0);
 });
 it('ignores unknown question IDs for both switching and timer updates', () => {
  const s = fresh(), before = s.getState().doc;
  s.dispatch(actions.switchExercise('unknown')); s.dispatch(actions.addQuestionTime({ exerciseId: 'unknown', milliseconds: 1000 }));
  expect(s.getState().doc).toEqual(before);
 });
 it('does not wrap Previous or Next around question-list boundaries', () => {
  const s = fresh(); s.dispatch(actions.startFractionRound()); const first = s.getState().doc.exerciseId;
  s.dispatch(actions.adjacentExercise(-1)); expect(s.getState().doc.exerciseId).toBe(first);
  const last = s.getState().doc.exercises.at(-1)!.id; s.dispatch(actions.switchExercise(last));
  s.dispatch(actions.adjacentExercise(1)); expect(s.getState().doc.exerciseId).toBe(last);
 });
});
describe('Imported JSON validation and recovery', () => {
 it.each(['empty questions', 'empty steps', 'duplicate IDs', 'unknown node', 'multiple finals', 'unsupported version'])('rejects %s without modifying the open session', kind => {
  const s = fresh(), before = s.getState().doc, data = JSON.parse(serialize(s.getState()));
  const ex = data.doc.exercises[0];
  if (kind === 'empty questions') data.doc.exercises = [];
  if (kind === 'empty steps') ex.steps = [];
  if (kind === 'duplicate IDs') ex.steps[0].id = ex.id;
  if (kind === 'unknown node') ex.steps[0].expression.children[0].type = 'script';
  if (kind === 'multiple finals') { ex.steps[0].final = true; ex.steps.push({ ...ex.steps[0], id: 'another' }); }
  if (kind === 'unsupported version') data.version = 999;
  expect(() => validateSession(data)).toThrow(); expect(s.getState().doc).toEqual(before);
 });
 it('recovers stale cursor IDs into a real editable step', () => {
  const s = fresh(), data = JSON.parse(serialize(s.getState()));
  data.doc.cursor.stepId = 'gone'; data.doc.cursor.nodeId = 'gone';
  const doc = validateSession(data).doc;
  expect(exerciseOf(doc).steps.some(x => x.id === doc.cursor.stepId)).toBe(true);
  expect(activeInfo(doc)).toBeDefined();
 });
 it('restores JSON into a fresh store and clears unrelated edit history', () => {
  const s = fresh(); s.dispatch(actions.command({ type: 'digit', value: '3' }));
  const restored = validateSession(JSON.parse(serialize(s.getState())));
  s.dispatch(actions.command({ type: 'digit', value: '4' })); s.dispatch(actions.load(restored));
  expect(s.getState().doc.exercises).toEqual(restored.doc.exercises);
  expect(s.getState().past).toEqual([]); expect(s.getState().future).toEqual([]);
 });
});

describe('Export privacy and metadata completeness', () => {
 it('does not include answer-bank keys or editor undo history in exported student work', () => {
  const s = fresh(); s.dispatch(actions.startFractionRound()); s.dispatch(actions.command({ type: 'digit', value: '2' }));
  const data = JSON.parse(serialize(s.getState()));
  expect(data.past).toBeUndefined(); expect(data.future).toBeUndefined();
  expect(data.doc.exercises.every((x: any) => !('expected' in x) && !('answerKey' in x))).toBe(true);
 });
 it('roundtrips skipped, final-answer and original-question metadata together', () => {
  const s = fresh(); s.dispatch(actions.startFractionRound());
  s.dispatch(actions.command({ type: 'digit', value: '2' })); s.dispatch(actions.command({ type: 'final' }));
  s.dispatch(actions.setSkipped(true)); s.dispatch(actions.setConfidence('low'));
  const original = s.getState().doc.exercises;
  expect(validateSession(JSON.parse(serialize(s.getState()))).doc.exercises).toEqual(original);
 });
});
