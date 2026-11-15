import { learnEventSchema, type LearnEvent } from '../../../shared/contracts/learn-event';
import {
  applyConceptEvent,
  applyDailyEvent,
  applySessionEvent,
  isAttemptLikeEvent,
  tehranDayKey,
  type ConceptProjection,
  type DailyProjection,
  type SessionProjection,
} from '../notion-projection';
import { NOTION_PROJECTION_PAGE_SIZE } from './limits';

export function projectionSequence(storage: DurableObjectStorage): number {
  return Number(storage.sql.exec<{ last_seq: number }>('SELECT last_seq FROM notion_projection_meta WHERE singleton = 1').one().last_seq);
}

export function setProjectionSequence(storage: DurableObjectStorage, sequence: number): void {
  storage.sql.exec('UPDATE notion_projection_meta SET last_seq = ? WHERE singleton = 1', sequence);
}

export function readNotionProjection<T>(storage: DurableObjectStorage, kind: string, key: string): T | undefined {
  const row = storage.sql
    .exec<{
      projection_json: string;
    }>('SELECT projection_json FROM notion_projections WHERE projection_type = ? AND projection_key = ?', kind, key)
    .toArray()[0];
  return row ? (JSON.parse(row.projection_json) as T) : undefined;
}

export function saveNotionProjection(storage: DurableObjectStorage, kind: string, key: string, value: unknown): void {
  storage.sql.exec(
    'INSERT INTO notion_projections (projection_type, projection_key, projection_json) VALUES (?, ' +
      '?, ?) ON CONFLICT(projection_type, projection_key) DO UPDATE SET projection_json = ' +
      'excluded.projection_json',
    kind,
    key,
    JSON.stringify(value),
  );
}

export function applyNotionProjection(storage: DurableObjectStorage, event: LearnEvent): void {
  if (typeof event.isTest !== 'boolean') return;
  if (event.type === 'chapter_snapshot') return;
  const priorSession = readNotionProjection<SessionProjection>(storage, 'session', event.session);
  saveNotionProjection(storage, 'session', event.session, applySessionEvent(priorSession, event));
  if (event.isTest) return;

  const dayKey = tehranDayKey(event.ts);
  const priorDaily = readNotionProjection<DailyProjection>(storage, 'daily', dayKey);
  const daily = applyDailyEvent(priorDaily, event);
  if (daily) saveNotionProjection(storage, 'daily', dayKey, daily);

  const conceptKey = [event.chapter, event.lesson, event.concept].join(':');
  const priorConcept = readNotionProjection<ConceptProjection>(storage, 'concept', conceptKey);
  const concept = applyConceptEvent(priorConcept, event);
  if (concept) saveNotionProjection(storage, 'concept', conceptKey, concept);
}

export async function repairNotionProjections(storage: DurableObjectStorage, through: number): Promise<boolean> {
  const projectedThrough = projectionSequence(storage);
  if (projectedThrough >= through) return true;
  const rows = storage.sql
    .exec<{
      seq: number;
      event_json: string;
    }>(
      'SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?',
      projectedThrough,
      through,
      NOTION_PROJECTION_PAGE_SIZE,
    )
    .toArray();
  if (rows.length === 0) return projectionSequence(storage) >= through;
  storage.transactionSync(() => {
    for (const row of rows) {
      const sequence = Number(row.seq);
      if (sequence !== projectionSequence(storage) + 1) break;
      applyNotionProjection(storage, JSON.parse(row.event_json) as LearnEvent);
      setProjectionSequence(storage, sequence);
    }
  });
  return projectionSequence(storage) >= through;
}

/** Rebuild derived Notion projections after deleting scoped source events. */
export function rebuildNotionProjectionsFromEventLog(storage: DurableObjectStorage): void {
  storage.sql.exec('DELETE FROM notion_projections');
  storage.sql.exec('UPDATE notion_projection_meta SET last_seq = 0 WHERE singleton = 1');
  const rows = storage.sql
    .exec<{ seq: number; event_json: string }>('SELECT seq, event_json FROM learning_events ORDER BY seq ASC')
    .toArray();
  for (const row of rows) {
    const event = learnEventSchema.parse(JSON.parse(row.event_json));
    applyNotionProjection(storage, event);
    setProjectionSequence(storage, Number(row.seq));
  }
}

/** Journaled, owner-routed scoped reset. Every destructive write is one SQLite transaction. */
