import { z } from 'zod';
import { BankChapterSchema } from './bank-chapter.types';
import { ChapterProgressSchema } from './chapter-progress.types';
import { HistoryChunkSchema } from './history-chunk.types';
import { TimerLogSchema } from './timer-log.types';

export const ChapterBundleSchema = z.object({
  schemaVersion: z.string(),
  kind: z.literal('chapter_bundle'),
  exportedAtIso: z.string(),
  bank: BankChapterSchema,
  progress: ChapterProgressSchema,
  historyChunks: z.array(HistoryChunkSchema),
  timers: TimerLogSchema.optional()
}).passthrough();

export type ChapterBundle = z.infer<typeof ChapterBundleSchema>;
