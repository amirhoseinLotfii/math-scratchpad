import { describe, expect, it } from 'vitest';
import { actions, makeStore, initialState, exerciseOf } from '../../src/store';
import { blankStep, stepLatex, uid } from '../../src/features/math-editor/model/model';
import { generateOrderKey, compareOrderKeys } from '../../src/features/math-editor/model/order-key';
import { createLessonMathStore } from '../../src/features/lessons/lesson-math-check';
import type { BankQuestion } from '../../src/features/drive-bank/drive-bank';

describe('Phase 1: Priority #1 Typing & Bilingual Step Card acceptance', () => {
  it('AC-F3: generates midpoint order keys for inserting between steps', () => {
    const k1 = 'a0';
    const k2 = 'a1';
    const mid = generateOrderKey(k1, k2);
    expect(compareOrderKeys(k1, mid)).toBe(-1);
    expect(compareOrderKeys(mid, k2)).toBe(-1);
  });

  it('AC-F3: insertStepBetween inserts a new step with midpoint key without disturbing neighbors', () => {
    const store = makeStore(initialState());
    const ex = exerciseOf(store.getState().doc);
    const step1 = ex.steps[0];
    store.dispatch(actions.mathLiveInput({ stepId: step1.id, value: 'x^2 + 1' }));

    // Add step 2
    store.dispatch(actions.command({ type: 'newStep' }));
    const step2 = exerciseOf(store.getState().doc).steps[1];

    // Insert between step 1 and step 2
    store.dispatch(actions.insertStepBetween({ prevStepId: step1.id, nextStepId: step2.id }));
    const updatedSteps = exerciseOf(store.getState().doc).steps;
    expect(updatedSteps).toHaveLength(3);
    expect(updatedSteps[1].orderKey).toBeDefined();
    expect(compareOrderKeys(updatedSteps[0].orderKey!, updatedSteps[1].orderKey!)).toBe(-1);
    expect(compareOrderKeys(updatedSteps[1].orderKey!, updatedSteps[2].orderKey!)).toBe(-1);
  });

  it('AC-F4: newStep with copyPrevious copies previous step math', () => {
    const store = makeStore(initialState());
    const ex = exerciseOf(store.getState().doc);
    const step1 = ex.steps[0];
    store.dispatch(actions.mathLiveInput({ stepId: step1.id, value: '2x + 5 = 15' }));

    store.dispatch(actions.command({ type: 'newStep', copyPrevious: true }));
    const steps = exerciseOf(store.getState().doc).steps;
    expect(steps).toHaveLength(2);
    expect(stepLatex(steps[1])).toBe('2x + 5 = 15');
  });

  it('AC-F5: prefillStep1 initializes Step 1 with math expression when starting empty', () => {
    const question: BankQuestion = {
      id: 'TEST-Q1',
      mode: 'math',
      source: '3x - 7 = 14',
      prefillStep1: { latex: '3x - 7 = 14' }
    };
    const store = createLessonMathStore(question, false);
    const ex = exerciseOf(store.getState().doc);
    expect(ex.steps).toHaveLength(1);
    expect(ex.steps[0].mathLatex).toBe('3x - 7 = 14');
    expect(ex.steps[0].isPrefilledFromQuestion).toBe(true);
    expect(ex.steps[0].segments?.find(s => s.type === 'math')?.content).toBe('3x - 7 = 14');
  });

  it('AC-F6: splitBranch splits \\pm equation into + and - child branches', () => {
    const store = makeStore(initialState());
    const ex = exerciseOf(store.getState().doc);
    const step1 = ex.steps[0];
    store.dispatch(actions.mathLiveInput({ stepId: step1.id, value: 'x = \\pm 3' }));

    store.dispatch(actions.splitBranch({ stepId: step1.id }));
    const steps = exerciseOf(store.getState().doc).steps;
    expect(steps).toHaveLength(3);
    const plusStep = steps[1];
    const minusStep = steps[2];

    expect(plusStep.branchSign).toBe('plus');
    expect(plusStep.parentStepId).toBe(step1.id);
    expect(stepLatex(plusStep)).toBe('x = + 3');

    expect(minusStep.branchSign).toBe('minus');
    expect(minusStep.parentStepId).toBe(step1.id);
    expect(stepLatex(minusStep)).toBe('x = - 3');
  });

  it('AC-T1 & AC-T3: updates Persian text segment without altering math expression', () => {
    const store = makeStore(initialState());
    const ex = exerciseOf(store.getState().doc);
    const step1 = ex.steps[0];
    store.dispatch(actions.mathLiveInput({ stepId: step1.id, value: 'y = 2x' }));

    // User types Persian note
    store.dispatch(actions.updateStepText({ stepId: step1.id, text: 'تعیین شیب خط\nمرحله دوم' }));
    const step = exerciseOf(store.getState().doc).steps[0];
    const persian = step.segments?.find(s => s.type === 'persian_text');
    expect(persian?.content).toBe('تعیین شیب خط\nمرحله دوم');
    expect(stepLatex(step)).toBe('y = 2x');
  });
});
