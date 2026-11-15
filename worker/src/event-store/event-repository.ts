import type { LearnEvent } from '../../../shared/contracts/learn-event';
import type { SequencedLearnEvent } from '../drive-projection';
import { json } from './response';
import { DRIVE_MIRROR_PAGE_SIZE, MAX_PAGE_SIZE } from './limits';

type StoredEvent = { seq: number; event: LearnEvent };

function integerQuery(url: URL, name: string, fallback: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export async function maxSequence(storage: DurableObjectStorage): Promise<number> {
  return Number(storage.sql.exec<{ seq: number }>('SELECT COALESCE(MAX(seq), 0) AS seq FROM learning_events').one().seq);
}

export function readEventsAfter(storage: DurableObjectStorage, cursor: number, through: number, limit: number): SequencedLearnEvent[] {
  const rows = storage.sql
    .exec<{
      seq: number;
      event_json: string;
    }>('SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?', cursor, through, limit)
    .toArray();
  return rows.map((row) => ({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent }));
}

export function readEventsThrough(storage: DurableObjectStorage, through: number): SequencedLearnEvent[] {
  const rows = storage.sql
    .exec<{
      seq: number;
      event_json: string;
    }>('SELECT seq, event_json FROM learning_events WHERE seq <= ? ORDER BY seq ASC LIMIT ?', through, DRIVE_MIRROR_PAGE_SIZE)
    .toArray();
  const events: SequencedLearnEvent[] = rows.map((row) => ({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent }));
  let cursor = events.at(-1)?.seq ?? 0;
  while (cursor < through) {
    const page = storage.sql
      .exec<{
        seq: number;
        event_json: string;
      }>(
        'SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?',
        cursor,
        through,
        DRIVE_MIRROR_PAGE_SIZE,
      )
      .toArray();
    if (page.length === 0) break;
    for (const row of page) events.push({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent });
    cursor = events.at(-1)!.seq;
  }
  return events;
}

export function readPage(storage: DurableObjectStorage, url: URL, isSnapshot: boolean): Response {
  const cursor = integerQuery(url, 'cursor', 0);
  const requestedThrough = integerQuery(url, 'through', -1);
  const limit = integerQuery(url, 'limit', MAX_PAGE_SIZE);
  if (cursor === null || requestedThrough === null || limit === null || limit < 1 || limit > MAX_PAGE_SIZE) {
    return json({ error: 'invalid_cursor_or_limit' }, 400);
  }

  const maxSeq = Number(storage.sql.exec<{ seq: number }>('SELECT COALESCE(MAX(seq), 0) AS seq FROM learning_events').one().seq);
  const through = requestedThrough === -1 ? maxSeq : requestedThrough;
  if (cursor > through || through > maxSeq) return json({ error: 'invalid_cursor_or_limit' }, 400);

  const rows = storage.sql
    .exec<{
      seq: number;
      event_json: string;
    }>('SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?', cursor, through, limit)
    .toArray();
  const events: StoredEvent[] = rows.map((row) => ({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent }));
  const nextCursor = events.length > 0 ? events[events.length - 1].seq : cursor;
  const response = {
    events,
    cursor: nextCursor,
    through,
    hasMore: nextCursor < through,
    ...(isSnapshot ? { snapshotCursor: through } : {}),
  };
  return json(response);
}
