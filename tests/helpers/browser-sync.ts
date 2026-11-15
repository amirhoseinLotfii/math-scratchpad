import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, vi } from 'vitest';
import { initialState } from '../../src/store';
import { serialize } from '../../src/persistence';
import { resetLearnEventRuntimeForTests, type LearnEvent } from '../../src/sync/events';
import { resetLearningDbForTests } from '../../src/sync/browser-db';
import { LEARNING_RESET_EPOCH } from '../../src/sync/learning-reset-epoch';

// Ensure Node.js webcrypto is available as globalThis.crypto for tests
// In jsdom, globalThis.crypto is a getter-only property, so we need to redefine it
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
  enumerable: true,
});

export const SESSION_KEY = 'math-scratchpad-session-v3';
export const LESSON_KEY = 'math-scratchpad-lesson-progress-v1:bank%2F1:v21';
export const OLD_SESSION = serialize(initialState());
export const OLD_LESSON = JSON.stringify({
  schemaVersion: 1,
  bankId: 'bank/1',
  bankVersion: 'v21',
  lessons: { '1.1': { status: 'learning', checkAnswers: { q1: 'دامنه' } } },
  lessonPanelEvents: [],
});

export function withIdleResetStatus(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (new URL(String(input)).pathname === '/reset/status') {
      return Response.json({ status: 'idle', epoch: LEARNING_RESET_EPOCH });
    }
    return fetcher(input, init);
  };
}

export function stubSendBeacon(sendBeacon: Navigator['sendBeacon']): void {
  const current = navigator;
  vi.stubGlobal(
    'navigator',
    new Proxy(current, {
      get(target, property) {
        if (property === 'sendBeacon') return sendBeacon;
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  );
}

export function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

export function fixtureEvent(index: number): LearnEvent {
  const suffix = index.toString(16).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    schema: 1,
    ts: '2026-11-02T00:00:00.000Z',
    deviceId: '11111111-1111-4111-8111-111111111111',
    bankVersion: 'v21',
    session: 'property-test',
    chapter: 1,
    lesson: '1.1',
    section: '1.1-a',
    concept: 'relations',
    type: 'check_answer',
    itemId: `q-${index}`,
    userAnswer: String(index),
    verdict: 'submitted',
    verdictSource: 'none',
  };
}

export function createManualScheduler() {
  type Handle = ReturnType<typeof setTimeout>;
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const schedule = ((callback: TimerHandler, delay?: number) => {
    const timerId = ++id;
    timers.set(timerId, { at: now + Number(delay ?? 0), callback: () => (typeof callback === 'function' ? callback() : undefined) });
    return timerId as unknown as Handle;
  }) as unknown as typeof globalThis.setTimeout;
  const cancel = ((handle: Handle) => {
    timers.delete(Number(handle));
  }) as typeof globalThis.clearTimeout;
  const advance = (milliseconds: number) => {
    const target = now + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
    }
    now = target;
  };
  return { schedule, cancel, advance };
}

export function seedLegacy() {
  localStorage.setItem(SESSION_KEY, OLD_SESSION);
  localStorage.setItem(LESSON_KEY, OLD_LESSON);
  localStorage.setItem('math-scratchpad-ui-v1:questions', '0');
  localStorage.setItem('math-scratchpad-drive-bank-cache-v1:bank', '{"cached":true}');
}

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
  localStorage.clear();
  await resetLearningDbForTests();
  resetLearnEventRuntimeForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  resetLearnEventRuntimeForTests();
  await resetLearningDbForTests();
  vi.unstubAllGlobals();
});
