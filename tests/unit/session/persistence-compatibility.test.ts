import fc from 'fast-check';
import { expect, it } from 'vitest';
import { initialState } from '../../../src/store';
import { serialize, validateSession } from '../../../src/persistence';
import { validateSession as legacyValidateSession } from '../../helpers/stage-a-legacy-validation';

function validate(validateInput: typeof validateSession, input: unknown): unknown {
  try { return { accepted: true, data: validateInput(input) }; }
  catch { return { accepted: false }; }
}

it('preserves validation and normalization over generated v1 and v2 sessions', () => {
  const initial = JSON.parse(serialize(initialState()));
  const optional = fc.oneof(fc.jsonValue(), fc.constant(undefined), fc.constant('نمونه'), fc.constant('high'));
  fc.assert(fc.property(
    fc.constantFrom('doc', 'prefs', 'exercise', 'step', 'cursor', 'session', 'version'),
    fc.constantFrom('source', 'mode', 'answerType', 'prompt', 'confidence', 'offset', 'mathLatex', 'expression', 'id', 'index'),
    optional,
    fc.boolean(),
    (target, field, value, legacy) => {
      const input = structuredClone(initial);
      const targets = {
        doc: input.doc, prefs: input.prefs, exercise: input.doc.exercises[0],
        step: input.doc.exercises[0].steps[0], cursor: input.doc.cursor, session: input.doc.session, version: input,
      };
      targets[target][target === 'version' ? 'version' : field] = value;
      const sample = legacy ? { ...input, version: 1, state: { ...input.doc, exercise: input.doc.exerciseId } } : input;
      expect(validate(validateSession, sample)).toEqual(validate(legacyValidateSession, sample));
    },
  ), { numRuns: 400, seed: 15_111_026 });
});
