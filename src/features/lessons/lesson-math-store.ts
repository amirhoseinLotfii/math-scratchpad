import { initialState, makeStore } from '../../store';
import { blankStep, leaves, uid, type Step } from '../../model';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';

export function createLessonMathStore(question: BankQuestion, phone: boolean, savedSteps?: Step[]): ScratchStore {
  const state = initialState(),
    previous = state.doc.exercises[0],
    step = blankStep();
  const steps = savedSteps?.length ? (JSON.parse(JSON.stringify(savedSteps)) as Step[]) : [step];
  const exercise = {
    ...previous,
    id: uid(),
    bankQuestionId: question.id,
    source: question.source,
    mode: 'math' as const,
    prompt: question.prompt,
    steps,
  };
  state.doc.exercises = [exercise];
  state.doc.exerciseId = exercise.id;
  const activeStep = steps.at(-1)!;
  state.doc.cursor = {
    stepId: activeStep.id,
    nodeId: leaves(activeStep.expression)[0].node.id,
    sequenceId: null,
    index: 0,
    offset: 0,
    selected: null,
  };
  // The app keyboard is opened only after an explicit user action.
  state.keyboardOpen = false;
  return makeStore(state);
}
