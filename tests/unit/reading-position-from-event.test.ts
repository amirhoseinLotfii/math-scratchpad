import { describe, expect, it } from 'vitest';
import type { LearnEvent } from '../../src/sync/events';
import {
  mergeLatestReadingPosition,
  readingPositionFromLearnEvent,
} from '../../src/features/progress/reading-position-from-event';
import type { ReadingPosition } from '../../src/features/progress/reading-position-types';
import {
  deserializeReadingPosition,
  serializeReadingPosition,
} from '../../src/features/progress/reading-position-storage';

function event(partial: Partial<LearnEvent> & Pick<LearnEvent, 'type' | 'ts'>): LearnEvent {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    schema: 1,
    deviceId: '22222222-2222-4222-8222-222222222222',
    bankVersion: 'bank-v3',
    session: 'S1',
    chapter: 2,
    lesson: 'L1',
    section: 'sec-a',
    concept: 'c1',
    isTest: false,
    ...partial,
  };
}

describe('reading position from latest learn event', () => {
  it('maps a location event into a reading position', () => {
    const position = readingPositionFromLearnEvent(event({
      type: 'section_open',
      ts: '2026-11-08T12:00:00.000Z',
      itemId: 'q1',
    }));
    expect(position).toMatchObject({
      userId: '22222222-2222-4222-8222-222222222222',
      chapterId: '2',
      lessonId: 'L1',
      sectionId: 'sec-a',
      exerciseId: 'q1',
      contentVersion: 'bank-v3',
      lastActivity: 'reading',
    });
  });

  it('ignores non-location events', () => {
    expect(readingPositionFromLearnEvent(event({
      type: 'tab_hidden',
      ts: '2026-11-08T12:00:00.000Z',
    }))).toBeNull();
  });

  it('keeps the newest activity when merging', () => {
    const older: ReadingPosition = {
      userId: 'u',
      lessonId: 'old',
      contentVersion: 'v1',
      lastActivity: 'reading',
      updatedAt: new Date('2026-11-08T10:00:00.000Z'),
    };
    const newer: ReadingPosition = {
      userId: 'u',
      lessonId: 'new',
      sectionId: 's2',
      contentVersion: 'v2',
      lastActivity: 'exercise_started',
      updatedAt: new Date('2026-11-08T11:00:00.000Z'),
    };
    expect(mergeLatestReadingPosition(older, newer).lessonId).toBe('new');
    expect(mergeLatestReadingPosition(newer, older).lessonId).toBe('new');
  });

  it('round-trips through learning-storage serialization', () => {
    const position: ReadingPosition = {
      userId: 'u',
      lessonId: 'L1',
      contentVersion: 'v1',
      lastActivity: 'reading',
      updatedAt: new Date('2026-11-08T12:30:00.000Z'),
    };
    const restored = deserializeReadingPosition(serializeReadingPosition(position));
    expect(restored?.lessonId).toBe('L1');
    expect(restored?.updatedAt.toISOString()).toBe('2026-11-08T12:30:00.000Z');
  });
});
