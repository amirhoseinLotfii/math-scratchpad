import type { LearnEvent } from '../../src/sync/events';

const ATTEMPT_TYPES = new Set<LearnEvent['type']>([
  'check_answer', 'example_attempt', 'tryit_attempt', 'exercise_attempt', 'mixed_review_attempt',
  'gate_attempt', 'reverse_attempt', 'timed_round', 'explain_own_words', 'explain_why', 'mistake_logged',
]);

export function isAttemptLikeEvent(event: LearnEvent): boolean {
  return ATTEMPT_TYPES.has(event.type)
    && Boolean(event.itemId || event.userAnswer !== undefined || event.steps?.length);
}

export function isMistakeLikeEvent(event: LearnEvent): boolean {
  if (event.isTest) return false;
  if (event.type === 'mistake_logged') return true;
  if (!isAttemptLikeEvent(event)) return false;
  return event.verdict === 'incorrect'
    || (event.verdict === 'correct' && isLowConfidence(event.confidence));
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
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
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
  const goalStatus = event.type === 'goal_status' ? goalStatusFromNote(event.note) ?? previous?.goalStatus : previous?.goalStatus;
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
    activeMs: (previous?.activeMs ?? 0) + (sessionTiming ? event.activeMs ?? 0 : 0),
    wallMs: (previous?.wallMs ?? 0) + (sessionTiming ? event.durationMs ?? 0 : 0),
    distractedMs: (previous?.distractedMs ?? 0) + (sessionTiming ? event.distractedMs ?? 0 : 0),
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
    activeMs: (previous?.activeMs ?? 0) + (sessionTiming ? event.activeMs ?? 0 : 0),
    wallMs: (previous?.wallMs ?? 0) + (sessionTiming ? event.durationMs ?? 0 : 0),
    distractedMs: (previous?.distractedMs ?? 0) + (sessionTiming ? event.distractedMs ?? 0 : 0),
    gatesPassed: (previous?.gatesPassed ?? 0) + Number(event.type === 'gate_passed'),
    gatesFailed: (previous?.gatesFailed ?? 0) + Number(event.type === 'gate_failed'),
    newMistakes: (previous?.newMistakes ?? 0) + Number(isMistakeLikeEvent(event)),
    reviewsDone: (previous?.reviewsDone ?? 0) + Number(event.type === 'review_due_done'),
    reviewsDue: previous?.reviewsDue ?? 0,
    ...(event.mood ? { mood: event.mood } : previous?.mood ? { mood: previous.mood } : {}),
    ...(event.type === 'goal_status' ? { goalStatus: goalStatusFromNote(event.note) ?? previous?.goalStatus } : previous?.goalStatus ? { goalStatus: previous.goalStatus } : {}),
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
    case 'example_attempt': return 'book Example';
    case 'tryit_attempt': return 'Try It';
    case 'exercise_attempt':
      return /(^|[-_])extra([-_]|$)|practice/i.test(event.itemId ?? '') ? 'extra' : 'exercise';
    case 'mixed_review_attempt': return 'mixed';
    case 'gate_attempt': return 'gate';
    case 'check_answer': return 'check';
    default: return 'other';
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

export function buildAttemptProperties(event: LearnEvent, sessionPageId: string, syncedAt: string): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: { title: richText(titleForAttempt(event)) },
    'Event ID': { rich_text: richText(event.id) },
    Session: { relation: [{ id: sessionPageId }] },
    'Data Mode': { select: { name: event.isTest ? 'Test' : 'Live' } },
    isTest: { checkbox: Boolean(event.isTest) },
    Chapter: { number: event.chapter },
    Lesson: { select: { name: event.lesson } },
    Section: { rich_text: richText(event.section) },
    Concept: { select: { name: event.concept } },
    'Item ID': { rich_text: richText(event.itemId ?? '') },
    'Item source': { select: { name: attemptSource(event) } },
    Question: { rich_text: richText(event.questionText ?? '') },
    Answer: { rich_text: richText(event.userAnswer ?? '') },
    Steps: { rich_text: richText(event.steps?.join('\n') ?? '') },
    'Steps Raw': { rich_text: richText(event.steps?.join('\n') ?? '') },
    'Bank Version': { rich_text: richText(event.bankVersion) },
    'Question ID': { rich_text: richText(event.itemId ?? '') },
    'Device ID': { rich_text: richText(event.deviceId) },
    'Attempted At': { date: { start: tehranDateTime(event.ts) } },
    Start: { date: { start: tehranDateTime(event.ts) } },
    'Synced at': { date: { start: tehranDateTime(syncedAt) } },
    'Hint Used': { checkbox: (event.hintLevel ?? 0) > 0 },
    Independent: { checkbox: (event.hintLevel ?? 0) === 0 },
    'Hints used': { number: event.hintLevel ?? 0 },
    'Solve Time (min)': { number: roundTo((event.activeMs ?? event.durationMs ?? 0) / 60_000, 3) },
    'Active time (s)': { number: roundTo((event.activeMs ?? 0) / 1_000, 3) },
    'Distracted time (s)': { number: roundTo((event.distractedMs ?? 0) / 1_000, 3) },
    'Wall time (s)': { number: roundTo((event.durationMs ?? 0) / 1_000, 3) },
    Verdict: { select: { name: event.verdict ?? 'submitted' } },
    'Verdict source': { select: { name: event.verdictSource ?? 'none' } },
    Result: { select: { name: event.verdict === 'correct' ? 'Correct' : event.verdict === 'incorrect' ? 'Incorrect' : 'Unverified' } },
  };
  if (event.endTs) props.End = { date: { start: tehranDateTime(event.endTs) } };
  if (event.attemptNo !== undefined) props['Attempt Number'] = { number: event.attemptNo };
  if (event.itemType) props['Item type'] = { select: { name: event.itemType } };
  if (event.skill) props.Skill = { multi_select: [{ name: event.skill }] };
  if (event.confidence !== undefined) {
    const score = confidenceNumber(event.confidence);
    if (score !== undefined) props.Confidence = { select: { name: String(score) } };
    const label = confidenceLabel(event.confidence);
    if (label) props['Confidence rating'] = { select: { name: label } };
  }
  if (event.note) {
    props['Why note'] = { rich_text: richText(event.note) };
    props.Reason = { rich_text: richText(event.note) };
  }
  if (event.errorTag) {
    props['Error tag'] = { select: { name: event.errorTag } };
    const category = errorCategory(event.errorTag);
    if (category) props['Error Category'] = { select: { name: category } };
  }
  if (event.type === 'gate_attempt' || event.type === 'gate_passed' || event.type === 'gate_failed') {
    props.Gate = { select: { name: event.note?.toLowerCase().includes('chapter') ? 'chapter gate' : 'section gate' } };
  } else {
    props.Gate = { select: { name: 'none' } };
  }
  if (event.masteryLevel) props['Mastery after'] = { select: { name: event.masteryLevel } };
  if (event.pdfPage !== undefined) props['PDF page'] = { number: event.pdfPage };
  if (event.bookPage !== undefined) props['Book page'] = { number: event.bookPage };
  return props;
}

