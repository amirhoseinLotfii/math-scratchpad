import { DurableObject } from 'cloudflare:workers';
import { learnEventSchema, type LearnEvent } from '../../src/sync/events';
import { readBoundedBody } from './body';
import type { WorkerEnv } from './env';
import { DriveMirrorError, GoogleDriveClient, type DriveFileRef, type DriveMirrorErrorCode } from './google-drive';
import {
  buildProgressProjection,
  groupEventsByUtcMonth,
  formatTehran,
  mergeJsonlEventContent,
  serializeJsonlEvents,
  sha256Hex,
  type SequencedLearnEvent,
} from './drive-projection';

const MAX_BODY_BYTES = 250_000;
const MAX_BATCH_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const RATE_WINDOW_MS = 60_000;

type StoredEvent = { seq: number; event: LearnEvent };
type AppendResult = { id: string; seq: number; duplicate: boolean };
type DriveMirrorState = {
  status: 'pending' | 'syncing' | 'synced' | 'error';
  lastSeq: number;
  pendingCount: number;
  quarantinedCount?: number;
  lastSyncedAt?: string;
  lastError?: DriveMirrorErrorCode;
  folders?: { rootId: string; syncId: string; eventsId: string; stateId: string };
  files: Record<string, DriveFileRef>;
  fileHashes: Record<string, string>;
};
export type DriveMirrorStatus = {
  status: 'not_configured' | 'pending' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
  pendingCount: number;
  quarantinedCount: number | null;
  lastError: DriveMirrorErrorCode | null;
};

