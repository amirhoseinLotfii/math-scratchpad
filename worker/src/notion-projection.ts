import type { LearnEvent } from '../../shared/contracts/learn-event';

const ATTEMPT_TYPES = new Set<LearnEvent['type']>([
  'check_answer',
  'example_attempt',
  'tryit_attempt',
  'exercise_attempt',
  'mixed_review_attempt',
  'gate_attempt',
  'reverse_attempt',
  'timed_round',
  'explain_own_words',
  'explain_why',
  'mistake_logged',
]);

export function isAttemptLikeEvent(event: LearnEvent): boolean {
  return ATTEMPT_TYPES.has(event.type) && Boolean(event.itemId || event.userAnswer !== undefined || event.steps?.length);
}

export function isMistakeLikeEvent(event: LearnEvent): boolean {
  if (event.isTest) return false;
  if (event.type === 'mistake_logged') return true;
  if (!isAttemptLikeEvent(event)) return false;
  return event.verdict === 'incorrect' || (event.verdict === 'correct' && isLowConfidence(event.confidence));
}

export function isLowConfidence(confidence: LearnEvent['confidence']): boolean {
  return confidence === 'low' || confidence === 1 || confidence === 2;
}

export function tehranDayKey(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return get('year') + '-' + get('month') + '-' + get('day');
}

/** Iran uses UTC+03:30. Return an explicit local offset for Notion date values. */
export function tehranDateTime(timestamp: string): string {
  const local = new Date(Date.parse(timestamp) + 210 * 60_000).toISOString();
  return local.slice(0, -1) + '+03:30';
}

export type SessionProjection = {
  sessionId: string;
  isTest: boolean;
  chapter: number;
  lessons: string[];
  startedAt: string;
  endedAt?: string;
  status: 'Running' | 'Completed';
  itemsAttempted: number;
  correct: number;
  graded: number;
  activeMs: number;
  wallMs: number;
  distractedMs: number;
  hintsUsed: number;
  mistakesCount: number;
  gatesPassed: number;
  gatesFailed: number;
  lastEventAt: string;
  lastEventId: string;
  mood?: LearnEvent['mood'];
  goalStatus?: 'done' | 'behind' | 'missed';
  mistakePageIds: string[];
};

export type DailyProjection = {
  date: string;
  sessions: string[];
  items: number;
  correct: number;
  graded: number;
  activeMs: number;
  wallMs: number;
  distractedMs: number;
  gatesPassed: number;
  gatesFailed: number;
  newMistakes: number;
  reviewsDone: number;
  reviewsDue: number;
  mood?: LearnEvent['mood'];
  goalStatus?: 'done' | 'behind' | 'missed';
};

export type ConceptProjection = {
  conceptId: string;
  chapter: number;
  lesson: string;
  attempts: number;
  correct: number;
  graded: number;
  activeMs: number;
  masteryLevel: NonNullable<LearnEvent['masteryLevel']>;
  lastPracticedAt: string;
  nextReviewAt?: string;
  gatePassed: boolean;
  errorCounts: Partial<Record<NonNullable<LearnEvent['errorTag']>, number>>;
  confidenceTotals: { high: number; medium: number; low: number };
  confidenceCorrect: { high: number; medium: number; low: number };
};

