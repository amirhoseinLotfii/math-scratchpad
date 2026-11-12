import { describe, expect, it } from 'vitest';
import { classifyScopedLearningEvent, parseScopedLearningResetScope } from '../src/scoped-reset-plan';

const lesson = { type: 'lesson', id: '1.1', chapter: 1, bankVersion: 'v21' } as const;
const chapter = { type: 'chapter', id: '1', bankVersion: 'v21' } as const;
const event = (overrides: Record<string, unknown> = {}) => ({
  bankVersion: 'v21',
  chapter: 1,
  lesson: '1.1',
  type: 'exercise_attempt' as const,
  ...overrides,
});

describe('scoped reset groundwork (read-only planning)', () => {
  it('accepts only a fully identified lesson or chapter, with a bank version', () => {
    expect(parseScopedLearningResetScope(lesson)).toEqual(lesson);
    expect(parseScopedLearningResetScope(chapter)).toEqual(chapter);
    for (const invalid of [
      null, [], {}, { type: 'lesson', id: '1.1', bankVersion: 'v21' },
      { ...lesson, chapter: 100 }, { ...lesson, chapter: 1.5 },
      { ...lesson, bankVersion: '' }, { ...lesson, id: ' 1.1 ' },
      { ...lesson, unexpected: true }, { ...chapter, id: '01' },
      { ...chapter, id: '100' }, { ...chapter, chapter: 1 },
    ]) {
      expect(parseScopedLearningResetScope(invalid)).toBeUndefined();
    }
  });

  it('never marks another bank version, chapter or lesson for removal', () => {
    expect(classifyScopedLearningEvent(event({ bankVersion: 'v22' }), lesson)).toBe('preserve');
    expect(classifyScopedLearningEvent(event({ chapter: 2 }), lesson)).toBe('preserve');
    expect(classifyScopedLearningEvent(event({ lesson: '1.2' }), lesson)).toBe('preserve');
    expect(classifyScopedLearningEvent(event({ bankVersion: 'v22' }), chapter)).toBe('preserve');
    expect(classifyScopedLearningEvent(event({ chapter: 2 }), chapter)).toBe('preserve');
    expect(classifyScopedLearningEvent(event({ lesson: '1.2' }), chapter)).toBe('remove');
  });

  it('classifies ordinary in-scope events as candidates only', () => {
    expect(classifyScopedLearningEvent(event(), lesson)).toBe('remove');
    expect(classifyScopedLearningEvent(event(), chapter)).toBe('remove');
  });

  it('forces a rebuild for cross-lesson aggregates and shared session events', () => {
    expect(classifyScopedLearningEvent(event({ type: 'chapter_snapshot' }), lesson)).toBe('rebuild');
    expect(classifyScopedLearningEvent(event({ type: 'legacy_state_migration', lesson: '1.2' }), lesson)).toBe('rebuild');
    expect(classifyScopedLearningEvent(event({ type: 'session_end' }), lesson)).toBe('rebuild');
    expect(classifyScopedLearningEvent(event({ type: 'session_end' }), chapter)).toBe('rebuild');
    expect(classifyScopedLearningEvent(event({ type: 'report_generated' }), lesson)).toBe('rebuild');
    expect(classifyScopedLearningEvent(event({ type: 'chapter_snapshot' }), chapter)).toBe('remove');
  });
});
