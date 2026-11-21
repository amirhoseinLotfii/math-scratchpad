import {
  blankStep,
  clone,
  isoLocal,
  MAX_SESSION_EXERCISES,
  stepIsBlank,
  stepLatex,
  uid,
  type Exercise,
} from '../model/model';
import { parse } from '../model/parser';
import { generateOrderKey } from '../model/order-key';
import { focusFirst } from './cursor-helpers';
import { exerciseOf, stepOf, type Command, type ScratchState } from './types';

export function applyStepLifecycleCommand(state: ScratchState, cmd: Command): boolean {
  const d = state.doc,
    ex = exerciseOf(d),
    current = stepOf(d),
    c = d.cursor;
  if (cmd.type === 'newStep') {
    if (ex.steps.length >= 40) throw Error('Maximum 40 steps per exercise.');
    const lastStep = ex.steps[ex.steps.length - 1];
    if (lastStep && !lastStep.orderKey) lastStep.orderKey = 'a0';
    const step = blankStep(generateOrderKey(lastStep?.orderKey), current?.branchId ?? 'main');
    if (cmd.copyPrevious && current && !stepIsBlank(current)) {
      step.expression = clone(current.expression);
      if (current.mathLatex) step.mathLatex = current.mathLatex;
      step.segments = [
        { segmentId: uid(), type: 'persian_text', content: '' },
        { segmentId: uid(), type: 'math', content: stepLatex(current) },
      ];
    }
    ex.steps.push(step);
    c.stepId = step.id;
    focusFirst(d, step.expression);
    return true;
  }
  if (cmd.type === 'insertStepBetween') {
    if (ex.steps.length >= 40) throw Error('Maximum 40 steps per exercise.');
    const prevIdx = ex.steps.findIndex(s => s.id === cmd.prevStepId);
    if (prevIdx < 0) return true;
    const prevStep = ex.steps[prevIdx];
    if (!prevStep.orderKey) prevStep.orderKey = 'a0';
    const nextStep = cmd.nextStepId
      ? ex.steps.find(s => s.id === cmd.nextStepId)
      : ex.steps[prevIdx + 1];
    if (nextStep && !nextStep.orderKey) nextStep.orderKey = generateOrderKey(prevStep.orderKey);
    const step = blankStep(
      generateOrderKey(prevStep.orderKey, nextStep?.orderKey),
      prevStep.branchId ?? 'main'
    );
    if (!stepIsBlank(prevStep)) {
      step.expression = clone(prevStep.expression);
      if (prevStep.mathLatex) step.mathLatex = prevStep.mathLatex;
      step.segments = [
        { segmentId: uid(), type: 'persian_text', content: '' },
        { segmentId: uid(), type: 'math', content: stepLatex(prevStep) },
      ];
    }
    ex.steps.splice(prevIdx + 1, 0, step);
    c.stepId = step.id;
    focusFirst(d, step.expression);
    return true;
  }
  if (cmd.type === 'splitBranch') {
    if (ex.steps.length + 2 > 40) throw Error('Maximum 40 steps per exercise.');
    const targetIdx = ex.steps.findIndex(s => s.id === cmd.stepId);
    if (targetIdx < 0) return true;
    const target = ex.steps[targetIdx];
    const math = stepLatex(target);
    const plusMath = math.replace(/\\pm|±/g, '+').replace(/\\mp|∓/g, '-');
    const minusMath = math.replace(/\\pm|±/g, '-').replace(/\\mp|∓/g, '+');
    const branchBaseId = uid();
    const plusOrderKey = generateOrderKey(target.orderKey);
    const plusStep = blankStep(plusOrderKey, `${branchBaseId}-plus`);
    plusStep.parentStepId = target.id;
    plusStep.branchSign = 'plus';
    plusStep.mathLatex = plusMath;
    try {
      plusStep.expression = parse(plusMath);
    } catch {
      plusStep.expression = clone(target.expression);
    }
    plusStep.segments = [
      { segmentId: uid(), type: 'persian_text', content: '' },
      { segmentId: uid(), type: 'math', content: plusMath },
    ];
    const nextStep = ex.steps[targetIdx + 1];
    const minusOrderKey = generateOrderKey(plusOrderKey, nextStep?.orderKey);
    const minusStep = blankStep(minusOrderKey, `${branchBaseId}-minus`);
    minusStep.parentStepId = target.id;
    minusStep.branchSign = 'minus';
    minusStep.mathLatex = minusMath;
    try {
      minusStep.expression = parse(minusMath);
    } catch {
      minusStep.expression = clone(target.expression);
    }
    minusStep.segments = [
      { segmentId: uid(), type: 'persian_text', content: '' },
      { segmentId: uid(), type: 'math', content: minusMath },
    ];
    ex.steps.splice(targetIdx + 1, 0, plusStep, minusStep);
    c.stepId = plusStep.id;
    focusFirst(d, plusStep.expression);
    return true;
  }
  if (cmd.type === 'deleteStep') {
    if (ex.steps[0].id === current.id) return true;
    const index = ex.steps.indexOf(current),
      removedFinal = current.final;
    ex.steps.splice(index, 1);
    const next = ex.steps[Math.min(index, ex.steps.length - 1)];
    if (removedFinal)
      ex.steps.forEach(step => {
        step.final = step.id === next.id;
      });
    c.stepId = next.id;
    focusFirst(d, next.expression);
    return true;
  }
  if (cmd.type === 'final') {
    const value = !current.final;
    ex.steps.forEach(s => {
      s.final = s.id === current.id && value;
    });
    if (value) ex.submittedAt = isoLocal();
    return true;
  }
  if (cmd.type === 'newProblem' || cmd.type === 'newExercise') {
    if (d.exercises.length >= MAX_SESSION_EXERCISES)
      throw Error(
        `Maximum ${MAX_SESSION_EXERCISES} exercises. Export a backup before starting another session.`
      );
    const step = blankStep();
    const source = cmd.type === 'newProblem' ? stepLatex(current) : cmd.source.trim();
    if (!source || source.length > 4000) throw Error('Enter a problem (at most 4000 characters).');
    const next: Exercise = {
      id: uid(),
      source,
      mode: cmd.type === 'newProblem' ? 'math' : cmd.mode,
      steps: [step],
    };
    if (cmd.type === 'newExercise' && cmd.expression) step.expression = clone(cmd.expression);
    d.exercises.push(next);
    d.exerciseId = next.id;
    c.stepId = step.id;
    focusFirst(d, step.expression);
    return true;
  }
  return false;
}