export function applySessionEvent(previous: SessionProjection | undefined, event: LearnEvent): SessionProjection {
  const attempt = isAttemptLikeEvent(event);
  const completed = event.type === 'session_end';
  // ActivityTracker scopes are nested (session → lesson → section → item). Only
  // session_end carries the full session duration; summing every close event
  // would count the same active time several times.
  const sessionTiming = completed;
  const lessons = new Set(previous?.lessons ?? []);
  if (event.lesson !== 'unknown') lessons.add(event.lesson);
  const firstTs = !previous || Date.parse(event.ts) < Date.parse(previous.startedAt) ? event.ts : previous.startedAt;
  const latest = !previous || Date.parse(event.ts) >= Date.parse(previous.lastEventAt);
  const mood = latest && event.mood ? event.mood : previous?.mood;
  const goalStatus = event.type === 'goal_status' ? (goalStatusFromNote(event.note) ?? previous?.goalStatus) : previous?.goalStatus;
  const endedAt = completed ? (event.endTs ?? event.ts) : previous?.endedAt;
  return {
    sessionId: event.session,
    isTest: Boolean(previous?.isTest || event.isTest),
    chapter: event.chapter,
    lessons: [...lessons].sort(),
    startedAt: firstTs,
    ...(endedAt ? { endedAt } : {}),
    status: endedAt ? 'Completed' : 'Running',
    itemsAttempted: (previous?.itemsAttempted ?? 0) + Number(attempt),
    correct: (previous?.correct ?? 0) + Number(attempt && event.verdict === 'correct'),
    graded: (previous?.graded ?? 0) + Number(attempt && (event.verdict === 'correct' || event.verdict === 'incorrect')),
    activeMs: (previous?.activeMs ?? 0) + (sessionTiming ? (event.activeMs ?? 0) : 0),
    wallMs: (previous?.wallMs ?? 0) + (sessionTiming ? (event.durationMs ?? 0) : 0),
    distractedMs: (previous?.distractedMs ?? 0) + (sessionTiming ? (event.distractedMs ?? 0) : 0),
    hintsUsed: (previous?.hintsUsed ?? 0) + Number(event.type === 'hint_used'),
    mistakesCount: (previous?.mistakesCount ?? 0) + Number(isMistakeLikeEvent(event)),
    gatesPassed: (previous?.gatesPassed ?? 0) + Number(event.type === 'gate_passed'),
    gatesFailed: (previous?.gatesFailed ?? 0) + Number(event.type === 'gate_failed'),
    lastEventAt: latest ? event.ts : previous!.lastEventAt,
    lastEventId: latest ? event.id : previous!.lastEventId,
    ...(mood ? { mood } : {}),
    ...(goalStatus ? { goalStatus } : {}),
    mistakePageIds: previous?.mistakePageIds ?? [],
  };
}

export function applyDailyEvent(previous: DailyProjection | undefined, event: LearnEvent): DailyProjection | undefined {
  if (event.isTest) return previous;
  const attempt = isAttemptLikeEvent(event);
  // Daily totals use the session scope's final duration, not each nested
  // lesson/chunk/question close event.
  const sessionTiming = event.type === 'session_end';
  const date = tehranDayKey(event.ts);
  const sessions = new Set(previous?.sessions ?? []);
  sessions.add(event.session);
  return {
    date,
    sessions: [...sessions].sort(),
    items: (previous?.items ?? 0) + Number(attempt),
    correct: (previous?.correct ?? 0) + Number(attempt && event.verdict === 'correct'),
    graded: (previous?.graded ?? 0) + Number(attempt && (event.verdict === 'correct' || event.verdict === 'incorrect')),
    activeMs: (previous?.activeMs ?? 0) + (sessionTiming ? (event.activeMs ?? 0) : 0),
    wallMs: (previous?.wallMs ?? 0) + (sessionTiming ? (event.durationMs ?? 0) : 0),
    distractedMs: (previous?.distractedMs ?? 0) + (sessionTiming ? (event.distractedMs ?? 0) : 0),
    gatesPassed: (previous?.gatesPassed ?? 0) + Number(event.type === 'gate_passed'),
    gatesFailed: (previous?.gatesFailed ?? 0) + Number(event.type === 'gate_failed'),
    newMistakes: (previous?.newMistakes ?? 0) + Number(isMistakeLikeEvent(event)),
    reviewsDone: (previous?.reviewsDone ?? 0) + Number(event.type === 'review_due_done'),
    reviewsDue: previous?.reviewsDue ?? 0,
    ...(event.mood ? { mood: event.mood } : previous?.mood ? { mood: previous.mood } : {}),
    ...(event.type === 'goal_status'
      ? { goalStatus: goalStatusFromNote(event.note) ?? previous?.goalStatus }
      : previous?.goalStatus
        ? { goalStatus: previous.goalStatus }
        : {}),
  };
}

