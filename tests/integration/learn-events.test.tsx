import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { initialState, makeStore } from '../../src/store';
import { resetLearnEventRuntimeForTests, subscribeToLearnEvents } from '../../src/sync/events';
import { ActivityTracker } from '../../src/sync/activity-tracker';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import { validateBank, type DriveBank } from '../../src/features/drive-bank/drive-bank';

afterEach(() => {
  cleanup();
  resetLearnEventRuntimeForTests();
});

describe('learning UI event integration', () => {
  it('records a real step-editor action as an immutable step_added event', () => {
    const events: Array<{ type: string; itemId?: string; steps?: readonly string[] }> = [];
    const unsubscribe = subscribeToLearnEvents(event => events.push(event));
    const store = makeStore(initialState());
    render(<Provider store={store}><App /></Provider>);

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    const added = events.find(event => event.type === 'step_added');
    expect(added).toBeDefined();
    expect(added?.itemId).toBeTruthy();
    expect(added?.steps?.length).toBeGreaterThan(0);
    unsubscribe();
  });

  it('records manual question-timer pause and resume separately from tab distraction', async () => {
    const events: string[] = [];
    const unsubscribe = subscribeToLearnEvents(event => events.push(event.type));
    render(<Provider store={makeStore(initialState())}><App /></Provider>);
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(events).toContain('scope_paused');
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(events).toContain('scope_resumed');
    unsubscribe();
  });

  it('records a typed learner check as submitted without inventing correctness', async () => {
    const events: Array<{ type: string; itemId?: string; userAnswer?: string; verdict?: string; verdictSource?: string }> = [];
    const unsubscribe = subscribeToLearnEvents(event => events.push(event));
    const bank = validateBank(JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as unknown) as DriveBank;
    const lesson = bank.lessons!.find(item => item.id === 'SAMPLE-1.1')!;
    const store = makeStore(initialState());
    render(<Provider store={store}><LessonScreen bank={bank} lesson={lesson} onBack={() => undefined} onStartPractice={() => undefined} eventContext={{ bankVersion: 'sample-v1', session: 'S001', chapter: 1 }} /></Provider>);

    const answerOption = screen.getAllByRole('radio')[0];
    await userEvent.click(answerOption);

    expect(events.some(event => event.type === 'lesson_open')).toBe(true);
    expect(events.some(event => event.type === 'chunk_read')).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'check_answer', itemId: 'SAMPLE-1.1-L01', verdict: 'submitted', verdictSource: 'none',
    }));
    expect(events.find(event => event.type === 'check_answer')?.userAnswer).toBeTruthy();
    unsubscribe();
  });

  it('times each page chunk and emits its read event when leaving the chunk', () => {
    const observed: Array<{ type: string; itemId?: string; ts: string; durationMs?: number; endTs?: string }> = [];
    const unsubscribe = subscribeToLearnEvents(event => observed.push(event));
    const bank = validateBank(JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as unknown) as DriveBank;
    const lesson = bank.lessons!.find(item => item.id === 'SAMPLE-1.1')!;
    const tracker = new ActivityTracker({ bankVersion: 'sample-v1', session: 'S001', chapter: 1 });
    const store = makeStore(initialState());
    const view = render(<Provider store={store}><LessonScreen bank={bank} lesson={lesson} activityTracker={tracker} onBack={() => undefined} onStartPractice={() => undefined} eventContext={{ bankVersion: 'sample-v1', session: 'S001', chapter: 1 }} /></Provider>);

    const conceptId = lesson.concepts[0].id;
    expect(observed.some(event => event.type === 'chunk_open' && event.itemId === conceptId)).toBe(true);
    view.unmount();
    const read = observed.find(event => event.type === 'chunk_read' && event.itemId === conceptId);
    expect(read?.durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(read!.endTs!)).toBeGreaterThanOrEqual(Date.parse(observed.find(event => event.type === 'chunk_open' && event.itemId === conceptId)!.ts));
    tracker.stop();
    unsubscribe();
  });
});
