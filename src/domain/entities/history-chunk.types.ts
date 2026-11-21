import { z } from 'zod';
import { HLC_REGEX, StepRecordSchema } from './chapter-progress.types';

export const HistoryRecordTypeSchema = z.enum([
  'step_version',
  'final_submit_attempt',
  'post_submit_revision'
]);

export type HistoryRecordType = z.infer<typeof HistoryRecordTypeSchema>;

export const HistoryRecordSchema = z.object({
  recordId: z.string(),
  recordType: HistoryRecordTypeSchema,
  itemId: z.string(),
  bankVersion: z.string(),
  createdHlc: z.string().regex(HLC_REGEX),
  createdAtIso: z.string(),
  snapshot: z.object({
    steps: z.record(z.string(), StepRecordSchema),
    finalAnswer: z.record(z.string(), z.unknown()).optional()
  }).passthrough()
}).passthrough();

export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;

export const HistoryChunkSchema = z.object({
  schemaVersion: z.string(),
  kind: z.literal('history_chunk'),
  chunkId: z.string(),
  chapterId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  deviceId: z.string(),
  records: z.array(HistoryRecordSchema)
}).passthrough();

export type HistoryChunk = z.infer<typeof HistoryChunkSchema>;