export function applyConceptEvent(previous: ConceptProjection | undefined, event: LearnEvent): ConceptProjection | undefined {
  if (event.isTest) return previous;
  const attempt = isAttemptLikeEvent(event);
  if (!attempt && event.type !== 'mastery_changed' && event.type !== 'gate_passed') return previous;
  const confidence = confidenceBucket(event.confidence);
  const errorCounts = { ...(previous?.errorCounts ?? {}) };
  if (attempt && event.errorTag) errorCounts[event.errorTag] = (errorCounts[event.errorTag] ?? 0) + 1;
  const confidenceTotals = { ...(previous?.confidenceTotals ?? { high: 0, medium: 0, low: 0 }) };
  const confidenceCorrect = { ...(previous?.confidenceCorrect ?? { high: 0, medium: 0, low: 0 }) };
  if (attempt && confidence) {
    confidenceTotals[confidence] += 1;
    if (event.verdict === 'correct') confidenceCorrect[confidence] += 1;
  }
  const nextReviewAt = event.verdict === 'incorrect' ? plusDays(event.ts, 1) : previous?.nextReviewAt;
  return {
    conceptId: event.concept,
    chapter: event.chapter,
    lesson: event.lesson,
    attempts: (previous?.attempts ?? 0) + Number(attempt),
    correct: (previous?.correct ?? 0) + Number(attempt && event.verdict === 'correct'),
    graded: (previous?.graded ?? 0) + Number(attempt && (event.verdict === 'correct' || event.verdict === 'incorrect')),
    activeMs: (previous?.activeMs ?? 0) + (attempt ? (event.activeMs ?? 0) : 0),
    masteryLevel: event.masteryLevel ?? previous?.masteryLevel ?? 'new',
    lastPracticedAt: event.ts,
    ...(nextReviewAt ? { nextReviewAt } : {}),
    gatePassed: Boolean(previous?.gatePassed || event.type === 'gate_passed'),
    errorCounts,
    confidenceTotals,
    confidenceCorrect,
  };
}

export function topErrorTag(counts: ConceptProjection['errorCounts']): NonNullable<LearnEvent['errorTag']> | undefined {
  return Object.entries(counts).sort((a, b) => b[1]! - a[1]!)[0]?.[0] as NonNullable<LearnEvent['errorTag']> | undefined;
}

export function confidenceCalibration(projection: ConceptProjection): string {
  const band = (key: keyof ConceptProjection['confidenceTotals']) => {
    const total = projection.confidenceTotals[key];
    const correct = projection.confidenceCorrect[key];
    return total ? key + ' ' + correct + '/' + total : key + ' —';
  };
  return [band('high'), band('medium'), band('low')].join('; ');
}

export function attemptSource(event: LearnEvent): string {
  switch (event.type) {
    case 'example_attempt':
      return 'book Example';
    case 'tryit_attempt':
      return 'Try It';
    case 'exercise_attempt':
      return /(^|[-_])extra([-_]|$)|practice/i.test(event.itemId ?? '') ? 'extra' : 'exercise';
    case 'mixed_review_attempt':
      return 'mixed';
    case 'gate_attempt':
      return 'gate';
    case 'check_answer':
      return 'check';
    default:
      return 'other';
  }
}

export function confidenceLabel(confidence: LearnEvent['confidence']): 'مطمئنم' | 'حدس می‌زنم' | 'نمی‌دانم' | undefined {
  if (confidence === 'high' || (typeof confidence === 'number' && confidence >= 4)) return 'مطمئنم';
  if (confidence === 'low' || (typeof confidence === 'number' && confidence <= 2)) return 'نمی‌دانم';
  if (confidence !== undefined) return 'حدس می‌زنم';
  return undefined;
}

export function confidenceNumber(confidence: LearnEvent['confidence']): number | undefined {
  if (typeof confidence === 'number') return confidence;
  if (confidence === 'high') return 5;
  if (confidence === 'medium') return 3;
  if (confidence === 'low') return 1;
  return undefined;
}

export function errorCategory(errorTag: LearnEvent['errorTag']): string | undefined {
  if (errorTag === 'calculation' || errorTag === 'sign') return 'Calculation';
  if (errorTag === 'concept') return 'Conceptual';
  if (errorTag === 'question_reading') return 'Reading';
  if (errorTag === 'careless' || errorTag === 'other') return 'Other';
  return undefined;
}

function confidenceBucket(value: LearnEvent['confidence']): 'high' | 'medium' | 'low' | undefined {
  if (value === 'high' || (typeof value === 'number' && value >= 4)) return 'high';
  if (value === 'low' || (typeof value === 'number' && value <= 2)) return 'low';
  if (value !== undefined) return 'medium';
  return undefined;
}

function goalStatusFromNote(note?: string): 'done' | 'behind' | 'missed' | undefined {
  const value = note?.toLowerCase() ?? '';
  if (value.includes('done') || value.includes('completed')) return 'done';
  if (value.includes('behind')) return 'behind';
  if (value.includes('missed')) return 'missed';
  return undefined;
}

export function plusDays(timestamp: string, days: number): string {
  return new Date(Date.parse(timestamp) + days * 24 * 60 * 60_000).toISOString();
}

export {
  buildAppStateMirrorProperties,
  buildAttemptProperties,
  buildChapterSnapshotProperties,
  buildConceptProperties,
  buildDailyReportProperties,
  buildMistakeProperties,
  buildSessionProperties,
  richText,
} from './notion-projection-properties';
