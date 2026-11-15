import { blank, clone, leaves, type Document, type Exercise, type Sequence, isoLocal } from '../../../model';

import { exerciseOf, stepOf, type ScratchState, type PayloadAction } from './editor-state';
import { applyCommand, type Command } from './editor-command';
import { parse } from '../../../parser';
export function invalidateSubmission(exercise: Exercise) {
  // Confidence confirms the content that existed when the learner submitted.
  // Any meaningful edit requires an explicit confirmation of the new answer.
  delete exercise.confidence;
  delete exercise.submittedAt;
}
function invalidate(doc: Document, from: number) {
  const exercise = exerciseOf(doc);
  invalidateSubmission(exercise);
  exercise.steps.forEach((step, index) => {
    if (index >= from) step.status = index === from ? 'unchecked' : 'needs-review';
  });
}
function restoreExerciseEdit(doc: Document, snapshot: Document) {
  const old = snapshot.exercises.find((x) => x.id === doc.exerciseId);
  const current = exerciseOf(doc);
  if (!old) return;
  current.steps = clone(old.steps);
  doc.cursor = clone(snapshot.cursor);
}
export const editHandlers = {
  /** Persist a lossless math input snapshot alongside the legacy AST. */
  mathInput(state: ScratchState, action: PayloadAction<{ stepId: string; value: string; expression?: Sequence }>) {
    const exercise = exerciseOf(state.doc),
      index = exercise.steps.findIndex((step) => step.id === action.payload.stepId);
    const step = exercise.steps[index];
    if (!step || action.payload.value.length > 4000 || step.mathLatex === action.payload.value) return;
    const before = clone(state.doc);
    step.mathLatex = action.payload.value;
    if (action.payload.expression) step.expression = clone(action.payload.expression);
    else if (/^\s*(?:\\placeholder(?:\[[^\]]*\])?\{\}\s*)*$/.test(action.payload.value)) step.expression = blank();
    step.edited = true;
    if (!exercise.startedAt) exercise.startedAt = isoLocal();
    invalidate(state.doc, index);
    state.past.push(before);
    if (state.past.length > 80) state.past.shift();
    state.future = state.future.filter((snapshot) => snapshot.exerciseId !== exercise.id);
    state.doc.cursor.stepId = step.id;
    state.notice = '';
  },
  /** MathLive owns character-level undo and selection; persist its exact LaTeX without copying every key into app history. */
  mathLiveInput(state: ScratchState, action: PayloadAction<{ stepId: string; value: string }>) {
    const exercise = exerciseOf(state.doc),
      index = exercise.steps.findIndex((step) => step.id === action.payload.stepId);
    const step = exercise.steps[index];
    if (!step || action.payload.value.length > 4000) return;
    const value = action.payload.value || String.raw`\placeholder{}`;
    if (step.mathLatex === value) return;
    step.mathLatex = value;
    const blankValue = /^\s*(?:\\placeholder(?:\[[^\]]*\])?\{\}\s*)+$/.test(value);
    if (blankValue) step.expression = blank();
    else {
      try {
        step.expression = parse(value);
      } catch {
        /* Keep the last compatible AST; mathLatex is the lossless source. */
      }
    }
    step.edited = true;
    if (!exercise.startedAt) exercise.startedAt = isoLocal();
    invalidate(state.doc, index);
    state.future = state.future.filter((snapshot) => snapshot.exerciseId !== exercise.id);
    const first = leaves(step.expression)[0]?.node;
    state.doc.cursor = { stepId: step.id, nodeId: first?.id ?? null, sequenceId: null, index: 0, offset: 0, selected: null };
    state.notice = '';
  },
  command(state: ScratchState, action: PayloadAction<Command>) {
    const before = clone(state.doc),
      exId = state.doc.exerciseId,
      index = exerciseOf(state.doc).steps.indexOf(stepOf(state.doc));
    try {
      applyCommand(state, action.payload);
      if (JSON.stringify(before.exercises) === JSON.stringify(state.doc.exercises)) return;
      {
        const touched = exerciseOf(state.doc);
        if (!touched.startedAt) touched.startedAt = isoLocal();
      }
      state.past.push(before);
      if (state.past.length > 80) state.past.shift();
      state.future = state.future.filter((x) => x.exerciseId !== exId);
      if (state.doc.exerciseId === exId) {
        const previousStep = exerciseOf(before).steps[index];
        const changedStep = exerciseOf(state.doc).steps.find((step) => step.id === previousStep.id);
        if (changedStep && JSON.stringify(previousStep.expression) !== JSON.stringify(changedStep.expression)) {
          delete changedStep.mathLatex;
          changedStep.edited = true;
          invalidate(state.doc, index);
        } else if (!changedStep) invalidate(state.doc, index);
      }
      state.notice = '';
    } catch (error) {
      state.doc = before;
      state.notice = error instanceof Error ? error.message : 'Could not edit.';
    }
  },
  undo(state: ScratchState) {
    const index = state.past.map((doc) => doc.exerciseId).lastIndexOf(state.doc.exerciseId);
    if (index < 0) return;
    const [previous] = state.past.splice(index, 1);
    state.future.push(clone(state.doc));
    restoreExerciseEdit(state.doc, previous);
    state.notice = '';
  },
  redo(state: ScratchState) {
    const index = state.future.map((doc) => doc.exerciseId).lastIndexOf(state.doc.exerciseId);
    if (index < 0) return;
    const [next] = state.future.splice(index, 1);
    state.past.push(clone(state.doc));
    restoreExerciseEdit(state.doc, next);
    state.notice = '';
  },
};