export function buildSessionProperties(stats: SessionProjection): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: { title: richText(stats.sessionId) },
    'Data Mode': { select: { name: stats.isTest ? 'Test' : 'Live' } },
    isTest: { checkbox: stats.isTest },
    Chapter: { number: stats.chapter },
    'Lessons covered': { rich_text: richText(stats.lessons.join(', ')) },
    'Items attempted': { number: stats.itemsAttempted },
    Correct: { number: stats.correct },
    'Active minutes': { number: roundTo(stats.activeMs / 60_000, 2) },
    'Distracted minutes': { number: roundTo(stats.distractedMs / 60_000, 2) },
    'Hints used': { number: stats.hintsUsed },
    'Mistakes count': { number: stats.mistakesCount },
    'Gates passed': { number: stats.gatesPassed },
    'Gates failed': { number: stats.gatesFailed },
    'Last event at': { date: { start: tehranDateTime(stats.lastEventAt) } },
    'Last event ID': { rich_text: richText(stats.lastEventId) },
    Status: { select: { name: stats.status } },
    'Started At': { date: { start: tehranDateTime(stats.startedAt) } },
    'Time Zone': { rich_text: richText('Asia/Tehran') },
    Mistakes: { relation: stats.mistakePageIds.map(id => ({ id })) },
  };
  if (stats.endedAt) props['Ended At'] = { date: { start: tehranDateTime(stats.endedAt) } };
  if (stats.mood) props.Mood = { select: { name: stats.mood === 'tired' ? 'Low' : stats.mood === 'energized' ? 'Great' : 'Okay' } };
  if (stats.goalStatus) props['Goal status'] = { select: { name: stats.goalStatus } };
  if (stats.status === 'Completed') props.Summary = { rich_text: richText('جلسه ' + stats.sessionId + ' پایان یافت؛ ' + stats.itemsAttempted + ' فعالیت تمرینی ثبت شد.') };
  return props;
}

