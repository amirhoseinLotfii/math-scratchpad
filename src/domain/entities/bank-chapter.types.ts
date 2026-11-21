import { z } from 'zod';

export const TextSegmentSchema = z.object({
  type: z.enum(['persian_text', 'ltr_text', 'math']),
  content: z.string()
}).passthrough();

export type TextSegment = z.infer<typeof TextSegmentSchema>;

export const SourceCitationSchema = z.object({
  book: z.string(),
  page: z.union([z.string(), z.number()]).optional(),
  section: z.string().optional(),
  note: z.string().optional()
}).passthrough();

export type SourceCitation = z.infer<typeof SourceCitationSchema>;

export const BankItemTypeSchema = z.enum([
  'worked_example',
  'guided_example',
  'yes_no_function',
  'domain_range',
  'table',
  'set',
  'math',
  'persian_text',
  'choice',
  'true_false_why',
  'find_mistake',
  'section_exercise'
]);

export type BankItemType = z.infer<typeof BankItemTypeSchema>;

export const BankItemSchema = z.object({
  itemId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  orderIndex: z.number().int().nonnegative(),
  itemType: BankItemTypeSchema,
  requiredForCompletion: z.boolean(),
  prompt: z.object({
    segments: z.array(TextSegmentSchema)
  }).passthrough(),
  prefillStep1: z.object({
    latex: z.string().optional(),
    segments: z.array(TextSegmentSchema).optional()
  }).passthrough().optional(),
  typeConfig: z.record(z.string(), z.unknown()).optional(),
  sources: z.array(SourceCitationSchema).optional(),
  isCustomImport: z.boolean().optional()
}).passthrough();

export type BankItem = z.infer<typeof BankItemSchema>;

export const BankChapterSchema = z.object({
  schemaVersion: z.string(),
  kind: z.literal('bank_chapter'),
  bankVersion: z.string(),
  chapterId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  title: z.object({
    fa: z.string(),
    en: z.string().optional()
  }).passthrough(),
  description: z.string().optional(),
  items: z.array(BankItemSchema)
}).passthrough();

export type BankChapter = z.infer<typeof BankChapterSchema>;
