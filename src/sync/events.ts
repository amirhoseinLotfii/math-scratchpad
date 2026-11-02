import { z } from 'zod';

export const LEARN_EVENT_TYPES = [
  'lesson_open', 'lesson_close', 'chunk_open', 'chunk_read', 'section_open', 'section_close',
  'question_open', 'question_close', 'check_answer', 'check_skipped',
  'example_attempt', 'example_revealed', 'content_revealed', 'tryit_attempt', 'exercise_attempt', 'answer_edited',
  'step_open', 'step_close', 'step_added', 'step_edited', 'hint_used',
  'more_practice', 'explain_own_words', 'explain_why', 'mixed_review_attempt',
  'concept_complete', 'lesson_complete', 'session_start', 'session_end',
  'session_reset', 'mistake_logged', 'review_due_done', 'confidence_set',
  'reverse_attempt', 'timed_round', 'error_tagged', 'mastery_changed',
  'tab_hidden', 'tab_visible', 'window_blur', 'window_focus', 'idle_start',
  'idle_end', 'mood_logged', 'gate_attempt', 'gate_passed', 'gate_failed',
  'goal_status', 'backup_created', 'backup_restored', 'report_generated',
  'section_complete', 'practice_started', 'lesson_skip', 'scope_paused', 'scope_resumed',
] as const;

export const LEARN_EVENT_ITEM_TYPES = ['typed', 'mcq', 'true_false_why', 'find_mistake', 'step_by_step', 'explain', 'reverse'] as const;

const uuidV4 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Expected a UUID v4.');
const isoDateTime = z.string().datetime({ offset: true });
const boundedText = (max: number) => z.string().max(max);
function availableStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export const learnEventSchema = z.object({
  id: uuidV4,
  schema: z.literal(1),
  ts: isoDateTime,
  endTs: isoDateTime.optional(),
  durationMs: z.number().finite().min(0).max(366 * 24 * 60 * 60 * 1000).optional(),
  deviceId: uuidV4,
  bankVersion: z.string().min(1).max(50),
  session: z.string().min(1).max(100),
  chapter: z.number().int().min(0).max(99),
  lesson: z.string().min(1).max(100),
  section: z.string().min(1).max(100),
  concept: z.string().min(1).max(120),
  skill: z.string().min(1).max(120).optional(),
  pdfPage: z.number().int().positive().max(100_000).optional(),
  bookPage: z.number().int().positive().max(100_000).optional(),
  type: z.enum(LEARN_EVENT_TYPES),
  itemId: z.string().min(1).max(160).optional(),
  itemType: z.enum(LEARN_EVENT_ITEM_TYPES).optional(),
  questionText: boundedText(8_000).optional(),
  userAnswer: boundedText(8_000).optional(),
  steps: z.array(boundedText(4_000)).max(40).optional(),
  verdict: z.enum(['correct', 'incorrect', 'submitted']).optional(),
  verdictSource: z.enum(['checker', 'none']).optional(),
  attemptNo: z.number().int().positive().max(100_000).optional(),
  hintLevel: z.number().int().min(0).max(20).optional(),
  note: boundedText(2_000).optional(),
  confidence: z.union([z.number().int().min(1).max(5), z.enum(['low', 'medium', 'high'])]).optional(),
  errorTag: z.enum(['calculation', 'sign', 'concept', 'question_reading', 'careless', 'other']).optional(),
  masteryLevel: z.enum(['new', 'learning', 'know', 'master']).optional(),
  activeMs: z.number().finite().min(0).max(366 * 24 * 60 * 60 * 1000).optional(),
  distractedMs: z.number().finite().min(0).max(366 * 24 * 60 * 60 * 1000).optional(),
  pausedMs: z.number().finite().min(0).max(366 * 24 * 60 * 60 * 1000).optional(),
  mood: z.enum(['tired', 'neutral', 'energized']).optional(),
}).strict().superRefine((event, ctx) => {
  if (event.endTs && Date.parse(event.endTs) < Date.parse(event.ts)) {
    ctx.addIssue({ code: 'custom', path: ['endTs'], message: 'endTs cannot be earlier than ts.' });
  }
  if (event.verdict === 'correct' || event.verdict === 'incorrect') {
    if (event.verdictSource !== 'checker') ctx.addIssue({ code: 'custom', path: ['verdictSource'], message: 'Correctness requires a reliable checker.' });
  }
  if (event.verdict === 'submitted' && event.verdictSource !== 'none') {
    ctx.addIssue({ code: 'custom', path: ['verdictSource'], message: 'Submitted-only events must use verdictSource none.' });
  }
  if (event.durationMs !== undefined
    && (event.activeMs ?? 0) + (event.distractedMs ?? 0) + (event.pausedMs ?? 0) > event.durationMs + 1) {
    ctx.addIssue({ code: 'custom', path: ['activeMs'], message: 'Active, distracted and paused time cannot exceed wall duration.' });
  }
});

