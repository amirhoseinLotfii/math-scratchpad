import * as z from 'zod/mini';
import type { CacheRecord, MetaRecord, OutboxRecord, ServerEventRecord } from '../browser-db';
import { learnEventSchema } from '../events';

export const FULL_BACKUP_FORMAT = 'math-scratchpad-full-backup/v1';
export const MAX_FULL_BACKUP_BYTES = 50 * 1024 * 1024;
export const DEVICE_ID_KEY = 'math-scratchpad-device-id-v1';

const isoDateTime = z.iso.datetime({ offset: true });
const cacheSchema = z.strictObject({
  key: z.string().check(z.minLength(1), z.maxLength(512)),
  value: z.string().check(z.maxLength(10_000_000)),
  updatedAt: isoDateTime,
});
const outboxSchema = z.strictObject({
  id: z.uuid(),
  event: learnEventSchema,
  queuedAt: isoDateTime,
  creationEpoch: z.optional(z.string().check(z.minLength(8), z.maxLength(128), z.regex(/^[a-zA-Z0-9._:-]+$/))),
  migrationId: z.optional(z.uuid()),
}).check(z.refine(record => record.id === record.event.id, { error: 'Outbox key must match its event ID.' }));
const serverEventSchema = z.strictObject({
  seq: z.int().check(z.positive(), z.maximum(Number.MAX_SAFE_INTEGER)),
  event: learnEventSchema,
});
const metaSchema = z.custom<MetaRecord>(value => !!value && typeof value === 'object' && !Array.isArray(value)
  && typeof (value as MetaRecord).key === 'string' && (value as MetaRecord).key.length > 0
  && (value as MetaRecord).key.length <= 512 && Object.hasOwn(value, 'value'));

export const storesSchema = z.strictObject({
  cache: z.array(cacheSchema).check(z.maxLength(100_000)),
  outbox: z.array(outboxSchema).check(z.maxLength(100_000)),
  serverEvents: z.array(serverEventSchema).check(z.maxLength(200_000)),
  meta: z.array(metaSchema).check(z.maxLength(10_000)),
});

export const backupSchema = z.strictObject({
  format: z.literal(FULL_BACKUP_FORMAT),
  schemaVersion: z.literal(1),
  createdAt: isoDateTime,
  stores: storesSchema,
  sha256: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
});

export type FullLearningBackup = z.infer<typeof backupSchema>;
export type LearningStores = z.infer<typeof storesSchema>;
export type Counts = { cache: number; outbox: number; serverEvents: number; meta: number };
export type LearningBackupPreview = {
  incoming: Counts;
  additions: Counts;
  alreadyPresent: Counts;
  preservedConflicts: Counts;
  blockingConflicts: string[];
  canImport: boolean;
};
export type LearningBackupImportResult = LearningBackupPreview & { addedCacheKeys: string[]; removedQueuedIds: string[] };

export type MergePlan = {
  preview: LearningBackupPreview;
  cache: CacheRecord[];
  outbox: OutboxRecord[];
  serverEvents: ServerEventRecord[];
  meta: MetaRecord[];
  removeOutboxIds: string[];
};
