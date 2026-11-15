import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { validateBank } from '../../../src/features/drive-bank/drive-bank';
import { subscribeToLearnEvents, type LearnEvent } from '../../../src/sync/events';
import { sampleBank, mount } from '../../helpers/lesson-screen';
describe('lesson gate', () => {
  it('gates concept navigation on an answer, logs a confirmed skip, then summarizes and starts sorted practice', async () => {
    const user = userEvent.setup();
    const { onProgress, onStartPractice } = mount();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-concept-title');
    const next = screen.getByRole('button', { name: 'Next section →' });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Option B' }).closest('label')).toHaveClass('lesson-choice-selected');
    await user.click(screen.getByRole('radio', { name: 'Confidence 1' }));
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByText('Section 2 of 2')).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-concept-title');

    await user.click(screen.getByRole('button', { name: 'Skip check' }));
    const dialog = await screen.findByRole('dialog', { name: 'Skip this check?' });
    expect(within(dialog).getByText('This check will be logged as skipped.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Skip check' }));
    expect(onProgress.mock.lastCall?.[0].skippedChecks).toEqual([
      expect.objectContaining({ questionId: 'SAMPLE-1.1-L02', at: expect.any(String) }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    expect(screen.getByRole('heading', { name: 'Lesson summary' })).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-summary-title');
    expect(screen.getByRole('region', { name: 'Checks to review' })).toHaveTextContent('SAMPLE-1.1-L01');
    expect(screen.getByRole('region', { name: 'Skipped checks' })).toHaveTextContent('SAMPLE-1.1-L02');
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    expect(onStartPractice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'SAMPLE-1.1' }),
      expect.objectContaining({ status: 'practising', practiceStartedAt: expect.any(String) }),
      expect.arrayContaining([
        expect.objectContaining({ id: 'SAMPLE-1.1-P01' }),
        expect.objectContaining({ id: 'SAMPLE-1.1-P02' }),
        expect.objectContaining({ id: 'SAMPLE-1.1-P03' }),
      ]),
    );
  });

  it('requires both parts of a true_false_why check before unlocking the next section', async () => {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as {
      questions: Array<Record<string, unknown>>;
    };
    raw.questions[0] = { ...raw.questions[0], answerType: 'true_false_why', choices: ['ignored-a', 'ignored-b'] };
    const bank = validateBank(raw),
      { onProgress } = mount(bank);
    const next = screen.getByRole('button', { name: 'Next section →' });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'True' }));
    expect(next).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reason for answer SAMPLE-1.1-L01' }),
      'The statement follows from the definition.',
    );
    expect(next).toBeEnabled();
    expect(onProgress.mock.lastCall?.[0]).toMatchObject({
      answeredCheckIds: ['SAMPLE-1.1-L01'],
      checkAnswers: { 'SAMPLE-1.1-L01': { type: 'true_false_why', choice: 'true', reason: 'The statement follows from the definition.' } },
    });
  });

  it('logs a confirmed section-check skip while keeping section navigation available', async () => {
    const user = userEvent.setup();
    const events: LearnEvent[] = [];
    const unsubscribe = subscribeToLearnEvents((event) => events.push(event));
    try {
      mount();
      await user.click(screen.getByRole('radio', { name: 'Option B' }));
      await user.click(screen.getByRole('button', { name: 'Next section →' }));
      await user.click(screen.getByRole('button', { name: 'Skip check' }));
      const dialog = screen.getByRole('dialog', { name: 'Skip this check?' });
      await user.click(within(dialog).getByRole('button', { name: 'Skip check' }));
      const failedGate = events.find((event) => event.type === 'gate_failed');
      expect(failedGate).toBeDefined();
      const next = screen.getByRole('button', { name: 'Next section →' });
      expect(next).toBeEnabled();
      await user.click(next);
      expect(events.some((event) => event.type === 'gate_passed' && event.itemId === failedGate?.itemId)).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it('reveals example steps progressively and retains the revealed count across concept navigation', async () => {
    const user = userEvent.setup();
    const bank = sampleBank();
    bank.lessons![0].concepts[0].blocks.push({
      type: 'example',
      title: 'Sample worked example',
      text: 'Try this sample expression.',
      steps: ['First sample teaching step.', 'Second sample teaching step.', 'Third sample teaching step.'],
    });
    const { bank: mountedBank } = mount(bank);
    const reveal = screen.getByRole('button', { name: 'Show next step' });
    expect(screen.queryByText('First sample teaching step.')).not.toBeInTheDocument();
    expect(screen.getByText('Try it yourself first')).toBeInTheDocument();
    await user.click(reveal);
    expect(screen.getByText('First sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 steps shown')).toBeInTheDocument();
    expect(screen.getByText('First sample teaching step.').closest('.lesson-example-step')).toHaveAttribute('aria-current', 'step');
    expect(reveal).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Show next step' }));
    expect(screen.getByText('Second sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('Second sample teaching step.').closest('.lesson-example-step')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByRole('button', { name: 'Show all steps' }));
    expect(screen.getByText('Third sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('All 3 steps shown')).toBeInTheDocument();
    expect(screen.getByText('Third sample teaching step.').closest('.lesson-example-step')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByRole('radio', { name: 'Option A' }));
    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    await user.click(screen.getByRole('button', { name: '← Previous section' }));
    expect(screen.getByText('First sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('Second sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('Third sample teaching step.')).toBeInTheDocument();
    expect(mountedBank.lessons![0].concepts[0].blocks.at(-1)?.type).toBe('example');
  });
});