export type LearnEvent = z.infer<typeof learnEventSchema>;
export type LearnEventType = LearnEvent['type'];
export type LearnEventItemType = LearnEvent['itemType'];
export type LearnEventContext = Partial<Pick<LearnEvent,
  'deviceId' | 'bankVersion' | 'session' | 'chapter' | 'lesson' | 'section' | 'concept' | 'skill' | 'pdfPage' | 'bookPage'>>;
export type LearnEventDraft = Omit<LearnEvent, 'id' | 'schema' | 'ts' | 'deviceId' | 'bankVersion' | 'session' | 'chapter' | 'lesson' | 'section' | 'concept'>
  & Partial<Pick<LearnEvent, 'id' | 'schema' | 'ts' | 'deviceId' | 'bankVersion' | 'session' | 'chapter' | 'lesson' | 'section' | 'concept'>>;

export type LearnEventListener = (event: LearnEvent) => void;
const listeners = new Set<LearnEventListener>();
let inMemoryDeviceId: string | undefined;
const DEVICE_ID_KEY = 'math-scratchpad-device-id-v1';

function uuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('A secure random source is required to create learning event IDs.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = availableStorage()): string {
  if (inMemoryDeviceId) return inMemoryDeviceId;
  try {
    const existing = storage?.getItem(DEVICE_ID_KEY);
    if (existing && uuidV4.safeParse(existing).success) return inMemoryDeviceId = existing;
  } catch { /* local storage may be unavailable; keep the device id in memory. */ }
  const created = uuid();
  inMemoryDeviceId = created;
  try { storage?.setItem(DEVICE_ID_KEY, created); } catch { /* the later IndexedDB card will own durable event storage. */ }
  return created;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Validate, freeze, and publish one append-only event to any active event sinks. */
export function emit(input: LearnEvent): LearnEvent {
  const event = deepFreeze(learnEventSchema.parse(input));
  for (const listener of listeners) {
    try { listener(event); } catch { /* A sink must never break the learner's current action. */ }
  }
  return event;
}

/** Create a schema-v1 event with stable local context, then publish its immutable snapshot. */
export function emitLearnEvent(context: LearnEventContext, draft: LearnEventDraft): LearnEvent {
  const event = {
    id: draft.id ?? uuid(), schema: 1 as const, ts: draft.ts ?? new Date().toISOString(), deviceId: draft.deviceId ?? context.deviceId ?? getDeviceId(),
    bankVersion: draft.bankVersion ?? context.bankVersion ?? 'unknown', session: draft.session ?? context.session ?? 'unknown',
    chapter: draft.chapter ?? context.chapter ?? 0, lesson: draft.lesson ?? context.lesson ?? 'unknown',
    section: draft.section ?? context.section ?? 'unknown', concept: draft.concept ?? context.concept ?? 'unknown',
    ...(context.skill ? { skill: context.skill } : {}), ...(context.pdfPage ? { pdfPage: context.pdfPage } : {}), ...(context.bookPage ? { bookPage: context.bookPage } : {}),
    ...draft,
  };
  return emit(event as LearnEvent);
}

export function subscribeToLearnEvents(listener: LearnEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetLearnEventRuntimeForTests() {
  listeners.clear();
  inMemoryDeviceId = undefined;
}

export function contextForQuestion(input: {
  bankVersion?: string; session?: string; chapter?: number; lesson?: string; section?: string; concept?: string; skill?: string;
  question?: { lessonId?: string; sectionId?: string; conceptId?: string; tags?: { chapter?: string; lesson?: string; section?: string; concept?: string; skill?: string } };
  lessonPages?: { startPage?: number; endPage?: number };
}): LearnEventContext {
  const question = input.question;
  const chapterFromTag = Number(question?.tags?.chapter?.match(/\d+/)?.[0]);
  const page = input.lessonPages?.startPage;
  const clean = (value: string | undefined, max: number) => value?.trim().slice(0, max) || 'unknown';
  const skill = input.skill ?? question?.tags?.skill;
  return {
    bankVersion: clean(input.bankVersion, 50), session: clean(input.session, 100),
    chapter: input.chapter ?? (Number.isInteger(chapterFromTag) && chapterFromTag > 0 ? chapterFromTag : 0),
    lesson: clean(input.lesson ?? question?.tags?.lesson ?? question?.lessonId, 100),
    section: clean(input.section ?? question?.tags?.section ?? question?.sectionId, 100),
    concept: clean(input.concept ?? question?.tags?.concept ?? question?.conceptId, 120),
    ...(skill?.trim() ? { skill: skill.trim().slice(0, 120) } : {}),
    ...(page ? { bookPage: page } : {}),
  };
}
