/**
 * Question timers record wall-clock time while a segment is open. Without a
 * liveness marker, closing the browser overnight credited that entire gap as
 * study time (a real session showed 1172:10 minutes). The heartbeat below makes
 * "was the app actually open until when" durable across browser restarts, so a
 * restored segment can be credited up to the last live moment and no further.
 */

export const TIMER_HEARTBEAT_KEY = 'math-scratchpad-timer-heartbeat-v1';
/** The heartbeat is written on this cadence, so this much slack is still real work. */
export const TIMER_HEARTBEAT_INTERVAL_MS = 5_000;

type TimedExercise = { elapsedMs?: number; timerRunningSince?: number; timerPaused?: boolean };

export function readTimerHeartbeat(now = Date.now()): number | null {
  try {
    const raw = localStorage.getItem(TIMER_HEARTBEAT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 && value <= now ? value : null;
  } catch {
    return null;
  }
}

export function writeTimerHeartbeat(now = Date.now()): void {
  try {
    localStorage.setItem(TIMER_HEARTBEAT_KEY, String(now));
  } catch {
    /* Optional continuity hint; the timer itself still works without it. */
  }
}

/**
 * Credit an open segment only up to the last live heartbeat (plus one interval
 * of slack). A recent reload therefore continues seamlessly, while time with
 * the app closed is dropped and the segment restarts at `now`.
 */
export function clampRestoredTimer<T extends TimedExercise>(
  exercise: T,
  now = Date.now(),
  heartbeat = readTimerHeartbeat(now),
): T {
  const since = exercise.timerRunningSince;
  if (exercise.timerPaused || !Number.isFinite(since)) return exercise;
  const base = Number.isFinite(exercise.elapsedMs) && (exercise.elapsedMs as number) >= 0 ? exercise.elapsedMs as number : 0;
  const startedAt = since as number;
  // A clock that moved backwards must not produce negative or invented time.
  if (startedAt > now) return { ...exercise, elapsedMs: base, timerRunningSince: now };

  const totalGap = now - startedAt;
  const liveUntil = heartbeat !== null && heartbeat >= startedAt
    ? Math.min(now, heartbeat + TIMER_HEARTBEAT_INTERVAL_MS)
    : Math.min(now, startedAt + TIMER_HEARTBEAT_INTERVAL_MS);
  const credited = Math.max(0, Math.min(totalGap, liveUntil - startedAt));
  if (credited >= totalGap) return exercise;
  return { ...exercise, elapsedMs: base + credited, timerRunningSince: now };
}

/** Apply the continuity rule to every restored exercise. */
export function clampRestoredTimers<T extends { exercises: TimedExercise[] }>(
  doc: T,
  now = Date.now(),
  heartbeat = readTimerHeartbeat(now),
): T {
  if (!doc.exercises.some(exercise => !exercise.timerPaused && Number.isFinite(exercise.timerRunningSince))) return doc;
  return { ...doc, exercises: doc.exercises.map(exercise => clampRestoredTimer(exercise, now, heartbeat)) };
}
