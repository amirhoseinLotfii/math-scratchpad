import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { blankStep, type Step } from '../../src/model';
import { parse } from '../../src/parser';
import type { BankQuestion } from '../../src/features/drive-bank/drive-bank';
import type { ScratchStore } from '../../src/store';
import { questionWorkKey, type LessonWorkItem } from '../../src/features/lessons/lesson-work-items';
import { LessonWorkPane } from '../../src/features/lessons/lesson-work-pane';
import type { LessonWorkAnswer } from '../../src/features/lessons/types';

afterEach(cleanup);

function mount(question: BankQuestion, saved?: LessonWorkAnswer) {
  const key = questionWorkKey(question.id);
  const item: LessonWorkItem = {
    key,
    kind: 'exercise',
    question,
    title: question.prompt || question.source,
    workQuestion: { ...question, id: key },
  };
  const onWork = vi.fn();
  render(<LessonWorkPane
    items={[item]}
    selected={item}
    onSelect={vi.fn()}
    uiLang="en"
    getWorkStore={() => ({}) as ScratchStore}
    onWork={onWork}
    renderCheck={() => null}
    savedSteps={() => saved?.type === 'math' ? saved.steps : undefined}
    savedAnswer={() => saved}
  />);
  return { key, onWork };
}

describe('lesson section exercise answer controls', () => {
  it('uses a persistent text field for explanatory questions, not the math editor', () => {
    const { key, onWork } = mount({ id: 'TEXT-1', mode: 'text', source: 'Explain the rule.', prompt: 'Explain the rule.', answerType: 'text' });
    const answer = screen.getByRole('textbox');
    fireEvent.change(answer, { target: { value: 'It follows from the definition.' } });
    expect(document.querySelector('.lesson-math-editor')).not.toBeInTheDocument();
    expect(onWork).toHaveBeenLastCalledWith(key, { type: 'text', value: 'It follows from the definition.' });
  });

  it('restores choice and true/false-with-reason answers in their native controls', () => {
    mount({ id: 'CHOICE-1', mode: 'text', source: 'Choose.', answerType: 'choice', choices: ['A', 'B'] }, { type: 'choice', value: 'B' });
    expect(within(screen.getByRole('radiogroup', { name: /Answer choices/ })).getAllByRole('radio').map(input => (input as HTMLInputElement).checked)).toEqual([false, true]);
    cleanup();

    mount({ id: 'TF-1', mode: 'text', source: 'Is this true?', answerType: 'true_false_why' }, { type: 'true_false_why', choice: 'false', reason: 'A counterexample disproves it.' });
    expect((screen.getByRole('radio', { name: 'False' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('textbox')).toHaveValue('A counterexample disproves it.');
  });

  it('keeps legacy math steps visible and attaches them to the first typed response', () => {
    const step: Step = blankStep(); step.expression = parse('5+6');
    const { key, onWork } = mount({ id: 'TEXT-2', mode: 'text', source: 'Explain your method.', answerType: 'text' }, { type: 'text', value: '', legacyMathSteps: [step] });
    expect(screen.getByText('Previous math work (read only)')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Now written as text.' } });
    expect(onWork).toHaveBeenLastCalledWith(key, { type: 'text', value: 'Now written as text.', legacyMathSteps: [step] });
  });
});
