import type { LearnEvent } from '../events';
import { isLocalLearningResetPending } from '../reset-gate/local-reset';
import { isServerResetStatusVerified, getLocalPendingResetCreationEpoch, getLearningResetRequestEpoch } from '../learning-reset-epoch';
import { database } from './database';
import {
  LEARNING_OUTBOX_STORE,
  LEARNING_QUARANTINE_STORE,
  LEARNING_META_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  type OutboxRecord,
  type ServerEventRecord,
  type MetaRecord,
} from './schema';

const pendingOutboxWrites = new Set<Promise<void>>();

export function queueLearnEvent(event: LearnEvent, migrationId?: string): Promise<void> {
  const write = (async () => {
    const db = await database();
    const existing = await db.get(LEARNING_OUTBOX_STORE, event.id);
    const serialized = JSON.stringify(event);
    if (existing && JSON.stringify(existing.event) !== serialized) throw new Error('An event id was reused with different content.');
    if (!existing) {
      const creationEpoch =
        isLocalLearningResetPending() || !isServerResetStatusVerified()
          ? getLocalPendingResetCreationEpoch()
          : getLearningResetRequestEpoch();
      await db.put(LEARNING_OUTBOX_STORE, {
        id: event.id,
        event,
        queuedAt: event.ts,
        creationEpoch,
        ...(migrationId ? { migrationId } : {}),
      });
    }
  })();
  pendingOutboxWrites.add(write);
  void write.finally(() => pendingOutboxWrites.delete(write)).catch(() => undefined);
  return write;
}

export async function flushOutboxWrites(): Promise<void> {
  while (pendingOutboxWrites.size) await Promise.all([...pendingOutboxWrites]);
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
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function storeServerEvents(events: ServerEventRecord[]): Promise<void> {
  if (!events.length) return;
  const db = await database();
  const tx = db.transaction(LEARNING_SERVER_EVENTS_STORE, 'readwrite');
  await Promise.all(events.map((item) => tx.store.put(item)));
  await tx.done;
}

export async function readServerEventsByMigration(migrationId: string): Promise<ServerEventRecord[]> {
  const db = await database();
  return db.getAllFromIndex(LEARNING_SERVER_EVENTS_STORE, 'by-migration-id', migrationId);
}

export async function getSyncMeta<T>(key: string): Promise<T | undefined> {
  const value = (await (await database()).get(LEARNING_META_STORE, key)) as MetaRecord | undefined;
  return value?.value as T | undefined;
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  await (await database()).put(LEARNING_META_STORE, { key, value });
}
