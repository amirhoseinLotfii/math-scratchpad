import type { LearnEvent } from '../events';
import {
  getLearningResetRequestEpoch,
  getLocalPendingResetCreationEpoch,
  isServerResetStatusVerified,
} from '../learning-reset-epoch';
import { database } from './learning-db-connection';
import {
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_QUARANTINE_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  type MetaRecord,
  type OutboxRecord,
  type ServerEventRecord,
} from './learning-db-schema';
import { isLocalLearningResetPending } from './learning-reset-reconciler';

const memoryOutbox = new Map<string, OutboxRecord>();
const memoryServerEvents = new Map<number, ServerEventRecord>();
const memoryMeta = new Map<string, unknown>();

export function memoryOutboxRecords(): OutboxRecord[] {
  return [...memoryOutbox.values()];
}

export function memoryServerEventRecords(): ServerEventRecord[] {
  return [...memoryServerEvents.values()].sort((a, b) => a.seq - b.seq);
}

export function clearMemoryEventStores(): void {
  memoryOutbox.clear();
  memoryServerEvents.clear();
  memoryMeta.clear();
}

export async function queueLearnEvent(event: LearnEvent, migrationId?: string): Promise<void> {
  const db = await database();
  const existing = await db.get(LEARNING_OUTBOX_STORE, event.id);
  const serialized = JSON.stringify(event);
  if (existing && JSON.stringify(existing.event) !== serialized) throw new Error('An event id was reused with different content.');
  if (!existing) {
    const creationEpoch = isLocalLearningResetPending() || !isServerResetStatusVerified()
      ? getLocalPendingResetCreationEpoch()
      : getLearningResetRequestEpoch();
    await db.put(LEARNING_OUTBOX_STORE, { id: event.id, event, queuedAt: event.ts, creationEpoch, ...(migrationId ? { migrationId } : {}) });
  }
}

export async function readOutboxBatch(maxItems = 50): Promise<OutboxRecord[]> {
  const db = await database();
  return db.getAllFromIndex(LEARNING_OUTBOX_STORE, 'by-queued-at', undefined, Math.max(1, Math.min(50, maxItems)));
}

export async function readOutboxCount(): Promise<number> {
  return (await database()).count(LEARNING_OUTBOX_STORE);
}

export async function readQuarantineCount(): Promise<number> {
  return (await database()).count(LEARNING_QUARANTINE_STORE);
}

export async function acknowledgeOutbox(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await database();
  const tx = db.transaction(LEARNING_OUTBOX_STORE, 'readwrite');
  await Promise.all(ids.map(id => tx.store.delete(id)));
  await tx.done;
}

export async function storeServerEvents(events: ServerEventRecord[]): Promise<void> {
  if (!events.length) return;
  const db = await database();
  const tx = db.transaction(LEARNING_SERVER_EVENTS_STORE, 'readwrite');
  await Promise.all(events.map(item => tx.store.put(item)));
  await tx.done;
}

export async function readServerEventsByMigration(migrationId: string): Promise<ServerEventRecord[]> {
  const db = await database();
  return db.getAllFromIndex(LEARNING_SERVER_EVENTS_STORE, 'by-migration-id', migrationId);
}

export async function getSyncMeta<T>(key: string): Promise<T | undefined> {
  const value = await (await database()).get(LEARNING_META_STORE, key) as MetaRecord | undefined;
  return value?.value as T | undefined;
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  await (await database()).put(LEARNING_META_STORE, { key, value });
}
