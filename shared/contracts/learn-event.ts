import * as z from 'zod/mini';

export const LEARN_EVENT_TYPES = [
  'lesson_open',
  'lesson_close',
  'chunk_open',
  'chunk_read',
  'section_open',
  'section_close',
  'question_open',
  'question_close',
  'check_answer',
  'check_skipped',
  'example_attempt',
  'example_revealed',
  'content_revealed',
  'tryit_attempt',
  'exercise_attempt',
  'answer_edited',
  'step_open',
  'step_close',
  'step_added',
  'step_edited',
  'hint_used',
  'more_practice',
  'explain_own_words',
  'explain_why',
  'mixed_review_attempt',
  'concept_complete',
  'lesson_complete',
  'session_start',
  'session_end',
  'session_reset',
  'mistake_logged',
  'review_due_done',
  'confidence_set',
  'reverse_attempt',
  'timed_round',
  'error_tagged',
  'mastery_changed',
  'tab_hidden',
  'tab_visible',
  'window_blur',
  'window_focus',
  'idle_start',
  'idle_end',
  'mood_logged',
  'gate_attempt',
  'gate_passed',
  'gate_failed',
  'goal_status',
  'backup_created',
  'backup_restored',
  'report_generated',
  'legacy_state_migration',
  'section_complete',
  'practice_started',
  'lesson_skip',
  'scope_paused',
  'scope_resumed',
  'chapter_snapshot',
] as const;

export const LEARN_EVENT_ITEM_TYPES = ['typed', 'mcq', 'true_false_why', 'find_mistake', 'step_by_step', 'explain', 'reverse'] as const;

export const learnEventIdSchema = z.uuidv4({ error: 'Expected a UUID v4.' });
const isoDateTime = z.iso.datetime({ offset: true });
const boundedText = (max: number) => z.string().check(z.maxLength(max));
const textBetween = (min: number, max: number) => z.string().check(z.minLength(min), z.maxLength(max));
const integerBetween = (min: number, max: number) => z.int().check(z.minimum(min), z.maximum(max));
const positiveIntegerAtMost = (max: number) => z.int().check(z.positive(), z.maximum(max));
const nonnegativeNumberAtMost = (max: number) => z.number().check(z.nonnegative(), z.maximum(max));
export const legacyMigrationChunkSchema = z
  .strictObject({
    id: learnEventIdSchema,
    key: textBetween(1, 200),
    index: integerBetween(0, 100_000),
    count: integerBetween(1, 100_001),
    sha256: z.string().check(z.regex(/^[a-f0-9]{64}$/i)),
    data: boundedText(8_500),
  })
  .check(
    z.superRefine((chunk, ctx) => {
      if (chunk.index >= chunk.count) ctx.addIssue({ code: 'custom', path: ['index'], message: 'Chunk index must be below count.' });
    }),
  );