export function buildDailyReportProperties(stats: DailyProjection, sessionPageIds: string[]): Record<string, unknown> {
  const accuracy = stats.graded ? roundTo((stats.correct / stats.graded) * 100, 1) : undefined;
  const report = 'امروز ' + stats.items + ' تمرین انجام شد؛ ' + stats.correct + ' پاسخ درست از ' + stats.graded
    + ' پاسخ بررسی‌شده. زمان فعال: ' + roundTo(stats.activeMs / 60_000, 1) + ' دقیقه.';
  const props: Record<string, unknown> = {
    Date: { title: richText(stats.date) },
    'Data Mode': { select: { name: 'Live' } },
    'Active minutes': { number: roundTo(stats.activeMs / 60_000, 2) },
    'Wall minutes': { number: roundTo(stats.wallMs / 60_000, 2) },
    'Distracted minutes': { number: roundTo(stats.distractedMs / 60_000, 2) },
    Items: { number: stats.items },
    'Gates passed': { number: stats.gatesPassed },
    'Gates failed': { number: stats.gatesFailed },
    'New mistakes': { number: stats.newMistakes },
    'Reviews done': { number: stats.reviewsDone },
    'Reviews due': { number: stats.reviewsDue },
    Report: { rich_text: richText(report) },
    Sessions: { relation: sessionPageIds.map(id => ({ id })) },
  };
  if (accuracy !== undefined) props['Accuracy %'] = { number: accuracy };
  if (stats.mood) props.Mood = { rich_text: richText(stats.mood === 'tired' ? 'خسته' : stats.mood === 'energized' ? 'سرحال' : 'معمولی') };
  if (stats.goalStatus) props['Goal status'] = { select: { name: stats.goalStatus } };
  return props;
}

export function buildConceptProperties(stats: ConceptProjection): Record<string, unknown> {
  const accuracy = stats.graded ? roundTo((stats.correct / stats.graded) * 100, 1) : 0;
  const decayDue = plusDays(stats.lastPracticedAt, 14);
  const props: Record<string, unknown> = {
    Name: { title: richText(stats.lesson + ' · ' + stats.conceptId) },
    'Concept ID': { rich_text: richText(stats.conceptId) },
    Chapter: { number: stats.chapter },
    Lesson: { rich_text: richText(stats.lesson) },
    'Mastery level': { select: { name: stats.masteryLevel } },
    'Accuracy %': { number: accuracy },
    Attempts: { number: stats.attempts },
    Correct: { number: stats.correct },
    'Average active time (s)': { number: stats.attempts ? roundTo(stats.activeMs / 1_000 / stats.attempts, 2) : 0 },
    Calibration: { rich_text: richText(confidenceCalibration(stats)) },
    'Gate passed': { checkbox: stats.gatePassed },
    'Last practiced': { date: { start: tehranDateTime(stats.lastPracticedAt) } },
    'Decay due': { date: { start: tehranDateTime(decayDue) } },
    'Data Mode': { select: { name: 'Live' } },
    isTest: { checkbox: false },
  };
  const error = topErrorTag(stats.errorCounts);
  if (error) props['Top error tag'] = { select: { name: error } };
  if (stats.nextReviewAt) props['Next review'] = { date: { start: tehranDateTime(stats.nextReviewAt) } };
  return props;
}

export function buildMistakeProperties(event: LearnEvent, sessionPageId: string, attemptPageId: string, reviewSuccesses = 0, status: 'open' | 'reviewing' | 'resolved' = 'open'): Record<string, unknown> {
  const nextReview = status === 'resolved' ? undefined : plusDays(event.ts, reviewSuccesses === 0 ? 1 : 3);
  const props: Record<string, unknown> = {
    Name: { title: richText(event.lesson + ' · ' + event.concept + ' · ' + (event.itemId ?? event.id)) },
    'Event ID': { rich_text: richText(event.id) },
    'Item ID': { rich_text: richText(event.itemId ?? '') },
    Question: { rich_text: richText(event.questionText ?? '') },
    'Wrong answer': { rich_text: richText(event.userAnswer ?? '') },
    'Concept ID': { rich_text: richText(event.concept) },
    Lesson: { rich_text: richText(event.lesson) },
    Session: { relation: [{ id: sessionPageId }] },
    Attempt: { relation: [{ id: attemptPageId }] },
    Status: { select: { name: status } },
    'Review successes': { number: reviewSuccesses },
    'Last attempt at': { date: { start: tehranDateTime(event.ts) } },
    'Data Mode': { select: { name: 'Live' } },
    isTest: { checkbox: false },
  };
  if (event.errorTag) props['Error tag'] = { select: { name: event.errorTag } };
  if (event.note) props['Why-wrong note'] = { rich_text: richText(event.note) };
  if (nextReview) props['Next review'] = { date: { start: tehranDateTime(nextReview) } };
  return props;
}

export function richText(value: string): Array<{ type: 'text'; text: { content: string } }> {
  const chars = Array.from(value);
  if (chars.length === 0) return [];
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += 1_800) chunks.push(chars.slice(index, index + 1_800).join(''));
  return chunks.slice(0, 100).map(content => ({ type: 'text', text: { content } }));
}

function titleForAttempt(event: LearnEvent): string {
  return event.session + ' · ' + event.lesson + ' · ' + event.concept + ' · ' + (event.itemId ?? event.type) + ' · #' + (event.attemptNo ?? 1);
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

function plusDays(timestamp: string, days: number): string {
  return new Date(Date.parse(timestamp) + days * 24 * 60 * 60_000).toISOString();
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
