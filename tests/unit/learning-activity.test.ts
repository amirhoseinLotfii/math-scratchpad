import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLearnEventRuntimeForTests, subscribeToLearnEvents, type LearnEventContext } from '../../src/sync/events';
import { ActivityTracker } from '../../src/sync/activity-tracker';

const context: LearnEventContext = {
  bankVersion: 'v21',
  session: 'S001',
  chapter: 1,
  lesson: '1.1',
  section: '1.1-p1',
  concept: 'relations',
  skill: 'domain',
  pdfPage: 17,
  bookPage: 17,
};

afterEach(() => {
  vi.useRealTimers();
  resetLearnEventRuntimeForTests();
});

describe('active learning scope timing', () => {
  it('separates active, hidden and paused time and emits lifecycle events', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:00:00.000Z'));
    const observed: Array<{ type: string; activeMs?: number; distractedMs?: number; pausedMs?: number; durationMs?: number }> = [];
    const stop = subscribeToLearnEvents((event) => observed.push(event));
    const tracker = new ActivityTracker(context, { now: () => Date.now(), idleMs: 120_000 });
    tracker.startScope({ id: 'q1', openType: 'question_open', closeType: 'question_close', context, fields: { itemId: 'PC-1.1-L01' } });
    vi.advanceTimersByTime(10_000);
    tracker.setHidden(true);
    vi.advanceTimersByTime(15_000);
    tracker.setHidden(false);
    vi.advanceTimersByTime(5_000);
    tracker.setPaused(true);
    vi.advanceTimersByTime(20_000);
    tracker.setPaused(false);
    vi.advanceTimersByTime(10_000);
    tracker.stopScope('q1');

    const closed = observed.find((event) => event.type === 'question_close');
    expect(closed).toMatchObject({ durationMs: 60_000, activeMs: 25_000, distractedMs: 15_000, pausedMs: 20_000 });
    expect(observed.map((event) => event.type)).toEqual(
      expect.arrayContaining(['question_open', 'tab_hidden', 'tab_visible', 'scope_paused', 'scope_resumed', 'question_close']),
    );
    stop();
    tracker.stop();
  });

  it('keeps scope timestamps ordered when the wall clock is frozen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
    let monotonicNow = 0;
    const observed: Array<{ type: string; ts: string; endTs?: string; durationMs?: number }> = [];
    const stop = subscribeToLearnEvents((event) => observed.push(event));
    const tracker = new ActivityTracker(context, { now: () => monotonicNow });
    tracker.startScope({ id: 'frozen-clock', openType: 'lesson_open', closeType: 'lesson_close' });
    monotonicNow = 1_500;
    tracker.stopScope('frozen-clock');

    const opened = observed.find((event) => event.type === 'lesson_open');
    const closed = observed.find((event) => event.type === 'lesson_close');
    expect(opened?.ts).toBe('2026-11-02T12:00:00.000Z');
    expect(closed?.endTs).toBe('2026-11-02T12:00:01.500Z');
    expect(closed?.durationMs).toBe(1_500);
    expect(Date.parse(closed!.endTs!)).toBeGreaterThanOrEqual(Date.parse(closed!.ts));
    stop();
    tracker.stop();
  });

  it('detects two-minute idle time, closes it when activity resumes, and attributes its duration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T11:00:00.000Z'));
    const observed: Array<{ type: string; activeMs?: number; distractedMs?: number; durationMs?: number }> = [];
    const stop = subscribeToLearnEvents((event) => observed.push(event));
    const tracker = new ActivityTracker(context, { now: () => Date.now(), idleMs: 120_000 });
    tracker.startScope({ id: 'section', openType: 'section_open', closeType: 'section_close' });
    vi.advanceTimersByTime(120_000);
    expect(observed.some((event) => event.type === 'idle_start')).toBe(true);
    vi.advanceTimersByTime(15_000);
    tracker.activity();
    vi.advanceTimersByTime(10_000);
    tracker.stopScope('section');
    const closed = observed.find((event) => event.type === 'section_close');
    expect(closed).toMatchObject({ durationMs: 145_000, activeMs: 130_000, distractedMs: 15_000 });
    expect(observed.some((event) => event.type === 'idle_end')).toBe(true);
    stop();
    tracker.stop();
  });

  it('connects native visibility, focus and input listeners to the same event stream', () => {
    const observed: string[] = [];
    const stop = subscribeToLearnEvents((event) => observed.push(event.type));
    const tracker = new ActivityTracker(context);
    const detach = tracker.listen(document, window);
    tracker.startScope({ id: 'native', openType: 'session_start', closeType: 'session_end' });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('keydown'));
    tracker.stopScope('native');
    detach();
    tracker.stop();
    stop();
    expect(observed).toEqual(expect.arrayContaining(['tab_hidden', 'tab_visible', 'window_blur', 'window_focus', 'session_end']));
  });

  it('tracks MathLive step focus inside an open question and closes the step with its question', () => {
    const observed: Array<{ type: string; itemId?: string; durationMs?: number }> = [];
    const stop = subscribeToLearnEvents((event) => observed.push(event));
    const tracker = new ActivityTracker(context);
    const detach = tracker.listen(document, window);
    tracker.startScope({
      id: 'question:lesson-check',
      openType: 'question_open',
      closeType: 'question_close',
      fields: { itemId: 'PC-1.1-L01', questionText: 'Find the domain.' },
    });
    const field = document.createElement('math-field');
    field.dataset.stepId = 'step-1';
    document.body.append(field);
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    expect(observed).toContainEqual(expect.objectContaining({ type: 'step_open', itemId: 'step-1', questionText: 'Find the domain.' }));
    tracker.stopScope('question:lesson-check');
    expect(observed.some((event) => event.type === 'step_close' && event.itemId === 'step-1')).toBe(true);
    tracker.startScope({
      id: 'question:lesson-check',
      openType: 'question_open',
      closeType: 'question_close',
      fields: { itemId: 'PC-1.1-L01', questionText: 'Find the domain.' },
    });
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    expect(observed.filter((event) => event.type === 'step_open' && event.itemId === 'step-1')).toHaveLength(2);
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true, relatedTarget: document.body }));
    tracker.stopScope('question:lesson-check');
    expect(observed.some((event) => event.type === 'question_close' && event.itemId === 'PC-1.1-L01')).toBe(true);
    field.remove();
    detach();
    tracker.stop();
    stop();
  });
});
