import { freshNode, uid, type Exercise } from '../../src/model';
import { initialState } from '../../src/store';

export function makeSizedSession(targetBytes: number) {
  const state = initialState();
  const first = state.doc.exercises[0];
  const cloneStep = (index: number) => ({
    ...structuredClone(first.steps[0]),
    id: uid(),
    expression: freshNode(first.steps[0].expression),
    // Distinct data keeps the fixture realistic for serialization and local storage.
    mathLatex: String(index).padEnd(3800, '7'),
  });
  const steps = Math.max(1, Math.round(targetBytes / 4800));
  const exercises: Exercise[] = [first];
  for (let i = 1; i < steps; i += 35) {
    const length = Math.min(35, steps - i);
    exercises.push({
      ...first,
      id: uid(),
      steps: Array.from({ length }, (_, offset) => cloneStep(i + offset)),
    });
  }
  state.doc.exercises = exercises;
  return state;
}
