import type { LearnEvent } from '../../shared/contracts/learn-event';
import {
  attemptSource,
  confidenceCalibration,
  topErrorTag,
  plusDays,
  confidenceLabel,
  confidenceNumber,
  errorCategory,
  tehranDateTime,
  type ConceptProjection,
  type DailyProjection,
  type SessionProjection,
} from './notion-projection';

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

export function buildAppStateMirrorProperties(input: {
  externalKey: string;
  key: string;
  value: string;
  revision: number;
  part: number;
  parts: number;
  updatedAt: string;
  syncedAt: string;
}): Record<string, unknown> {
  return {
    Name: { title: richText(`App state · ${input.key} · ${input.part + 1}/${input.parts}`) },
    'Event ID': { rich_text: richText(input.externalKey) },
    'Data Mode': { select: { name: 'Live' } },
    isTest: { checkbox: false },
    Chapter: { number: 0 },
    Question: { rich_text: richText(input.key) },
    Answer: { rich_text: richText(input.value) },
    'Steps Raw': {
      rich_text: richText(
        JSON.stringify({
          format: 'math-scratchpad.app-state-mirror/v1',
          key: input.key,
          revision: input.revision,
          part: input.part,
          parts: input.parts,
          updatedAt: input.updatedAt,
        }),
      ),
    },
    'Attempted At': { date: { start: tehranDateTime(input.updatedAt) } },
    'Synced at': { date: { start: tehranDateTime(input.syncedAt) } },
  };
}

export function buildChapterSnapshotProperties(input: {
  externalKey: string;
  bankId: string;
  bankVersion: string;
  chapter: number;
  snapshotId: string;
  sha256: string;
  part: number;
  parts: number;
  data: string;
  createdAt: string;
  syncedAt: string;
}): Record<string, unknown> {
  return {
    Name: { title: richText(`Chapter ${input.chapter} archive · ${input.part + 1}/${input.parts}`) },
    'Event ID': { rich_text: richText(input.externalKey) },
    'Data Mode': { select: { name: 'Live' } },
    isTest: { checkbox: false },
    Chapter: { number: input.chapter },
    Question: { rich_text: richText(`Complete learner archive for ${input.bankId} (${input.bankVersion})`) },
    Answer: { rich_text: richText(input.data) },
    'Steps Raw': {
      rich_text: richText(
        JSON.stringify({
          format: 'math-scratchpad.chapter-snapshot/v1',
          bankId: input.bankId,
          bankVersion: input.bankVersion,
          chapter: input.chapter,
          snapshotId: input.snapshotId,
          sha256: input.sha256,
          part: input.part,
          parts: input.parts,
          createdAt: input.createdAt,
        }),
      ),
    },
    'Attempted At': { date: { start: tehranDateTime(input.createdAt) } },
    'Synced at': { date: { start: tehranDateTime(input.syncedAt) } },
  };
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
    Mistakes: { relation: stats.mistakePageIds.map((id) => ({ id })) },
  };
  if (stats.endedAt) props['Ended At'] = { date: { start: tehranDateTime(stats.endedAt) } };
  if (stats.mood) props.Mood = { select: { name: stats.mood === 'tired' ? 'Low' : stats.mood === 'energized' ? 'Great' : 'Okay' } };
  if (stats.goalStatus) props['Goal status'] = { select: { name: stats.goalStatus } };
  if (stats.status === 'Completed')
    props.Summary = { rich_text: richText('جلسه ' + stats.sessionId + ' پایان یافت؛ ' + stats.itemsAttempted + ' فعالیت تمرینی ثبت شد.') };
  return props;
}

export function buildDailyReportProperties(stats: DailyProjection, sessionPageIds: string[]): Record<string, unknown> {
  const accuracy = stats.graded ? roundTo((stats.correct / stats.graded) * 100, 1) : undefined;
  const report =
    'امروز ' +
    stats.items +
    ' تمرین انجام شد؛ ' +
    stats.correct +
    ' پاسخ درست از ' +
    stats.graded +
    ' پاسخ بررسی‌شده. زمان فعال: ' +
    roundTo(stats.activeMs / 60_000, 1) +
    ' دقیقه.';
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
    Sessions: { relation: sessionPageIds.map((id) => ({ id })) },
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

export function buildMistakeProperties(
  event: LearnEvent,
  sessionPageId: string,
  attemptPageId: string,
  reviewSuccesses = 0,
  status: 'open' | 'reviewing' | 'resolved' = 'open',
): Record<string, unknown> {
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
  return chunks.slice(0, 100).map((content) => ({ type: 'text', text: { content } }));
}

function titleForAttempt(event: LearnEvent): string {
  return (
    event.session + ' · ' + event.lesson + ' · ' + event.concept + ' · ' + (event.itemId ?? event.type) + ' · #' + (event.attemptNo ?? 1)
  );
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
