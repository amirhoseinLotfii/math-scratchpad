import { DurableObject } from 'cloudflare:workers';
import { learnEventSchema, type LearnEvent } from '../../src/sync/events';
import { readBoundedBody } from './body';
import type { WorkerEnv } from './env';

const MAX_BODY_BYTES = 250_000;
const MAX_BATCH_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const RATE_WINDOW_MS = 60_000;

type StoredEvent = { seq: number; event: LearnEvent };
type AppendResult = { id: string; seq: number; duplicate: boolean };

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function integerQuery(url: URL, name: string, fallback: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** One owner-scoped, append-only SQLite event log. */
export class LearningEventStore extends DurableObject<WorkerEnv> {
  private readonly rateLimit: number;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.rateLimit = this.parseRateLimit(env.EVENT_RATE_LIMIT);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS learning_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL,
        event_ts TEXT NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rate_windows (
        window_start INTEGER PRIMARY KEY,
        request_count INTEGER NOT NULL
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const supported = (request.method === 'POST' && url.pathname === '/events')
      || (request.method === 'GET' && (url.pathname === '/sync' || url.pathname === '/snapshot'));
    if (!supported) return json({ error: 'not_found' }, 404);

    const rate = this.consumeRateLimit();
    if (rate) return rate;

    if (url.pathname === '/events') return this.append(request);
    return this.readPage(url, url.pathname === '/snapshot');
  }

  private parseRateLimit(raw: string | undefined): number {
    const value = Number(raw ?? 120);
    return Number.isInteger(value) && value > 0 && value <= 10_000 ? value : 120;
  }

  private consumeRateLimit(): Response | null {
    const now = Date.now();
    const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
    const count = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM rate_windows WHERE window_start < ?', windowStart - RATE_WINDOW_MS);
      this.ctx.storage.sql.exec(
        `INSERT INTO rate_windows (window_start, request_count) VALUES (?, 1)
         ON CONFLICT(window_start) DO UPDATE SET request_count = request_count + 1`,
        windowStart,
      );
      return Number(this.ctx.storage.sql.exec<{ request_count: number }>(
        'SELECT request_count FROM rate_windows WHERE window_start = ?', windowStart,
      ).one().request_count);
    });

    if (count <= this.rateLimit) return null;
    const retryAfter = Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1_000));
    return json({ error: 'rate_limited', retryAfterSeconds: retryAfter }, 429, { 'Retry-After': String(retryAfter) });
  }

  private async append(request: Request): Promise<Response> {
    const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
    const body = await readBoundedBody(request, MAX_BODY_BYTES);
    if (!body) return json({ error: 'payload_too_large' }, 413);
    let raw: string;
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch { return json({ error: 'invalid_json' }, 400); }

    let input: unknown;
    try { input = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!input || typeof input !== 'object' || !Array.isArray((input as { events?: unknown }).events)) {
      return json({ error: 'invalid_payload' }, 400);
    }

    const supplied = (input as { events: unknown[] }).events;
    if (supplied.length < 1 || supplied.length > MAX_BATCH_SIZE) return json({ error: 'invalid_batch_size' }, 400);
    const events: LearnEvent[] = [];
    for (const item of supplied) {
      const parsed = learnEventSchema.safeParse(item);
      if (!parsed.success) return json({ error: 'invalid_event', issues: parsed.error.issues.map(issue => ({ path: issue.path, code: issue.code })) }, 400);
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
    try {
      results = this.ctx.storage.transactionSync(() => {
        const rows = new Map<string, AppendResult>();
        for (const [id, payload] of byId) {
          const existing = this.ctx.storage.sql.exec<{ seq: number; event_json: string }>(
            'SELECT seq, event_json FROM learning_events WHERE event_id = ?', id,
          ).toArray()[0];
          if (existing) {
            if (existing.event_json !== payload) throw new EventConflictError();
            rows.set(id, { id, seq: Number(existing.seq), duplicate: true });
            continue;
          }
          const event = events.find(candidate => candidate.id === id)!;
          this.ctx.storage.sql.exec(
            'INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)',
            id, payload, event.ts,
          );
          const seq = Number(this.ctx.storage.sql.exec<{ seq: number }>('SELECT last_insert_rowid() AS seq').one().seq);
          rows.set(id, { id, seq, duplicate: false });
        }
        return rows;
      });
    } catch (error) {
      if (error instanceof EventConflictError) return json({ error: 'event_id_conflict' }, 409);
      throw error;
    }

    const seen = new Set<string>();
    const ordered = events.map(event => {
      const result = results.get(event.id)!;
      if (seen.has(event.id)) return { ...result, duplicate: true };
      seen.add(event.id);
      return result;
    });
    const cursor = Math.max(0, ...ordered.map(item => item.seq));
    return json({ events: ordered, cursor }, 200);
  }

  private readPage(url: URL, isSnapshot: boolean): Response {
    const cursor = integerQuery(url, 'cursor', 0);
    const requestedThrough = integerQuery(url, 'through', -1);
    const limit = integerQuery(url, 'limit', MAX_PAGE_SIZE);
    if (cursor === null || requestedThrough === null || limit === null || limit < 1 || limit > MAX_PAGE_SIZE) {
      return json({ error: 'invalid_cursor_or_limit' }, 400);
    }

    const maxSeq = Number(this.ctx.storage.sql.exec<{ seq: number }>(
      'SELECT COALESCE(MAX(seq), 0) AS seq FROM learning_events',
    ).one().seq);
    const through = requestedThrough === -1 ? maxSeq : requestedThrough;
    if (cursor > through || through > maxSeq) return json({ error: 'invalid_cursor_or_limit' }, 400);

    const rows = this.ctx.storage.sql.exec<{ seq: number; event_json: string }>(
      'SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?',
      cursor, through, limit,
    ).toArray();
    const events: StoredEvent[] = rows.map(row => ({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent }));
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
}

class EventConflictError extends Error {}