const DRIVE_STATE_KEY = 'drive-mirror-state-v1';
const DRIVE_DEBOUNCE_MS = 5_000;
const DRIVE_RETRY_MS = 60_000;
const DRIVE_MIRROR_PAGE_SIZE = 500;

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
  private driveClient: GoogleDriveClient | undefined;
  private driveSyncPromise: Promise<DriveMirrorStatus> | undefined;

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
      || (request.method === 'GET' && (url.pathname === '/sync' || url.pathname === '/snapshot' || url.pathname === '/drive/status'))
      || (request.method === 'POST' && url.pathname === '/drive/sync');
    if (!supported) return json({ error: 'not_found' }, 404);

    const rate = this.consumeRateLimit();
    if (rate) return rate;

    if (url.pathname === '/events') return this.append(request);
    if (url.pathname === '/drive/status') return json(await this.getDriveStatus());
    if (url.pathname === '/drive/sync') {
      const status = await this.syncDrive();
      const ok = status.status === 'synced' || (status.status === 'pending' && status.pendingCount === 0);
      return json({ drive: status }, ok ? 200 : status.status === 'not_configured' ? 503 : 502);
    }
    return this.readPage(url, url.pathname === '/snapshot');
  }

  /** Durable Object alarm retries the private Drive mirror after transient failures. */
  async alarm(): Promise<void> {
    if (!this.driveConfigured()) return;
    await this.syncDrive();
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
    await this.queueDriveMirror(cursor);
    return json({ events: ordered, cursor }, 200);
  }

  private driveConfigured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_DRIVE_CLIENT_SECRET && this.env.GOOGLE_DRIVE_REFRESH_TOKEN);
  }

  private async readDriveState(): Promise<DriveMirrorState> {
    const stored = await this.ctx.storage.get<DriveMirrorState>(DRIVE_STATE_KEY);
    return stored ?? { status: 'pending', lastSeq: 0, pendingCount: 0, quarantinedCount: undefined, files: {}, fileHashes: {} };
  }

  private async saveDriveState(state: DriveMirrorState): Promise<void> {
    await this.ctx.storage.put(DRIVE_STATE_KEY, state);
  }

  private async maxSequence(): Promise<number> {
    return Number(this.ctx.storage.sql.exec<{ seq: number }>(
      'SELECT COALESCE(MAX(seq), 0) AS seq FROM learning_events',
    ).one().seq);
  }

  private async getDriveStatus(): Promise<DriveMirrorStatus> {
    const maxSeq = await this.maxSequence();
    if (!this.driveConfigured()) {
      return { status: 'not_configured', lastSyncedAt: null, pendingCount: maxSeq, quarantinedCount: null, lastError: null };
    }
    const state = await this.readDriveState();
    return {
      status: state.status,
      lastSyncedAt: state.lastSyncedAt ?? null,
      pendingCount: Math.max(0, maxSeq - state.lastSeq),
      quarantinedCount: state.quarantinedCount ?? null,
      lastError: state.lastError ?? null,
    };
  }

  private async queueDriveMirror(cursor: number): Promise<void> {
    if (!this.driveConfigured()) return;
    const state = await this.readDriveState();
    if (cursor <= state.lastSeq) return;
    const maxSeq = await this.maxSequence();
    await this.saveDriveState({
      ...state,
      status: 'pending',
      pendingCount: Math.max(0, maxSeq - state.lastSeq),
      lastError: undefined,
    });
    await this.ctx.storage.setAlarm(Date.now() + DRIVE_DEBOUNCE_MS);
  }

  private async syncDrive(): Promise<DriveMirrorStatus> {
    if (!this.driveConfigured()) return this.getDriveStatus();
    if (this.driveSyncPromise) return this.driveSyncPromise;
    this.driveSyncPromise = this.performDriveSync().finally(() => { this.driveSyncPromise = undefined; });
    return this.driveSyncPromise;
  }

  private async performDriveSync(): Promise<DriveMirrorStatus> {
    const state = await this.readDriveState();
    const through = await this.maxSequence();
    if (through === state.lastSeq && state.status === 'synced') return this.getDriveStatus();
    await this.saveDriveState({ ...state, status: 'syncing', pendingCount: Math.max(0, through - state.lastSeq), lastError: undefined });

    try {
      this.driveClient ??= new GoogleDriveClient(this.env);
      const client = this.driveClient;
      const events = this.readEventsThrough(through);
      const mirrorableEvents = events.filter(item => typeof item.event.isTest === 'boolean');
      const quarantinedCount = events.length - mirrorableEvents.length;
      const newEvents = mirrorableEvents.filter(item => item.seq > state.lastSeq);
      let folders = state.folders;
      if (!folders) {
        const rootId = await client.ensureRootFolder('Math_Project');
        const syncId = await client.ensureFolder('03_Sync', rootId);
        const eventsId = await client.ensureFolder('events', syncId);
        const stateId = await client.ensureFolder('state', syncId);
        folders = { rootId, syncId, eventsId, stateId };
        state.folders = folders;
        await this.saveDriveState({ ...state, status: 'syncing', folders, pendingCount: Math.max(0, through - state.lastSeq) });
      }

      const months = groupEventsByUtcMonth(newEvents);
      for (const [month, monthEvents] of months) {
        const name = `events_${month}.jsonl`;
        const path = `events/${name}`;
        const content = serializeJsonlEvents(mirrorableEvents.filter(item => {
          const date = new Date(item.event.ts);
          return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` === month;
        }));
        const saved = await client.upsertTextFile({
          name,
          parentId: folders.eventsId,
          mimeType: 'application/x-ndjson',
          desiredContent: content,
          knownFile: state.files[path],
          mergeContent: mergeJsonlEventContent,
        });
        state.files[path] = { id: saved.id, etag: saved.etag };
        state.fileHashes[path] = await sha256Hex(saved.content);
        await this.saveDriveState({ ...state, status: 'syncing', pendingCount: Math.max(0, through - state.lastSeq) });
      }

      const progress = buildProgressProjection(events);
      const desiredProgress = `${JSON.stringify(progress, null, 2)}\n`;
      const progressFile = await client.upsertTextFile({
        name: 'progress.json',
        parentId: folders.stateId,
        mimeType: 'application/json',
        desiredContent: desiredProgress,
        knownFile: state.files['state/progress.json'],
        mergeContent: mergeProgressContent,
      });
      state.files['state/progress.json'] = { id: progressFile.id, etag: progressFile.etag };
      state.fileHashes['state/progress.json'] = await sha256Hex(progressFile.content);

      const latest = events.at(-1);
      const now = new Date();
      const tehranTime = formatTehran(now);
      const manifest = {
        schemaVersion: 1,
        lastSeq: latest?.seq ?? 0,
        lastEventId: latest?.event.id ?? null,
        lastSuccessAtUtc: now.toISOString(),
        lastSuccessAtTehran: tehranTime,
        quarantinedEventCount: quarantinedCount,
        files: Object.entries(state.fileHashes).sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })),
      };
      const manifestFile = await client.upsertTextFile({
        name: 'sync_manifest.json',
        parentId: folders.syncId,
        mimeType: 'application/json',
        desiredContent: `${JSON.stringify(manifest, null, 2)}\n`,
        knownFile: state.files['sync_manifest.json'],
        mergeContent: mergeManifestContent,
      });
      state.files['sync_manifest.json'] = { id: manifestFile.id, etag: manifestFile.etag };

      const currentMax = await this.maxSequence();
      const pendingCount = Math.max(0, currentMax - through);
      const finalState: DriveMirrorState = {
        ...state,
        status: pendingCount === 0 ? 'synced' : 'pending',
        lastSeq: through,
        pendingCount,
        quarantinedCount,
        lastSyncedAt: now.toISOString(),
        lastError: undefined,
      };
      await this.saveDriveState(finalState);
      if (pendingCount > 0) await this.ctx.storage.setAlarm(Date.now() + DRIVE_DEBOUNCE_MS);
      return {
        status: finalState.status,
        lastSyncedAt: finalState.lastSyncedAt ?? null,
        pendingCount: finalState.pendingCount,
        quarantinedCount: finalState.quarantinedCount ?? 0,
        lastError: null,
      };
    } catch (error) {
      const code = error instanceof DriveMirrorError ? error.code : error instanceof Error && error.message === 'event_id_conflict'
        ? 'etag_conflict' : 'network_error';
      const currentMax = await this.maxSequence();
      const failed: DriveMirrorState = {
        ...state,
        status: 'error',
        pendingCount: Math.max(0, currentMax - state.lastSeq),
        lastError: code,
      };
      await this.saveDriveState(failed);
      await this.ctx.storage.setAlarm(Date.now() + DRIVE_RETRY_MS);
      return {
        status: failed.status,
        lastSyncedAt: failed.lastSyncedAt ?? null,
        pendingCount: failed.pendingCount,
        lastError: failed.lastError ?? null,
      };
    }
  }

  private readEventsThrough(through: number): SequencedLearnEvent[] {
    const rows = this.ctx.storage.sql.exec<{ seq: number; event_json: string }>(
      'SELECT seq, event_json FROM learning_events WHERE seq <= ? ORDER BY seq ASC LIMIT ?',
      through, DRIVE_MIRROR_PAGE_SIZE,
    ).toArray();
    const events: SequencedLearnEvent[] = rows.map(row => ({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent }));
    let cursor = events.at(-1)?.seq ?? 0;
    while (cursor < through) {
      const page = this.ctx.storage.sql.exec<{ seq: number; event_json: string }>(
        'SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?',
        cursor, through, DRIVE_MIRROR_PAGE_SIZE,
      ).toArray();
      if (page.length === 0) break;
      for (const row of page) events.push({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent });
      cursor = events.at(-1)!.seq;
    }
    return events;
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

function mergeProgressContent(remote: string, desired: string): string {
  const previous = parseJsonContent(remote);
  const current = parseJsonContent(desired);
  if (Number(previous.lastSeq ?? 0) > Number(current.lastSeq ?? 0)) throw new DriveMirrorError('etag_conflict');
  return desired;
}

function mergeManifestContent(remote: string, desired: string): string {
  const previous = parseJsonContent(remote);
  const current = parseJsonContent(desired);
  if (Number(previous.lastSeq ?? 0) > Number(current.lastSeq ?? 0)) throw new DriveMirrorError('etag_conflict');
  return desired;
}

function parseJsonContent(content: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new DriveMirrorError('invalid_response');
  }
}
