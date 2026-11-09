import { afterEach, describe, expect, it } from 'vitest';
import {
  clampRestoredTimer,
  clampRestoredTimers,
  TIMER_HEARTBEAT_INTERVAL_MS,
  TIMER_HEARTBEAT_KEY,
  readTimerHeartbeat,
  writeTimerHeartbeat,
} from '../../src/features/session/timer-continuity';
import { elapsedAt } from '../../src/features/math-editor/model/model';

afterEach(() => { localStorage.removeItem(TIMER_HEARTBEAT_KEY); });

const NOW = Date.parse('2026-11-09T12:00:00Z');
const MINUTE = 60_000;

describe('restored question timers', () => {
  it('drops the closed-browser gap reported in production (1172:10) and keeps real work', () => {
    const since = NOW - 1172 * MINUTE - 10_000;
    const lastLive = since + 30 * MINUTE;
    const clamped = clampRestoredTimer({ elapsedMs: 0, timerRunningSince: since }, NOW, lastLive);

    expect(clamped.timerRunningSince).toBe(NOW);
    expect(clamped.elapsedMs).toBe(30 * MINUTE + TIMER_HEARTBEAT_INTERVAL_MS);
    // The displayed value is now the honest 30 minutes, not 19.5 hours.
    expect(Math.floor(elapsedAt(clamped, NOW) / MINUTE)).toBe(30);
  });

  it('keeps a quick reload seamless', () => {
    const since = NOW - 20 * MINUTE;
    const exercise = { elapsedMs: 0, timerRunningSince: since };
    expect(clampRestoredTimer(exercise, NOW, NOW - 2_000)).toBe(exercise);
  });

  it('never touches a paused timer', () => {
    const exercise = { elapsedMs: 5 * MINUTE, timerPaused: true, timerRunningSince: NOW - 10 * MINUTE };
    expect(clampRestoredTimer(exercise, NOW, NOW - 60 * MINUTE)).toBe(exercise);
  });

  it('credits a single heartbeat interval when no marker survives', () => {
    const clamped = clampRestoredTimer({ elapsedMs: 1_000, timerRunningSince: NOW - 5 * 60 * MINUTE }, NOW, null);
    expect(clamped.elapsedMs).toBe(1_000 + TIMER_HEARTBEAT_INTERVAL_MS);
    expect(clamped.timerRunningSince).toBe(NOW);
  });

  it('survives a clock that moved backwards', () => {
    const clamped = clampRestoredTimer({ elapsedMs: 500, timerRunningSince: NOW + MINUTE }, NOW, null);
    expect(clamped.elapsedMs).toBe(500);
    expect(clamped.timerRunningSince).toBe(NOW);
  });

  it('maps every exercise and leaves closed ones untouched', () => {
    const closed = { elapsedMs: 4 * MINUTE };
    const open = { elapsedMs: 0, timerRunningSince: NOW - 3 * 60 * MINUTE };
    const doc: { exercises: Array<{ elapsedMs?: number; timerRunningSince?: number }> } = { exercises: [closed, open] };
    const clamped = clampRestoredTimers(doc, NOW, NOW - 90 * MINUTE);
    expect(clamped.exercises[0]).toBe(closed);
    expect(clamped.exercises[1].timerRunningSince).toBe(NOW);
  });

  it('reads and writes the durable heartbeat', () => {
    writeTimerHeartbeat(NOW);
    expect(readTimerHeartbeat(NOW)).toBe(NOW);
    // A future timestamp (clock skew) is not trusted.
    expect(readTimerHeartbeat(NOW - MINUTE)).toBeNull();
  });
});
