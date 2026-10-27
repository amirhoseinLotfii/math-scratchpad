import { describe, it, expect } from 'vitest';
import { actions, exerciseOf, initialState, makeStore } from '../../src/store';
import { serialize, validateSession } from '../../src/persistence';

describe('Mobile session integrity', () => {
 it('protects the original first step even when later steps exist', () => {
  const store = makeStore(initialState());
  const first = exerciseOf(store.getState().doc).steps[0];
  store.dispatch(actions.command({ type: 'newStep' }));
  store.dispatch(actions.select({ stepId: first.id, sequenceId: first.expression.id, index: 0 }));
  store.dispatch(actions.command({ type: 'deleteStep' }));
  expect(exerciseOf(store.getState().doc).steps.map(s => s.id)).toContain(first.id);
 });
 it('exports all questions, working steps, confidence and time without modifying the session', () => {
  const store = makeStore(initialState());
  store.dispatch(actions.startFractionRound());
  store.dispatch(actions.command({ type: 'digit', value: '7' }));
  store.dispatch(actions.command({ type: 'newStep' }));
  store.dispatch(actions.setConfidence('medium'));
  store.dispatch(actions.addQuestionTime({ exerciseId: store.getState().doc.exerciseId, milliseconds: 1234 }));
  const before = JSON.stringify(store.getState().doc);
  const restored = validateSession(JSON.parse(serialize(store.getState())));
  expect(restored.doc.exercises).toEqual(store.getState().doc.exercises);
  expect(restored.doc.exercises).toHaveLength(20);
  expect(JSON.stringify(store.getState().doc)).toBe(before);
 });
});

describe('Step editing isolation', () => {
 it('reset clears only active step; Undo restores its expression', () => {
  const store = makeStore(initialState());
  const first = exerciseOf(store.getState().doc).steps[0];
  store.dispatch(actions.command({ type: 'newStep' }));
  store.dispatch(actions.command({ type: 'digit', value: '9' }));
  const second = exerciseOf(store.getState().doc).steps[1];
  store.dispatch(actions.command({ type: 'clear' }));
  expect(exerciseOf(store.getState().doc).steps[0].expression).toEqual(first.expression);
  expect(exerciseOf(store.getState().doc).steps[1].expression).not.toEqual(second.expression);
  store.dispatch(actions.undo());
  expect(exerciseOf(store.getState().doc).steps[1].expression).toEqual(second.expression);
 });
 it('deletes a later step while preserving other questions and a valid caret', () => {
  const store = makeStore(initialState());
  store.dispatch(actions.startFractionRound());
  store.dispatch(actions.command({ type: 'newStep' }));
  const before = store.getState().doc.exercises.slice(1);
  store.dispatch(actions.command({ type: 'deleteStep' }));
  expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
  expect(store.getState().doc.exercises.slice(1)).toEqual(before);
  expect(store.getState().doc.cursor.stepId).toBe(exerciseOf(store.getState().doc).steps[0].id);
 });
});
