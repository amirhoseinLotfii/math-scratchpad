import { z } from 'zod';
import { HLC_REGEX } from './chapter-progress.types';

export const TimerModeSchema = z.enum([
  'lesson',
  'session',
  'pomodoro_work',
  'pomodoro_break'
]);

export type TimerMode = z.infer<typeof TimerModeSchema>;

export const TimerStatusSchema = z.enum([
  'running',
  'paused',
  'completed',
  'aborted'
]);

export type TimerStatus = z.infer<typeof TimerStatusSchema>;

export const NotionSyncStateSchema = z.enum([
  'pending',
  'synced',
  'disabled',
  'failed'
]);

export type NotionSyncState = z.infer<typeof NotionSyncStateSchema>;

export const TimerSessionSchema = z.object({
  sessionId: z.string(),
  mode: TimerModeSchema,
  startedAtIso: z.string(),
  endedAtIso: z.string().optional(),
  activeDurationSeconds: z.number().int().nonnegative(),
  status: TimerStatusSchema,
  updatedHlc: z.string().regex(HLC_REGEX),
  notionSyncState: NotionSyncStateSchema,
  chapterId: z.string().optional(),
  itemId: z.string().optional(),
  pomodoroCycleIndex: z.number().int().nonnegative().optional(),
  notionPageId: z.string().optional()
}).passthrough();

export type TimerSession = z.infer<typeof TimerSessionSchema>;

export const TimerLogSchema = z.object({
  schemaVersion: z.string(),
  kind: z.literal('timer_log'),
  updatedHlc: z.string().regex(HLC_REGEX),
  sessions: z.record(z.string(), TimerSessionSchema)
}).passthrough();

export type TimerLog = z.infer<typeof TimerLogSchema>;
