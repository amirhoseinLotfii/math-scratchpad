import { z } from 'zod';
import { TextSegmentSchema } from './bank-chapter.types';

export const HLC_REGEX = /^[0-9]{13}:[0-9]{4}:[A-Za-z0-9._-]+$/;

export const StepRecordSchema = z.object({
  stepId: z.string(),
  orderKey: z.string(),
  branchId: z.string(),
  parentStepId: z.string().optional(),
  branchSign: z.enum(['plus', 'minus', 'case', '']).optional(),
  updatedHlc: z.string().regex(HLC_REGEX),
  deleted: z.boolean(),
  segments: z.array(TextSegmentSchema),
  combinedLatex: z.string().optional(),
  isPrefilledFromQuestion: z.boolean().optional()
}).passthrough();

export type StepRecord = z.infer<typeof StepRecordSchema>;

export const ItemStatusSchema = z.enum(['not_started', 'in_progress', 'solved']);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

export const ItemProgressSchema = z.object({
  status: ItemStatusSchema,
  statusHlc: z.string().regex(HLC_REGEX),
  attemptCount: z.number().int().nonnegative(),
  steps: z.record(z.string(), StepRecordSchema),
  finalAnswer: z.record(z.string(), z.unknown()).optional(),
  finalSubmittedAt: z.string().optional(),
  finalSubmitHlc: z.string().regex(HLC_REGEX).optional(),
  editedAfterSubmit: z.boolean().optional()
}).passthrough();

export type ItemProgress = z.infer<typeof ItemProgressSchema>;

export const ChapterProgressSchema = z.object({
  schemaVersion: z.string(),
  kind: z.literal('chapter_progress'),
  chapterId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  bankVersion: z.string(),
  updatedHlc: z.string().regex(HLC_REGEX),
  items: z.record(z.string(), ItemProgressSchema),
  resumeState: z.object({
    lastVisitedItemId: z.string().optional(),
    recentItemIds: z.array(z.string()).optional()
  }).passthrough().optional(),
  orphanedItems: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export type ChapterProgress = z.infer<typeof ChapterProgressSchema>;
