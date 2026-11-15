import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEARN_EVENT_TYPES,
  emit,
  emitLearnEvent,
  emitTestLearnEvent,
  getDeviceId,
  learnEventSchema,
  resetLearnEventRuntimeForTests,
  subscribeToLearnEvents,
  type LearnEventContext,
} from '../../src/sync/events';

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

describe('learning event schema and emitter', () => {
  it('accepts every supported event type with the common required context', () => {
    for (const type of LEARN_EVENT_TYPES) {
      const result = learnEventSchema.safeParse({
        id: 'c3677b84-678e-4c07-b8b7-4c325387c6f6',
        schema: 1,
        ts: '2026-11-02T10:00:00.000Z',
        deviceId: '38174652-a617-4de8-a216-1d80ad452120',
        bankVersion: 'v21',
        session: 'S001',
        chapter: 1,
        lesson: '1.1',
        section: '1.1-p1',
        concept: 'relations',
        type,
        ...(type === 'legacy_state_migration'
          ? {
              migrationChunk: {
                id: 'f118879f-3fd9-41e5-8a7b-e2440be294cc',
                key: 'math-scratchpad-session-v3',
                index: 0,
                count: 1,
                sha256: 'a'.repeat(64),
                data: 'e30=',
              },
            }
          : {}),
        ...(type === 'chapter_snapshot'
          ? {
              snapshotId: 'a3677b84-678e-4c07-b8b7-4c325387c6f6',
              snapshotBankId: 'test-bank',
              snapshotPart: 0,
              snapshotParts: 1,
              snapshotSha256: 'b'.repeat(64),
              snapshotData: '{}',
            }
          : {}),
      });
      expect(result.success, `${type}: ${result.success ? '' : result.error.message}`).toBe(true);
    }
  });

  it('creates validated UUID events, deeply freezes snapshots, and publishes them once', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLearnEvents(listener);
    const event = emitLearnEvent(context, {
      type: 'check_answer',
      itemId: 'PC-1.1-L01',
      itemType: 'typed',
      questionText: 'دامنه چیست؟',
      userAnswer: '{1, 2}',
      verdict: 'submitted',
      verdictSource: 'none',
      attemptNo: 1,
      steps: ['x=1'],
    });
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(event).toMatchObject({ type: 'check_answer', session: 'S001', userAnswer: '{1, 2}' });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.steps)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(event);
    unsubscribe();
  });

  it('marks new events as explicitly live and provides an explicit test-event factory', () => {
    const live = emitLearnEvent(context, { type: 'lesson_open' });
    const testEvent = emitTestLearnEvent(context, { type: 'check_answer', verdict: 'submitted', verdictSource: 'none' });
    expect(live.isTest).toBe(false);
    expect(testEvent.isTest).toBe(true);
  });

  it('rejects malformed IDs, unknown fields, and unsupported correctness claims', () => {
    const base = emitLearnEvent(context, { type: 'exercise_attempt' });
    expect(learnEventSchema.safeParse({ ...base, id: 'not-a-uuid' }).success).toBe(false);
    expect(learnEventSchema.safeParse({ ...base, unapproved: true }).success).toBe(false);
    expect(learnEventSchema.safeParse({ ...base, verdict: 'correct', verdictSource: 'none' }).success).toBe(false);
    expect(learnEventSchema.safeParse({ ...base, verdict: 'incorrect', verdictSource: 'checker' }).success).toBe(true);
    expect(() => emit({ ...base, verdict: 'correct', verdictSource: 'none' })).toThrow();
  });

  it('requires bounded, indexed, hashed payloads for legacy migration events only', () => {
    const base = {
      id: 'c3677b84-678e-4c07-b8b7-4c325387c6f6',
      schema: 1,
      ts: '2026-11-02T10:00:00.000Z',
      deviceId: '38174652-a617-4de8-a216-1d80ad452120',
      bankVersion: 'migration-v1',
      session: 'migration-test',
      chapter: 0,
      lesson: 'unknown',
      section: 'unknown',
      concept: 'legacy-storage',
      type: 'legacy_state_migration',
    };
    const chunk = {
      id: 'f118879f-3fd9-41e5-8a7b-e2440be294cc',
      key: 'math-scratchpad-session-v3',
      index: 0,
      count: 1,
      sha256: 'a'.repeat(64),
      data: '',
    };
    expect(learnEventSchema.safeParse({ ...base, migrationChunk: chunk }).success).toBe(true);
    expect(learnEventSchema.safeParse(base).success).toBe(false);
    expect(learnEventSchema.safeParse({ ...base, migrationChunk: { ...chunk, index: 1 } }).success).toBe(false);
    expect(learnEventSchema.safeParse({ ...base, migrationChunk: { ...chunk, sha256: 'bad' } }).success).toBe(false);
    expect(learnEventSchema.safeParse({ ...base, type: 'lesson_open', migrationChunk: chunk }).success).toBe(false);
  });

  it('does not let a failing event sink interrupt the next sink', () => {
    const first = vi.fn(() => {
      throw new Error('storage sink unavailable');
    });
    const second = vi.fn();
    const stopFirst = subscribeToLearnEvents(first);
    const stopSecond = subscribeToLearnEvents(second);
    expect(() => emitLearnEvent(context, { type: 'step_added', itemId: 'step-2' })).not.toThrow();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    stopFirst();
    stopSecond();
  });

  it('keeps a stable device UUID in available storage and falls back when storage throws', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = getDeviceId(storage);
    resetLearnEventRuntimeForTests();
    expect(getDeviceId(storage)).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    resetLearnEventRuntimeForTests();
    const fallback = getDeviceId({
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('blocked');
      },
    });
    expect(fallback).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
