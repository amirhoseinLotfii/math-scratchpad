import { describe, expect, it } from 'vitest';
import { buildTutorExport } from '../../src/features/session/export/tutor-export';
import { serialize, validateSession } from '../../src/persistence';
import { actions, exerciseOf, initialState, makeStore } from '../../src/store';
import { stepLatex } from '../../src/model';

describe('MathLive answer compatibility', () => {
  it('keeps exact LaTeX, Step identity, Final state, backups, and tutor export', () => {
    const store = makeStore(initialState());
    const exercise = exerciseOf(store.getState().doc);
    const step = exercise.steps[0];
    const stepId = step.id;
    const latex = String.raw`\frac{1}{\frac{2}{3}}+\lim_{x\to0}\frac{\sin x}{x}`;

    store.dispatch(actions.mathLiveInput({ stepId, value: latex }));
    expect(exerciseOf(store.getState().doc).steps[0].id).toBe(stepId);
    expect(stepLatex(exerciseOf(store.getState().doc).steps[0])).toBe(latex);
    expect(store.getState().past).toHaveLength(0);

    store.dispatch(actions.command({ type: 'final' }));
    const saved = validateSession(JSON.parse(serialize(store.getState())));
    expect(saved.doc.exercises[0].steps[0]).toMatchObject({ id: stepId, final: true, mathLatex: latex });
    expect(buildTutorExport(saved.doc).items[0].steps).toEqual([
      { step_id: stepId, number: 1, latex, is_final: true },
    ]);
  });

  it('keeps an empty MathLive placeholder unanswered and does not make keystrokes app-history entries', () => {
    const store = makeStore(initialState()), stepId = exerciseOf(store.getState().doc).steps[0].id;
    store.dispatch(actions.mathLiveInput({ stepId, value: String.raw`\placeholder{}` }));
    expect(exerciseOf(store.getState().doc).steps[0].mathLatex).toBe(String.raw`\placeholder{}`);
    expect(stepLatex(exerciseOf(store.getState().doc).steps[0])).toBe(String.raw`\square`);
    expect(store.getState().past).toHaveLength(0);
  });
});