export const learnEventSchema = z
  .strictObject({
    id: learnEventIdSchema,
    schema: z.literal(1),
    ts: isoDateTime,
    endTs: z.optional(isoDateTime),
    durationMs: z.optional(nonnegativeNumberAtMost(366 * 24 * 60 * 60 * 1000)),
    deviceId: learnEventIdSchema,
    bankVersion: textBetween(1, 50),
    session: textBetween(1, 100),
    chapter: integerBetween(0, 99),
    lesson: textBetween(1, 100),
    section: textBetween(1, 100),
    concept: textBetween(1, 120),
    skill: z.optional(textBetween(1, 120)),
    pdfPage: z.optional(positiveIntegerAtMost(100_000)),
    bookPage: z.optional(positiveIntegerAtMost(100_000)),
    type: z.enum(LEARN_EVENT_TYPES),
    isTest: z.optional(z.boolean()),
    itemId: z.optional(textBetween(1, 160)),
    itemType: z.optional(z.enum(LEARN_EVENT_ITEM_TYPES)),
    questionText: z.optional(boundedText(8_000)),
    userAnswer: z.optional(boundedText(8_000)),
    steps: z.optional(z.array(boundedText(4_000)).check(z.maxLength(40))),
    verdict: z.optional(z.enum(['correct', 'incorrect', 'submitted'])),
    verdictSource: z.optional(z.enum(['checker', 'none'])),
    attemptNo: z.optional(positiveIntegerAtMost(100_000)),
    hintLevel: z.optional(integerBetween(0, 20)),
    note: z.optional(boundedText(2_000)),
    confidence: z.optional(z.union([integerBetween(1, 5), z.enum(['low', 'medium', 'high'])])),
    errorTag: z.optional(z.enum(['calculation', 'sign', 'concept', 'question_reading', 'careless', 'other'])),
    masteryLevel: z.optional(z.enum(['new', 'learning', 'know', 'master'])),
    activeMs: z.optional(nonnegativeNumberAtMost(366 * 24 * 60 * 60 * 1000)),
    distractedMs: z.optional(nonnegativeNumberAtMost(366 * 24 * 60 * 60 * 1000)),
    pausedMs: z.optional(nonnegativeNumberAtMost(366 * 24 * 60 * 60 * 1000)),
    mood: z.optional(z.enum(['tired', 'neutral', 'energized'])),
    migrationChunk: z.optional(legacyMigrationChunkSchema),
    snapshotId: z.optional(learnEventIdSchema),
    snapshotBankId: z.optional(textBetween(1, 100)),
    snapshotPart: z.optional(integerBetween(0, 100_000)),
    snapshotParts: z.optional(integerBetween(1, 100_001)),
    snapshotSha256: z.optional(z.string().check(z.regex(/^[a-f0-9]{64}$/i))),
    snapshotData: z.optional(boundedText(8_000)),
  })
  .check(
    z.superRefine((event, ctx) => {
      if (event.type === 'legacy_state_migration' && !event.migrationChunk) {
        ctx.addIssue({ code: 'custom', path: ['migrationChunk'], message: 'Legacy migration events require a chunk payload.' });
      }
      if (event.type !== 'legacy_state_migration' && event.migrationChunk) {
        ctx.addIssue({ code: 'custom', path: ['migrationChunk'], message: 'Migration chunks are only allowed on migration events.' });
      }
      const snapshotFields = [
        event.snapshotId,
        event.snapshotBankId,
        event.snapshotPart,
        event.snapshotParts,
        event.snapshotSha256,
        event.snapshotData,
      ];
      if (event.type === 'chapter_snapshot') {
        if (snapshotFields.some((value) => value === undefined)) {
          ctx.addIssue({ code: 'custom', path: ['snapshotData'], message: 'Chapter snapshots require complete chunk metadata.' });
        }
        if (event.snapshotPart !== undefined && event.snapshotParts !== undefined && event.snapshotPart >= event.snapshotParts) {
          ctx.addIssue({ code: 'custom', path: ['snapshotPart'], message: 'Snapshot part must be below the total part count.' });
        }
      } else if (snapshotFields.some((value) => value !== undefined)) {
        ctx.addIssue({ code: 'custom', path: ['snapshotData'], message: 'Snapshot fields are only allowed on chapter snapshot events.' });
      }
      if (event.endTs && Date.parse(event.endTs) < Date.parse(event.ts)) {
        ctx.addIssue({ code: 'custom', path: ['endTs'], message: 'endTs cannot be earlier than ts.' });
      }
      if (event.verdict === 'correct' || event.verdict === 'incorrect') {
        if (event.verdictSource !== 'checker')
          ctx.addIssue({ code: 'custom', path: ['verdictSource'], message: 'Correctness requires a reliable checker.' });
      }
      if (event.verdict === 'submitted' && event.verdictSource !== 'none') {
        ctx.addIssue({ code: 'custom', path: ['verdictSource'], message: 'Submitted-only events must use verdictSource none.' });
      }
      if (
        event.durationMs !== undefined &&
        (event.activeMs ?? 0) + (event.distractedMs ?? 0) + (event.pausedMs ?? 0) > event.durationMs + 1
      ) {
        ctx.addIssue({ code: 'custom', path: ['activeMs'], message: 'Active, distracted and paused time cannot exceed wall duration.' });
      }
    }),
  );

export type LearnEvent = z.infer<typeof learnEventSchema>;
export type LearnEventType = LearnEvent['type'];
export type LearnEventItemType = LearnEvent['itemType'];
export type LearnEventContext = Partial<
  Pick<LearnEvent, 'deviceId' | 'bankVersion' | 'session' | 'chapter' | 'lesson' | 'section' | 'concept' | 'skill' | 'pdfPage' | 'bookPage'>
>;
export type LearnEventDraft = Omit<
  LearnEvent,
  'id' | 'schema' | 'ts' | 'deviceId' | 'bankVersion' | 'session' | 'chapter' | 'lesson' | 'section' | 'concept'
> &
  Partial<Pick<LearnEvent, 'id' | 'schema' | 'ts' | 'deviceId' | 'bankVersion' | 'session' | 'chapter' | 'lesson' | 'section' | 'concept'>>;
