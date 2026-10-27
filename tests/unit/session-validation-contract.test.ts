import { describe, expect, it } from 'vitest';
import { initialState } from '../../src/store';
import { serialize, validateSession } from '../../src/persistence';
const fixture = () => JSON.parse(serialize(initialState()));
describe('SCHEMA: Zod-compatible known-field validation contract', () => {
 it.each(['ultra', '', 42, true])('rejects invalid provided confidence %s instead of silently dropping it', confidence => {
  const data = fixture(); data.doc.exercises[0].confidence = confidence;
  expect(() => validateSession(data)).toThrow();
 });
 it.each([-1, Infinity, NaN, '1000'])('rejects invalid provided elapsedMs %s', elapsedMs => {
  const data = fixture(); data.doc.exercises[0].elapsedMs = elapsedMs;
  expect(() => validateSession(data)).toThrow();
 });
 it('allows absent optional confidence without inventing a choice', () => {
  expect(validateSession(fixture()).doc.exercises[0].confidence).toBeUndefined();
 });
 it('rejects excessive source length before hydration', () => {
  const data = fixture(); data.doc.exercises[0].source = '1'.repeat(4001);
  expect(() => validateSession(data)).toThrow();
 });
 it('rejects too many questions', () => {
  const data = fixture(); data.doc.exercises = Array.from({ length: 41 }, () => data.doc.exercises[0]);
  expect(() => validateSession(data)).toThrow();
 });
 it('rejects too many steps before traversing their node trees', () => {
  const data = fixture(), exercise = data.doc.exercises[0]; exercise.steps = Array.from({ length: 41 }, () => exercise.steps[0]);
  expect(() => validateSession(data)).toThrow();
 });
 it('strips unknown executable/answer-bank fields while preserving supplied mathematical work', () => {
  const data = fixture(); data.doc.exercises[0].answerKey = 'secret'; data.doc.exercises[0].onLoad = 'execute';
  const result = validateSession(data).doc.exercises[0] as unknown as Record<string, unknown>;
  expect(result.answerKey).toBeUndefined(); expect(result.onLoad).toBeUndefined(); expect(result.steps).toEqual(data.doc.exercises[0].steps);
 });
});
