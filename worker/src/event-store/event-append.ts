import { learnEventSchema, type LearnEvent } from '../../../shared/contracts/learn-event';
import { readBoundedBody } from '../body';
import { canonicalJson } from './canonical-json';
import { MAX_BODY_BYTES, MAX_BATCH_SIZE } from './limits';
import { json } from './response';

type AppendResult = { id: string; seq: number; duplicate: boolean };
class EventConflictError extends Error {}

export async function appendEvents(
  storage: DurableObjectStorage,
  request: Request,
  isLearningResetLocked: () => boolean,
  projectEvent: (seq: number, event: LearnEvent) => void,
  queueMirrors: (cursor: number) => Promise<void>,
): Promise<Response> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
  const body = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!body) return json({ error: 'payload_too_large' }, 413);
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!input || typeof input !== 'object' || !Array.isArray((input as { events?: unknown }).events)) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const supplied = (input as { events: unknown[] }).events;
  if (supplied.length < 1 || supplied.length > MAX_BATCH_SIZE) return json({ error: 'invalid_batch_size' }, 400);
  const events: LearnEvent[] = [];
  for (const item of supplied) {
    const parsed = learnEventSchema.safeParse(item);
    if (!parsed.success)
      return json({ error: 'invalid_event', issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })) }, 400);
    events.push(parsed.data);
  }

  const byId = new Map<string, string>();
  for (const event of events) {
    const payload = canonicalJson(event);
    const previous = byId.get(event.id);
    if (previous !== undefined && previous !== payload) return json({ error: 'event_id_conflict' }, 409);
    byId.set(event.id, payload);
  }

  let results: Map<string, AppendResult>;
  let resetInProgress = false;
  try {
    results = storage.transactionSync(() => {
      if (isLearningResetLocked()) {
        resetInProgress = true;
        return new Map<string, AppendResult>();
      }
      const rows = new Map<string, AppendResult>();
      for (const [id, payload] of byId) {
        const existing = storage.sql
          .exec<{ seq: number; event_json: string }>('SELECT seq, event_json FROM learning_events WHERE event_id = ?', id)
          .toArray()[0];
        if (existing) {
          if (existing.event_json !== payload) throw new EventConflictError();
          rows.set(id, { id, seq: Number(existing.seq), duplicate: true });
          continue;
        }
        const event = events.find((candidate) => candidate.id === id)!;
        storage.sql.exec('INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)', id, payload, event.ts);
        const seq = Number(storage.sql.exec<{ seq: number }>('SELECT last_insert_rowid() AS seq').one().seq);
        rows.set(id, { id, seq, duplicate: false });
        projectEvent(seq, event);
      }
      return rows;
    });
  } catch (error) {
    if (error instanceof EventConflictError) return json({ error: 'event_id_conflict' }, 409);
    throw error;
  }
  if (resetInProgress) return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });

  const seen = new Set<string>();
  const ordered = events.map((event) => {
    const result = results.get(event.id)!;
    if (seen.has(event.id)) return { ...result, duplicate: true };
    seen.add(event.id);
    return result;
  });
  const cursor = Math.max(0, ...ordered.map((item) => item.seq));
  await queueMirrors(cursor);
  return json({ events: ordered, cursor }, 200);
}
