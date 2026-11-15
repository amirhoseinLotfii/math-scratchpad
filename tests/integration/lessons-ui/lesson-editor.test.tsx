import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { validateBank, type BankQuestion } from '../../../src/features/drive-bank/drive-bank';
import { sampleBank, mount } from '../../helpers/lesson-screen';
describe('lesson editor', () => {
  it('uses a text response without rendering math-only instructions or tools', async () => {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as {
      questions: Array<Record<string, unknown>>;
    };
    raw.questions[0] = { ...raw.questions[0], mode: 'text', answerType: 'text', source: 'Short response prompt' };
    const bank = validateBank(raw);
    const user = userEvent.setup();
    mount(bank);
    expect(screen.getByLabelText('Answer for check SAMPLE-1.1-L01')).toBeInTheDocument();
    expect(screen.queryByText('Write each step')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Numeric keys')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Answer for check SAMPLE-1.1-L01'), 'A temporary practice response');
    expect(screen.getByRole('button', { name: 'Next section →' })).toBeEnabled();
  });

  it('reuses the per-Step MathLive editor and opens the app keyboard on request for a math check', () => {
    const { onProgress } = mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Option A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next section →' }));
    const editor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    expect(within(editor).getByLabelText('Step 1 expression')).toBeInTheDocument();
    expect(within(editor).queryByRole('group', { name: 'Numeric keys' })).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole('button', { name: 'Show Keyboard' }));
    expect(within(editor).getByRole('group', { name: 'Numeric keys' })).toBeInTheDocument();
    fireEvent.keyDown(within(editor).getByLabelText('Step 1 expression'), { key: '8' });
    expect(onProgress.mock.lastCall?.[0].answeredCheckIds).toContain('SAMPLE-1.1-L02');
    fireEvent.click(within(editor).getByRole('button', { name: 'Add step' }));
    const finalAnswer = within(editor).getByRole('button', { name: 'Final answer, Step 2' });
    expect(finalAnswer).toHaveTextContent('Final answer');
    fireEvent.click(finalAnswer);
    expect(within(editor).getByRole('button', { name: 'Final answer, Step 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(editor).getByRole('button', { name: 'Hide Keyboard' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(within(editor).getByLabelText('Step 1 expression'), { key: '9' });
    expect(within(editor).getByText('Needs review')).toBeInTheDocument();
  });

  it('supports Ctrl+Alt concept navigation and ignores the shortcut inside an answer editor', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('radio', { name: 'Option A' }));
    act(() => fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true, altKey: true }));
    expect(screen.getByText('Section 2 of 2')).toBeInTheDocument();
    const editor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    act(() => fireEvent.keyDown(editor, { key: 'ArrowLeft', ctrlKey: true, altKey: true }));
    expect(screen.getByText('Section 2 of 2')).toBeInTheDocument();
  });

  it('allows a zero-check concept through and marks a lesson with no practice as done', async () => {
    const bank = sampleBank();
    bank.lessons![0].concepts[0].checkQuestionIds = [];
    bank.questions = bank.questions.filter((question) => question.id === 'SAMPLE-1.1-L01');
    bank.lessons![0].concepts = [bank.lessons![0].concepts[0]];
    const { onProgress } = mount(bank);
    expect(screen.getByRole('button', { name: 'Next section →' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next section →' }));
    expect(screen.getByText('No practice questions yet.')).toBeInTheDocument();
    expect(onProgress.mock.lastCall?.[0]).toMatchObject({ status: 'done', completedConceptIds: ['SAMPLE-1.1-C1'] });
  });

  it('routes a zero-concept lesson directly to its practice set only once', async () => {
    const bank = sampleBank();
    bank.lessons![0].concepts = [];
    const { onStartPractice } = mount(bank);
    await vi.waitFor(() => expect(onStartPractice).toHaveBeenCalledTimes(1));
    expect(onStartPractice.mock.lastCall?.[2].map((question: BankQuestion) => question.id)).toEqual([
      'SAMPLE-1.1-P01',
      'SAMPLE-1.1-P02',
      'SAMPLE-1.1-P03',
    ]);
  });

  it('requires confirmation and records Skip to practice in lesson progress', async () => {
    const user = userEvent.setup();
    const { onProgress, onStartPractice } = mount();
    await user.click(screen.getByRole('button', { name: 'Skip to practice' }));
    const dialog = screen.getByRole('dialog', { name: 'Skip to practice?' });
    expect(onStartPractice).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onProgress.mock.lastCall?.[0].learnSkipped).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Skip to practice' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Skip to practice?' })).getByRole('button', { name: 'Skip to practice' }));
    expect(onProgress.mock.lastCall?.[0]).toMatchObject({
      status: 'practising',
      learnSkipped: { at: expect.any(String) },
      practiceStartedAt: expect.any(String),
    });
    expect(onStartPractice.mock.lastCall?.[2].map((question: BankQuestion) => question.id)).toEqual([
      'SAMPLE-1.1-P01',
      'SAMPLE-1.1-P02',
      'SAMPLE-1.1-P03',
    ]);
  });
});
