import { DurableObject } from 'cloudflare:workers';
import { learnEventSchema, type LearnEvent } from '../../src/sync/events';
import { readBoundedBody } from './body';
import type { WorkerEnv } from './env';
import { DriveMirrorError, GoogleDriveClient, type DriveFileRef, type DriveMirrorErrorCode, type DriveFolderChild, type DriveSnapshotRef } from './google-drive';
import { snapshotName } from './immutable-snapshot';
import { MAX_ACTIVE_SESSIONS, SESSION_HASH_PATTERN, SESSION_TTL_MS } from './session';
import { LEARNING_RESET_EPOCH, LEARNING_RESET_EPOCH_HEADER } from '../../src/sync/learning-reset-epoch';
import {
  applyConceptEvent,
  applyDailyEvent,
  applySessionEvent,
  isAttemptLikeEvent,
  tehranDayKey,
  type ConceptProjection,
  type DailyProjection,
  type SessionProjection,
} from './notion-projection';
import {
  createNotionClient,
  notionDataSourcesFromEnv,
  notionErrorCode,
  NotionRequestQueue,
  syncNotionAppState,
  syncNotionEvent,
  type MistakeReviewState,
  type NotionClientPort,
  type NotionEventContext,
  type NotionErrorCode,
  type NotionMirrorStatus,
} from './notion-mirror';
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
const MAX_STATE_BODY_BYTES = 2_100_000;
const MAX_STATE_VALUE_BYTES = 1_000_000;
const MAX_BATCH_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const RATE_WINDOW_MS = 60_000;

type StoredEvent = { seq: number; event: LearnEvent };
type AppendResult = { id: string; seq: number; duplicate: boolean };
type DriveMirrorState = {
  status: 'pending' | 'syncing' | 'synced' | 'error';
  lastSeq: number;
  appStateRevision?: number;
  pendingCount: number;
  quarantinedCount?: number;
  lastSyncedAt?: string;
  lastError?: DriveMirrorErrorCode;
  folders?: { rootId: string; syncId: string; eventsId: string; stateId: string; backupsId?: string };
  weeklyBackup?: {
    status: 'scheduled' | 'created' | 'error';
    date?: string;
    snapshotCreatedAtUtc?: string;
    lastCreatedAt?: string;
    lastSeq?: number;
    lastError?: DriveMirrorErrorCode;
  };
  files: Record<string, DriveFileRef>;
  fileHashes: Record<string, string>;
  snapshots?: Record<string, DriveSnapshotRef>;
};
export type DriveMirrorStatus = {
  status: 'not_configured' | 'pending' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
  pendingCount: number;
  quarantinedCount: number | null;
  lastError: DriveMirrorErrorCode | null;
  /** Sanitized Drive client stage, only reported while the mirror is in error. */
  failureStage?: string | null;
  weeklyBackup: {
    status: 'not_configured' | 'scheduled' | 'created' | 'error';
    lastCreatedAt: string | null;
    lastError: DriveMirrorErrorCode | null;
  };
};

const DRIVE_STATE_KEY = 'drive-mirror-state-v1';
const DRIVE_DEBOUNCE_MS = 1_000;
const DRIVE_RETRY_MS = 60_000;
const WEEKLY_BACKUP_RETRY_MS = 60_000;
const DRIVE_MIRROR_PAGE_SIZE = 500;
const NOTION_PROJECTION_PAGE_SIZE = 1_000;
const NOTION_EVENTS_PER_RUN = 20;
const NOTION_STATE_KEYS_PER_RUN = 10;
const NOTION_DEBOUNCE_MS = 250;
const NOTION_RETRY_MS = 60_000;
const MAX_MIRROR_SUBREQUESTS = 40;
const NOTION_MIRROR_STATE_KEY = 'notion-mirror-state-v1';
const LEARNING_RESET_TABLE = 'learning_reset_control';
/**
 * Each trashed mirror costs two Drive subrequests (verify + batch trash). Keep one reset call
 * well under the Workers Free per-invocation subrequest cap (50) and resume on retry.
 */
const LEARNING_RESET_TRASH_PER_CALL = 12;

type StoredNotionMirrorState = {
  status: 'pending' | 'syncing' | 'synced' | 'error';
  lastSeq: number;
  pendingCount: number;
  quarantinedCount?: number;
  lastSyncedAt?: string;
  lastError?: NotionErrorCode;
};
type PendingNotionState = { key: string; revision: number };
type MirrorSubrequestBudget = { used: number; limit: number };

class MirrorSubrequestBudgetExceeded extends Error {
  readonly code = 'subrequest_budget_exceeded';
  constructor() { super('subrequest_budget_exceeded'); }
}

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

function isLearningMirrorFileName(name: string): boolean {
  return /^(?:events_\d{4}-\d{2}|progress|editor_state|sync_manifest|sync_backup_\d{4}-\d{2}-\d{2})(?:\.sha256-[a-f0-9]{64})?\.(?:jsonl|json)$/i.test(name);
}

export function mergeWeeklyBackupContent(remote: string, desired: string): string {
  let current: unknown, next: unknown;
  try { current = JSON.parse(remote); next = JSON.parse(desired); }
  catch { throw new Error('event_id_conflict'); }
  if (!current || typeof current !== 'object' || !next || typeof next !== 'object'
    || (current as { format?: unknown }).format !== 'math-scratchpad-weekly-backup/v1'
    || (next as { format?: unknown }).format !== 'math-scratchpad-weekly-backup/v1'
    || !Array.isArray((current as { events?: unknown }).events) || !Array.isArray((next as { events?: unknown }).events)) {
    throw new Error('event_id_conflict');
  }
  const latestEvents = (next as { events: Array<{ seq: number; event: LearnEvent }> }).events
    .filter(item => typeof item.event?.isTest === 'boolean');
  const previousMirrorableEvents = (current as { events: Array<{ seq: number; event: LearnEvent }> }).events
    .filter(item => typeof item.event?.isTest === 'boolean');
  const latest = new Map(latestEvents.map(item => [item.event.id, canonicalJson(item)]));
  for (const item of previousMirrorableEvents) {
    if (!latest.has(item.event.id) || latest.get(item.event.id) !== canonicalJson(item)) {
      throw new Error('event_id_conflict');
    }
  }
  return desired;
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
  private bankClient: GoogleDriveClient | undefined;
  private driveSyncPromise: Promise<DriveMirrorStatus> | undefined;
  private weeklyBackupPromise: Promise<DriveMirrorStatus['weeklyBackup']> | undefined;
  private driveOperationQueue: Promise<void> = Promise.resolve();
  private notionClient: NotionClientPort | undefined;
  private notionSyncPromise: Promise<NotionMirrorStatus> | undefined;
  private readonly notionRequests = new NotionRequestQueue();
  private activeMirrorSubrequestBudget?: MirrorSubrequestBudget;
  private readonly budgetedFetch: typeof fetch = (input, init) => {
    const budget = this.activeMirrorSubrequestBudget;
    if (budget) {
      if (budget.used >= budget.limit) throw new MirrorSubrequestBudgetExceeded();
      budget.used += 1;
    }
    return globalThis.fetch(input, init);
  };
  private activeLearningMutations = 0;
  /** Reset id currently executing in this isolate; a takeover must never race a live run. */
  private activeLearningResetId: string | undefined;
  private readonly learningMutationWaiters = new Set<() => void>();

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.rateLimit = this.parseRateLimit(env.EVENT_RATE_LIMIT);
    // Queryable operational mirror status: unlike internal Durable Object KV,
    // this can be inspected through the authenticated Cloudflare SQL console.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sync_health (destination TEXT PRIMARY KEY, status TEXT NOT NULL, pending_count INTEGER NOT NULL, last_error TEXT, last_synced_at TEXT, updated_at TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS mirror_diagnostics (destination TEXT PRIMARY KEY, failure_stage TEXT NOT NULL, error_code TEXT NOT NULL, updated_at TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS mirror_configuration (destination TEXT PRIMARY KEY, configured INTEGER NOT NULL, updated_at TEXT NOT NULL)');
    const configuration = [
      ['drive', Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN)],
      ['notion', Boolean(notionDataSourcesFromEnv(env))],
    ] as const;
    for (const [destination, configured] of configuration) {
      ctx.storage.sql.exec(
        'INSERT INTO mirror_configuration(destination,configured,updated_at) VALUES(?,?,?) ON CONFLICT(destination) DO UPDATE SET configured=excluded.configured,updated_at=excluded.updated_at',
        destination, configured ? 1 : 0, new Date().toISOString(),
      );
    }

    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS app_state_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision INTEGER NOT NULL)');
    ctx.storage.sql.exec('INSERT OR IGNORE INTO app_state_meta (singleton, revision) VALUES (1, 0)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notion_projections (projection_type TEXT NOT NULL, projection_key TEXT NOT NULL, projection_json TEXT NOT NULL, PRIMARY KEY (projection_type, projection_key))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notion_projection_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), last_seq INTEGER NOT NULL)');
    ctx.storage.sql.exec('INSERT OR IGNORE INTO notion_projection_meta (singleton, last_seq) VALUES (1, 0)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notion_page_refs (kind TEXT NOT NULL, external_key TEXT NOT NULL, page_id TEXT NOT NULL, PRIMARY KEY (kind, external_key))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notion_state_queue (key TEXT PRIMARY KEY, revision INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notion_mistake_reviews (item_key TEXT PRIMARY KEY, event_id TEXT NOT NULL, review_successes INTEGER NOT NULL, last_review_event_id TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notion_session_mistakes (session_id TEXT NOT NULL, page_id TEXT NOT NULL, PRIMARY KEY (session_id, page_id))');
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS learning_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL,
        event_ts TEXT NOT NULL
      )
    `);
    // Worker sessions: only SHA-256 digests of the bearer values are stored.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, sub TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER)');
    // The question-bank file the owner picked once with Google Picker (drive.file grant for this OAuth app).
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS bank_source (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), file_id TEXT NOT NULL, file_name TEXT NOT NULL, registered_at TEXT NOT NULL)');
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rate_windows (
        window_start INTEGER PRIMARY KEY,
        request_count INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ${LEARNING_RESET_TABLE} (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        status TEXT NOT NULL,
        reset_id TEXT,
        completed_at TEXT,
        client_epoch TEXT
      )
    `);
    const resetColumns = ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${LEARNING_RESET_TABLE})`).toArray();
    if (!resetColumns.some(column => column.name === 'client_epoch')) {
      ctx.storage.sql.exec(`ALTER TABLE ${LEARNING_RESET_TABLE} ADD COLUMN client_epoch TEXT`);
    }
    ctx.storage.sql.exec(`INSERT OR IGNORE INTO ${LEARNING_RESET_TABLE} (singleton, status, reset_id) VALUES (1, 'idle', NULL)`);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/internal/learning-reset') return this.executeLearningReset(request);
    if (request.method === 'POST' && url.pathname === '/internal/learning-reset/release') return this.releaseLearningReset(request);
    if (request.method === 'GET' && url.pathname === '/internal/learning-reset/status') return this.learningResetStatus();
    if (request.method === 'GET' && url.pathname === '/internal/learning-reset/epoch') return this.learningResetEpoch();
    if (this.isLearningResetLocked() && this.isLearningOrMirrorRoute(url.pathname, request.method)) {
      return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });
    }
    if (request.method === 'POST' && ['/events', '/state'].includes(url.pathname)) {
      const requiredEpoch = this.requiredLearningClientEpoch();
      if (requiredEpoch && request.headers.get(LEARNING_RESET_EPOCH_HEADER) !== requiredEpoch) {
        return json({ error: 'client_update_required', requiredEpoch }, 426);
      }
    }
    if (request.method === 'POST' && url.pathname.startsWith('/internal/session/')) return this.handleSession(url.pathname, request);
    if ((request.method === 'GET' && (url.pathname === '/bank/meta' || url.pathname === '/bank/content'))
      || (request.method === 'POST' && url.pathname === '/bank/source')) {
      const rate = this.consumeRateLimit();
      if (rate) return rate;
      if (url.pathname === '/bank/source') return this.registerBankSource(request);
      return this.readBank(url.pathname === '/bank/content');
    }
    const supported = (request.method === 'POST' && url.pathname === '/events')
      || (request.method === 'GET' && (url.pathname === '/sync' || url.pathname === '/snapshot' || url.pathname === '/drive/status' || url.pathname === '/notion/status' || url.pathname === '/state' || url.pathname === '/reset/preview'))
      || (request.method === 'POST' && (url.pathname === '/drive/sync' || url.pathname === '/notion/sync' || url.pathname === '/internal/weekly-backup' || url.pathname === '/state' || url.pathname === '/internal/sync-all'));
    if (!supported) return json({ error: 'not_found' }, 404);

    if (url.pathname === '/internal/weekly-backup') {
      const scheduledTime = Number(url.searchParams.get('scheduledTime'));
      const now = Number.isSafeInteger(scheduledTime) && scheduledTime > 0 ? new Date(scheduledTime) : new Date();
      const result = await this.withMirrorSubrequestBudget(() => this.syncWeeklyBackup(now));
      return json({ weeklyBackup: result.value, subrequestsUsed: result.used, subrequestLimit: result.limit });
    }

    if (url.pathname === '/internal/sync-all') {
      const result = await this.withMirrorSubrequestBudget(async () => {
        const [driveResult, notionResult] = await Promise.allSettled([this.syncDrive(), this.syncNotion()]);
        const drive = driveResult.status === 'fulfilled' ? driveResult.value : {
          status: 'error' as const, lastSyncedAt: null, pendingCount: 0, quarantinedCount: null,
          lastError: 'network_error' as const, failureStage: 'sync_all',
          weeklyBackup: { status: 'scheduled' as const, lastCreatedAt: null, lastError: null },
        };
        const notion = notionResult.status === 'fulfilled' ? notionResult.value : {
          status: 'error' as const, lastSyncedAt: null, pendingCount: 0, quarantinedCount: null,
          lastError: 'network_error' as const,
        };
        if (driveResult.status === 'rejected') this.recordDiagnostic('drive', 'sync_all', 'network_error');
        if (notionResult.status === 'rejected') this.recordDiagnostic('notion', 'sync_all', 'network_error');
        return { drive, notion };
      });
      return json({ ...result.value, subrequestsUsed: result.used, subrequestLimit: result.limit });
    }
    const rate = this.consumeRateLimit();
    if (rate) return rate;

    if (url.pathname === '/reset/preview') return this.resetPreview(url);
    if (url.pathname === '/state') return request.method === 'GET' ? this.readAppState()
      : this.trackLearningMutation(() => this.writeAppState(request));
    if (url.pathname === '/events') return this.trackLearningMutation(() => this.append(request));
    if (url.pathname === '/drive/status') return json(await this.getDriveStatus());
    if (url.pathname === '/notion/status') return json(await this.getNotionStatus());
    if (url.pathname === '/drive/sync') {
      const status = await this.syncDrive();
      const ok = status.status === 'synced' || (status.status === 'pending' && status.pendingCount === 0);
      return json({ drive: status }, ok ? 200 : status.status === 'not_configured' ? 503 : 502);
    }
    if (url.pathname === '/notion/sync') {
      const status = await this.syncNotion();
      return json({ notion: status }, status.status === 'synced' ? 200 : status.status === 'not_configured' ? 503 : status.status === 'pending' ? 202 : 502);
    }
    return this.readPage(url, url.pathname === '/snapshot');
  }

  private isLearningResetLocked(): boolean {
    const status = this.ctx.storage.sql.exec<{ status: string }>(
      `SELECT status FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`,
    ).toArray()[0]?.status;
    return status === 'running' || status === 'awaiting_release';
  }

  private requiredLearningClientEpoch(): string | null {
    return this.ctx.storage.sql.exec<{ client_epoch: string | null }>(
      `SELECT client_epoch FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`,
    ).toArray()[0]?.client_epoch ?? null;
  }

  private learningResetEpoch(): Response {
    if (this.isLearningResetLocked()) return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });
    return json({ epoch: this.requiredLearningClientEpoch() ?? LEARNING_RESET_EPOCH });
  }

  private isLearningOrMirrorRoute(pathname: string, method: string): boolean {
    if (pathname.startsWith('/internal/session/') || pathname.startsWith('/bank/')) return false;
    if (method === 'GET' && ['/reset/preview', '/state', '/sync', '/snapshot', '/drive/status', '/notion/status'].includes(pathname)) return false;
    return true;
  }

  private async trackLearningMutation(operation: () => Promise<Response>): Promise<Response> {
    this.activeLearningMutations += 1;
    try { return await operation(); }
    finally {
      this.activeLearningMutations -= 1;
      if (this.activeLearningMutations === 0) {
        for (const resolve of this.learningMutationWaiters) resolve();
        this.learningMutationWaiters.clear();
      }
    }
  }

  private async waitForLearningMutations(): Promise<void> {
    if (this.activeLearningMutations === 0) return;
    await new Promise<void>(resolve => this.learningMutationWaiters.add(resolve));
  }

  /** Retryable coordinated reset. The public entry point requires a temporary Worker secret. */
  private async executeLearningReset(request: Request): Promise<Response> {
    const body = await readBoundedBody(request, 4_096);
    if (!body) return json({ error: 'payload_too_large' }, 413);
    let input: { resetId?: unknown; takeover?: unknown };
    try { input = JSON.parse(new TextDecoder().decode(body)) ?? {}; }
    catch { return json({ error: 'invalid_reset_request' }, 400); }
    if (typeof input.resetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.resetId)) {
      return json({ error: 'invalid_reset_request' }, 400);
    }
    const resetId = input.resetId;
    const takeover = input.takeover === true;
    if (takeover && this.activeLearningResetId && this.activeLearningResetId !== resetId) {
      return json({ error: 'learning_reset_active' }, 409);
    }
    const claim = this.ctx.storage.transactionSync(() => {
      const current = this.ctx.storage.sql.exec<{ status: string; reset_id: string | null }>(
        `SELECT status, reset_id FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`,
      ).one();
      // An explicit admin takeover lets a new reset id claim a lock orphaned by a lost reset id.
      const orphanTakeover = takeover && current.reset_id !== resetId;
      if (current.status === 'running' && current.reset_id !== resetId && !orphanTakeover) return 'in_progress';
      if (current.status === 'awaiting_release' && !orphanTakeover) return current.reset_id === resetId ? 'awaiting_release' : 'in_progress';
      if (current.status === 'released' && current.reset_id === resetId) return 'complete';
      this.ctx.storage.sql.exec(
        `UPDATE ${LEARNING_RESET_TABLE} SET status = 'running', reset_id = ?, completed_at = NULL, client_epoch = NULL WHERE singleton = 1`,
        resetId,
      );
      return 'claimed';
    });
    if (claim === 'in_progress') return json({ error: 'learning_reset_in_progress' }, 409);
    if (claim === 'awaiting_release') return json({ completed: true, releaseRequired: true });
    if (claim === 'complete') return json({ error: 'learning_reset_already_complete' }, 409);

    this.activeLearningResetId = resetId;
    try {
      await this.waitForLearningMutations();
      await Promise.allSettled([
        this.driveSyncPromise,
        this.weeklyBackupPromise,
        this.notionSyncPromise,
        this.driveOperationQueue,
      ]);
      await this.ctx.storage.deleteAlarm();

      const bankFileId = this.ctx.storage.sql.exec<{ file_id: string }>(
        'SELECT file_id FROM bank_source WHERE singleton = 1',
      ).toArray()[0]?.file_id;
      const driveResult = await this.trashLearningMirrorFiles(bankFileId);
      if (driveResult.remainingLearningMirrors) {
        // Partial Drive progress: keep the lock and every cloud record until a later retry finishes Drive.
        return json({ completed: false, inProgress: true, drive: driveResult, retryWithSameResetId: true }, 202);
      }
      const cloudResult = this.clearLearningRecords();
      await this.ctx.storage.delete(DRIVE_STATE_KEY);
      await this.ctx.storage.delete(NOTION_MIRROR_STATE_KEY);
      await this.ctx.storage.deleteAlarm();
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          `UPDATE ${LEARNING_RESET_TABLE} SET status = 'awaiting_release', completed_at = ? WHERE singleton = 1 AND reset_id = ?`,
          new Date().toISOString(), resetId,
        );
      });
      return json({
        completed: true,
        releaseRequired: true,
        drive: driveResult,
        cloud: cloudResult,
        preserved: { bankSourceRecords: cloudResult.bankSourceRecords, activeAuthSessions: cloudResult.activeAuthSessions },
      });
    } catch (error) {
      const code = error instanceof DriveMirrorError ? error.code : 'reset_failed';
      const failureStage = this.driveClient?.diagnosticStage ?? 'worker_internal';
      const safeStage = `drive_reset:${failureStage}`.slice(0, 64);
      this.recordDiagnostic('drive', safeStage, code);
      return json({ error: 'learning_reset_incomplete', code, failureStage: safeStage, retryWithSameResetId: true }, 502);
    } finally {
      if (this.activeLearningResetId === resetId) this.activeLearningResetId = undefined;
    }
  }

  /** Read-only lock state for the admin; never returns the reset id itself. */
  private learningResetStatus(): Response {
    const current = this.ctx.storage.sql.exec<{ status: string; reset_id: string | null; completed_at: string | null }>(
      `SELECT status, reset_id, completed_at FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`,
    ).one();
    return json({
      status: current.status,
      hasResetId: current.reset_id !== null,
      completedAt: current.completed_at,
      activeInThisInstance: this.activeLearningResetId !== undefined,
    });
  }

  private async releaseLearningReset(request: Request): Promise<Response> {
    const body = await readBoundedBody(request, 4_096);
    if (!body) return json({ error: 'payload_too_large' }, 413);
    let input: { resetId?: unknown };
    try { input = JSON.parse(new TextDecoder().decode(body)) ?? {}; }
    catch { return json({ error: 'invalid_reset_request' }, 400); }
    if (typeof input.resetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.resetId)) {
      return json({ error: 'invalid_reset_request' }, 400);
    }
    const status = this.ctx.storage.transactionSync(() => {
      const current = this.ctx.storage.sql.exec<{ status: string; reset_id: string | null; client_epoch: string | null }>(
        `SELECT status, reset_id, client_epoch FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`,
      ).one();
      if (current.status === 'released' && current.reset_id === input.resetId) {
        if (!current.client_epoch) {
          this.ctx.storage.sql.exec(
            `UPDATE ${LEARNING_RESET_TABLE} SET client_epoch = ? WHERE singleton = 1 AND reset_id = ?`,
            crypto.randomUUID(), input.resetId,
          );
        }
        return 'released';
      }
      if (current.status !== 'awaiting_release' || current.reset_id !== input.resetId) return 'not_ready';
      const clientEpoch = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        `UPDATE ${LEARNING_RESET_TABLE} SET status = 'released', client_epoch = ? WHERE singleton = 1 AND reset_id = ?`,
        clientEpoch, input.resetId,
      );
      return 'released';
    });
    if (status !== 'released') return json({ error: 'learning_reset_not_ready' }, 409);
    return json({ released: true });
  }

  private async trashLearningMirrorFiles(bankFileId?: string): Promise<{
    movedToTrash: number;
    inspectedFiles: number;
    preservedFiles: number;
    protectedBankFileSkipped: boolean;
    foldersFound: number;
    remainingLearningMirrors?: boolean;
  }> {
    const state = await this.readDriveState();
    const stored = state.folders;
    if (!this.driveConfigured()) {
      if (stored) throw new DriveMirrorError('not_configured');
      return { movedToTrash: 0, inspectedFiles: 0, preservedFiles: 0, protectedBankFileSkipped: false, foldersFound: 0 };
    }

    this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch);
    const client = this.driveClient;
    const rootName = this.env.GOOGLE_DRIVE_ROOT_FOLDER_NAME?.trim() || 'Math_Project';
    const rootId = stored?.rootId ?? this.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? await client.findFolderId(rootName, 'root');
    if (!rootId) return { movedToTrash: 0, inspectedFiles: 0, preservedFiles: 0, protectedBankFileSkipped: false, foldersFound: 0 };
    const root = await client.readFileMetadata(rootId, 'id,name,mimeType,parents,trashed');
    if (root.id !== rootId || root.name !== rootName || root.mimeType !== 'application/vnd.google-apps.folder' || root.trashed === true) {
      throw new DriveMirrorError('invalid_response');
    }

    const syncId = stored?.syncId ?? await client.findFolderId('03_Sync', rootId);
    if (!syncId) return { movedToTrash: 0, inspectedFiles: 0, preservedFiles: 0, protectedBankFileSkipped: false, foldersFound: 1 };
    await this.assertDriveFolder(client, syncId, '03_Sync', rootId);

    const targetFolders: Array<{ id: string; parentId: string; name: string }> = [{ id: syncId, parentId: rootId, name: '03_Sync' }];
    for (const name of ['events', 'state'] as const) {
      const storedId = stored?.[name === 'events' ? 'eventsId' : 'stateId'];
      const id = storedId ?? await client.findFolderId(name, syncId);
      if (id) {
        await this.assertDriveFolder(client, id, name, syncId);
        targetFolders.push({ id, parentId: syncId, name });
      }
    }
    const backupsId = stored?.backupsId ?? await client.findFolderId('06_Backups', rootId);
    if (backupsId) {
      await this.assertDriveFolder(client, backupsId, '06_Backups', rootId);
      targetFolders.push({ id: backupsId, parentId: rootId, name: '06_Backups' });
    }

    let movedToTrash = 0;
    let inspectedFiles = 0;
    let preservedFiles = 0;
    let protectedBankFileSkipped = false;
    let trashAttempts = 0;
    for (const folder of targetFolders) {
      const children: DriveFolderChild[] = await client.listFilesInFolder(folder.id);
      for (const child of children) {
        if (child.mimeType === 'application/vnd.google-apps.folder') continue;
        inspectedFiles += 1;
        if (child.id === bankFileId) {
          protectedBankFileSkipped = true;
          preservedFiles += 1;
          continue;
        }
        if (!isLearningMirrorFileName(child.name)) {
          preservedFiles += 1;
          continue;
        }
        if (trashAttempts >= LEARNING_RESET_TRASH_PER_CALL) {
          return { movedToTrash, inspectedFiles, preservedFiles, protectedBankFileSkipped, foldersFound: targetFolders.length + 1, remainingLearningMirrors: true };
        }
        trashAttempts += 1;
        if (await client.trashFileInFolder(child.id, folder.id)) movedToTrash += 1;
      }
    }
    return { movedToTrash, inspectedFiles, preservedFiles, protectedBankFileSkipped, foldersFound: targetFolders.length + 1 };
  }

  private async assertDriveFolder(client: GoogleDriveClient, id: string, name: string, parentId: string): Promise<void> {
    const metadata = await client.readFileMetadata(id, 'id,name,mimeType,parents,trashed');
    if (metadata.id !== id || metadata.name !== name || metadata.mimeType !== 'application/vnd.google-apps.folder'
      || metadata.trashed === true || !Array.isArray(metadata.parents) || !metadata.parents.includes(parentId)) {
      throw new DriveMirrorError('invalid_response');
    }
  }

  private clearLearningRecords(): {
    deletedLearningEvents: number;
    deletedAppStateRecords: number;
    deletedNotionProjectionRecords: number;
    deletedNotionReferences: number;
    deletedQueuedMirrorRecords: number;
    bankSourceRecords: number;
    activeAuthSessions: number;
    preservedIdentityAndDriveConfigRecords: number;
  } {
    return this.ctx.storage.transactionSync(() => {
      const count = (sql: string, ...args: Array<string | number>) => Number(this.ctx.storage.sql.exec<{ count: number }>(sql, ...args).one().count);
      const summary = {
        deletedLearningEvents: count('SELECT COUNT(*) AS count FROM learning_events'),
        deletedAppStateRecords: count("SELECT COUNT(*) AS count FROM app_state WHERE key NOT IN ('math-scratchpad-device-id-v1','math-scratchpad-drive-config-v1')"),
        deletedNotionProjectionRecords: count('SELECT COUNT(*) AS count FROM notion_projections'),
        deletedNotionReferences: count('SELECT COUNT(*) AS count FROM notion_page_refs'),
        deletedQueuedMirrorRecords: count('SELECT COUNT(*) AS count FROM notion_state_queue')
          + count('SELECT COUNT(*) AS count FROM notion_mistake_reviews')
          + count('SELECT COUNT(*) AS count FROM notion_session_mistakes'),
        bankSourceRecords: count('SELECT COUNT(*) AS count FROM bank_source'),
        activeAuthSessions: count('SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?', Date.now()),
        preservedIdentityAndDriveConfigRecords: count("SELECT COUNT(*) AS count FROM app_state WHERE key IN ('math-scratchpad-device-id-v1','math-scratchpad-drive-config-v1')"),
      };
      this.ctx.storage.sql.exec('DELETE FROM learning_events');
      this.ctx.storage.sql.exec("DELETE FROM app_state WHERE key NOT IN ('math-scratchpad-device-id-v1','math-scratchpad-drive-config-v1')");
      this.ctx.storage.sql.exec('UPDATE app_state_meta SET revision = 0 WHERE singleton = 1');
      this.ctx.storage.sql.exec('DELETE FROM notion_projections');
      this.ctx.storage.sql.exec('UPDATE notion_projection_meta SET last_seq = 0 WHERE singleton = 1');
      this.ctx.storage.sql.exec('DELETE FROM notion_page_refs');
      this.ctx.storage.sql.exec('DELETE FROM notion_state_queue');
      this.ctx.storage.sql.exec('DELETE FROM notion_mistake_reviews');
      this.ctx.storage.sql.exec('DELETE FROM notion_session_mistakes');
      this.ctx.storage.sql.exec('DELETE FROM sync_health');
      this.ctx.storage.sql.exec('DELETE FROM mirror_diagnostics');
      this.ctx.storage.sql.exec('DELETE FROM rate_windows');
      this.ctx.storage.sql.exec("DELETE FROM sqlite_sequence WHERE name = 'learning_events'");
      return summary;
    });
  }


  /** Internal session bookkeeping; reachable only through the Worker's stub, never from the public router. */
  private async handleSession(pathname: string, request: Request): Promise<Response> {
    const body = await readBoundedBody(request, 4_096);
    if (!body) return json({ error: 'payload_too_large' }, 413);
    let input: { tokenHash?: unknown; email?: unknown; sub?: unknown; all?: unknown };
    try { input = JSON.parse(new TextDecoder().decode(body)) ?? {}; }
    catch { return json({ error: 'invalid_session_request' }, 400); }
    const now = Date.now();
    const tokenHash = typeof input.tokenHash === 'string' && SESSION_HASH_PATTERN.test(input.tokenHash) ? input.tokenHash : undefined;

    if (pathname === '/internal/session/issue') {
      const rate = this.consumeRateLimit();
      if (rate) return rate;
      if (!tokenHash || typeof input.email !== 'string' || !input.email || input.email.length > 320
        || typeof input.sub !== 'string' || !input.sub || input.sub.length > 255) {
        return json({ error: 'invalid_session_request' }, 400);
      }
      const expiresAt = now + SESSION_TTL_MS;
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec('DELETE FROM auth_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)', now, now - SESSION_TTL_MS);
        this.ctx.storage.sql.exec(
          'INSERT INTO auth_sessions (token_hash, email, sub, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)',
          tokenHash, input.email, input.sub, now, expiresAt,
        );
        this.ctx.storage.sql.exec(
          `UPDATE auth_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND token_hash NOT IN (
             SELECT token_hash FROM auth_sessions WHERE revoked_at IS NULL ORDER BY created_at DESC, token_hash LIMIT ?)`,
          now, MAX_ACTIVE_SESSIONS,
        );
      });
      return json({ expiresAt }, 201);
    }

    if (pathname === '/internal/session/verify') {
      if (!tokenHash) return json({ error: 'session_invalid' }, 401);
      const row = this.ctx.storage.sql.exec<{ email: string; sub: string; expires_at: number; revoked_at: number | null }>(
        'SELECT email, sub, expires_at, revoked_at FROM auth_sessions WHERE token_hash = ?', tokenHash,
      ).toArray()[0];
      if (!row || row.revoked_at !== null || Number(row.expires_at) <= now) return json({ error: 'session_invalid' }, 401);
      return json({ email: row.email, sub: row.sub, expiresAt: Number(row.expires_at) });
    }

    if (pathname === '/internal/session/revoke') {
      const rate = this.consumeRateLimit();
      if (rate) return rate;
      if (input.all === true) {
        const revoked = this.ctx.storage.sql.exec('UPDATE auth_sessions SET revoked_at = ? WHERE revoked_at IS NULL', now).rowsWritten;
        return json({ revoked });
      }
      if (!tokenHash) return json({ error: 'invalid_session_request' }, 400);
      const revoked = this.ctx.storage.sql.exec('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', now, tokenHash).rowsWritten;
      return json({ revoked });
    }
    return json({ error: 'not_found' }, 404);
  }

  /** Separate from the mirror client so bank reads never overwrite mirror diagnostics. */
  private bankDriveClient(): GoogleDriveClient {
    this.bankClient ??= new GoogleDriveClient(this.env, this.budgetedFetch);
    return this.bankClient;
  }

  private bankErrorResponse(error: unknown): Response {
    if (error instanceof BankTooLargeError) return json({ error: 'bank_too_large' }, 413);
    if (error instanceof BankFileTypeError) return json({ error: error.message }, 422);
    const code = error instanceof DriveMirrorError ? error.code : 'internal_error';
    if (code === 'not_configured') return json({ error: 'drive_not_configured' }, 503);
    if (code === 'permission_denied') return json({ error: 'bank_not_accessible' }, 403);
    if (code === 'reauthorization_required' || code === 'account_mismatch') return json({ error: 'drive_reauthorization_required', code }, 502);
    if (code === 'quota_exceeded') return json({ error: 'drive_rate_limited' }, 429);
    return json({ error: 'drive_unavailable', code }, 502);
  }

  /** Register the picked bank file after confirming the server Drive credential can read it. */
  private async registerBankSource(request: Request): Promise<Response> {
    const body = await readBoundedBody(request, 4_096);
    if (!body) return json({ error: 'payload_too_large' }, 413);
    let input: { fileId?: unknown; fileName?: unknown };
    try { input = JSON.parse(new TextDecoder().decode(body)) ?? {}; }
    catch { return json({ error: 'invalid_bank_source' }, 400); }
    if (typeof input.fileId !== 'string' || !isValidDriveFileId(input.fileId)
      || (input.fileName !== undefined && (typeof input.fileName !== 'string' || input.fileName.length > 255))) {
      return json({ error: 'invalid_bank_source' }, 400);
    }
    const client = this.bankDriveClient();
    if (!client.isConfigured) return json({ error: 'drive_not_configured' }, 503);
    let meta: BankFileMeta;
    try { meta = await readBankMetadata(client, input.fileId); }
    catch (error) { return this.bankErrorResponse(error); }
    const fileName = typeof input.fileName === 'string' && input.fileName ? input.fileName : meta.name;
    this.ctx.storage.sql.exec(
      'INSERT INTO bank_source (singleton, file_id, file_name, registered_at) VALUES (1, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET file_id=excluded.file_id, file_name=excluded.file_name, registered_at=excluded.registered_at',
      input.fileId, fileName, new Date().toISOString(),
    );
    return json({ fileId: input.fileId, fileName, meta });
  }

  /** Read only the registered bank file, with the Worker's own Drive credential. */
  private async readBank(includeContent: boolean): Promise<Response> {
    const source = this.ctx.storage.sql.exec<{ file_id: string; file_name: string }>(
      'SELECT file_id, file_name FROM bank_source WHERE singleton = 1',
    ).toArray()[0];
    if (!source) return json({ error: 'bank_source_not_registered' }, 404);
    const client = this.bankDriveClient();
    if (!client.isConfigured) return json({ error: 'drive_not_configured' }, 503);
    try {
      const meta = await readBankMetadata(client, source.file_id);
      if (!includeContent) return json({ fileId: source.file_id, fileName: source.file_name, meta });
      const text = await client.readTextContent(source.file_id);
      if (new TextEncoder().encode(text).byteLength > MAX_BANK_BYTES) return json({ error: 'bank_too_large' }, 413);
      return json({ fileId: source.file_id, fileName: source.file_name, meta, text });
    } catch (error) {
      return this.bankErrorResponse(error);
    }
  }

  /** Read-only, owner-authenticated preflight. Never deletes or mutates learning data. */
  private resetPreview(url: URL): Response {
    const scope = url.searchParams.get('scope');
    if (scope !== 'all' && scope !== 'session' && scope !== 'lesson' && scope !== 'section' && scope !== 'chapter') {
      return json({ error: 'invalid_reset_scope' }, 400);
    }
    const requested = ['bankVersion', 'session', 'lesson', 'section', 'chapter'] as const;
    const values = Object.fromEntries(requested.map(name => [name, url.searchParams.get(name)])) as Record<typeof requested[number], string | null>;
    if (requested.some(name => values[name] !== null && (!values[name]?.trim() || values[name]!.length > 120 || /[\x00-\x1f]/.test(values[name]!)))) {
      return json({ error: 'invalid_reset_scope' }, 400);
    }
    // Chapter uses the numeric chapter field of an event. Reject ambiguous or invalid IDs.
    if (['chapter', 'lesson', 'section'].includes(scope) && !/^[1-9][0-9]{0,5}$/.test(values.chapter ?? '')) {
      return json({ error: 'invalid_reset_chapter' }, 400);
    }
    const required = scope === 'section' ? ['bankVersion', 'chapter', 'lesson', 'section']
      : scope === 'lesson' ? ['bankVersion', 'chapter', 'lesson']
      : scope === 'chapter' ? ['bankVersion', 'chapter']
      : scope === 'session' ? ['session'] : [];
    if (requested.some(name => values[name] !== null && !required.includes(name))) return json({ error: 'invalid_reset_scope' }, 400);
    if (required.some(name => !values[name as keyof typeof values])) return json({ error: 'missing_reset_filter' }, 400);
    const fields = scope === 'section' ? ['bankVersion', 'chapter', 'lesson', 'section'] as const
      : scope === 'lesson' ? ['bankVersion', 'chapter', 'lesson'] as const
      : scope === 'chapter' ? ['bankVersion', 'chapter'] as const
      : scope === 'session' ? ['session'] as const : [] as const;
    const where = fields.length ? ` WHERE ${fields.map(name => name === 'chapter'
      ? `json_extract(event_json, '$.chapter') = CAST(? AS INTEGER)`
      : `json_extract(event_json, '$.${name}') = ?`).join(' AND ')}` : '';
    const args = fields.map(name => values[name]!);
    const matchingEvents = Number(this.ctx.storage.sql.exec<{ count: number }>(
      `SELECT COUNT(*) AS count FROM learning_events${where}`, ...args,
    ).one().count);
    const overall = this.ctx.storage.sql.exec<{ count: number; lastSeq: number | null }>(
      'SELECT COUNT(*) AS count, MAX(seq) AS lastSeq FROM learning_events',
    ).one();
    const stateKeys = this.ctx.storage.sql.exec<{ key: string }>(
      "SELECT key FROM app_state WHERE key LIKE 'math-scratchpad-%'",
    ).toArray().map(record => record.key);
    const protectedStateKeys = stateKeys.filter(key => key.includes('drive-config') || key.includes('bank-cache') || key.includes('device-id'));
    const affectedSharedStateKeys = stateKeys.filter(key => key.includes('lesson-progress') || key.includes('session-archive') || key.includes('session-v3'));
    const notionPages = Number(this.ctx.storage.sql.exec<{ count: number }>(
      'SELECT COUNT(*) AS count FROM notion_page_refs',
    ).one().count);
    return json({
      readOnly: true,
      canExecute: false,
      scope,
      filters: Object.fromEntries(fields.map(name => [name, values[name]])),
      matchingEvents,
      totalEvents: Number(overall.count),
      lastSeq: Number(overall.lastSeq ?? 0),
      appStateRevision: this.appStateRevision(),
      protectedBankAndIdentityStateKeys: protectedStateKeys.length,
      sharedStateKeysRequiringSelectiveMerge: affectedSharedStateKeys.length,
      notionPageReferencesRequiringReconciliation: scope === 'all' ? notionPages : null,
      requiresCloudReconciliation: true,
      warning: 'Preview only. No reset or deletion endpoint is enabled.',
    });
  }

  /** Durable Object alarm retries configured private mirrors after transient failures. */
  async alarm(): Promise<void> {
    if (this.isLearningResetLocked()) return;
    await this.withMirrorSubrequestBudget(async () => {
      // Notion may not be blocked by a failed Google Drive request.
      const work: Promise<unknown>[] = [];
      if (notionDataSourcesFromEnv(this.env)) work.push(this.syncNotion());
      if (this.driveConfigured()) {
        work.push((async () => {
          await this.syncDrive();
          if ((await this.readDriveState()).weeklyBackup?.status === 'error') await this.syncWeeklyBackup();
        })());
      }
      return Promise.allSettled(work);
    });
  }

  private async withMirrorSubrequestBudget<T>(operation: () => Promise<T>): Promise<{ value: T; used: number; limit: number }> {
    const previous = this.activeMirrorSubrequestBudget;
    const budget = previous ?? { used: 0, limit: MAX_MIRROR_SUBREQUESTS };
    this.activeMirrorSubrequestBudget = budget;
    try {
      const value = await operation();
      return { value, used: budget.used, limit: budget.limit };
    } finally {
      this.activeMirrorSubrequestBudget = previous;
    }
  }

  private appStateRevision(): number {
    return Number(this.ctx.storage.sql.exec<{ revision: number }>(
      'SELECT revision FROM app_state_meta WHERE singleton = 1',
    ).one().revision);
  }

  private readAppState(): Response {
    const rows = this.ctx.storage.sql.exec<{ key: string; value: string | null; revision: number; updated_at: string }>(
      'SELECT key, value, revision, updated_at FROM app_state ORDER BY key',
    ).toArray();
    const records = rows.map(({ updated_at, ...record }) => ({ ...record, updatedAt: updated_at }));
    return json({ records, revision: this.appStateRevision() });
  }

  private async writeAppState(request: Request): Promise<Response> {
    const body = await readBoundedBody(request, MAX_STATE_BODY_BYTES);
    if (!body) return json({ error: 'payload_too_large' }, 413);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder().decode(body)); }
    catch { return json({ error: 'invalid_state_json' }, 400); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'invalid_state' }, 400);
    const item = value as { key?: unknown; value?: unknown; revision?: unknown };
    if (typeof item.key !== 'string' || !item.key.startsWith('math-scratchpad') || item.key.length > 200
      || !(typeof item.value === 'string' || item.value === null)
      || (typeof item.value === 'string' && new TextEncoder().encode(item.value).byteLength > MAX_STATE_VALUE_BYTES)
      || !Number.isSafeInteger(item.revision) || Number(item.revision) < 0) {
      return json({ error: 'invalid_state' }, 400);
    }
    const result = this.ctx.storage.transactionSync(() => {
      if (this.isLearningResetLocked()) return { conflict: false, resetting: true, revision: 0, updatedAt: '' };
      const existing = this.ctx.storage.sql.exec<{ revision: number }>(
        'SELECT revision FROM app_state WHERE key = ?', item.key!,
      ).toArray()[0];
      const current = existing?.revision ?? 0;
      if (current !== item.revision) return { conflict: true, resetting: false, revision: current };
      const revision = current + 1;
      const updatedAt = new Date().toISOString();
      this.ctx.storage.sql.exec(
        'INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, revision=excluded.revision, updated_at=excluded.updated_at',
        item.key!, item.value as string | null, revision, updatedAt,
      );
      this.ctx.storage.sql.exec('UPDATE app_state_meta SET revision = revision + 1 WHERE singleton = 1');
      return { conflict: false, resetting: false, revision, updatedAt };
    });
    if (result.resetting) return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });
    if (result.conflict) return json({ error: 'state_conflict', revision: result.revision }, 409);
    if (this.driveConfigured()) {
      const state = await this.readDriveState();
      await this.saveDriveState({
        ...state, status: 'pending',
        pendingCount: Math.max(0, (await this.maxSequence()) - state.lastSeq) + 1,
      });
      await this.scheduleAlarmIn(DRIVE_DEBOUNCE_MS);
    }
    await this.queueNotionState(item.key!, result.revision);
    return json({ key: item.key, revision: result.revision, updatedAt: result.updatedAt });
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
    let resetInProgress = false;
    try {
      results = this.ctx.storage.transactionSync(() => {
        if (this.isLearningResetLocked()) {
          resetInProgress = true;
          return new Map<string, AppendResult>();
        }
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
          const projectedThrough = this.projectionSequence();
          if (projectedThrough === seq - 1) {
            this.applyNotionProjection(event);
            this.setProjectionSequence(seq);
          }
        }
        return rows;
      });
    } catch (error) {
      if (error instanceof EventConflictError) return json({ error: 'event_id_conflict' }, 409);
      throw error;
    }
    if (resetInProgress) return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });

    const seen = new Set<string>();
    const ordered = events.map(event => {
      const result = results.get(event.id)!;
      if (seen.has(event.id)) return { ...result, duplicate: true };
      seen.add(event.id);
      return result;
    });
    const cursor = Math.max(0, ...ordered.map(item => item.seq));
    await this.queueDriveMirror(cursor);
    await this.queueNotionMirror(cursor);
    return json({ events: ordered, cursor }, 200);
  }

  private driveConfigured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_DRIVE_CLIENT_SECRET && this.env.GOOGLE_DRIVE_REFRESH_TOKEN);
  }

  private async getConfiguredDriveRootId(client: GoogleDriveClient): Promise<string> {
    const rootId = this.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
    const rootName = this.env.GOOGLE_DRIVE_ROOT_FOLDER_NAME?.trim() || 'Math_Project';
    if (!rootId) return client.ensureRootFolder(rootName);
    const root = await client.readFileMetadata(rootId, 'id,name,mimeType,parents,trashed');
    if (root.id !== rootId || root.name !== rootName || root.mimeType !== 'application/vnd.google-apps.folder' || root.trashed === true) {
      throw new DriveMirrorError('invalid_response');
    }
    return rootId;
  }

  private async readDriveState(): Promise<DriveMirrorState> {
    const stored = await this.ctx.storage.get<DriveMirrorState>(DRIVE_STATE_KEY);
    return stored
      ? { ...stored, files: stored.files ?? {}, fileHashes: stored.fileHashes ?? {}, snapshots: stored.snapshots ?? {} }
      : { status: 'pending', lastSeq: 0, pendingCount: 0, quarantinedCount: undefined, files: {}, fileHashes: {}, snapshots: {} };
  }

  private recordDiagnostic(destination: 'drive' | 'notion', stage: string, code: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO mirror_diagnostics(destination,failure_stage,error_code,updated_at) VALUES(?,?,?,?) ON CONFLICT(destination) DO UPDATE SET failure_stage=excluded.failure_stage,error_code=excluded.error_code,updated_at=excluded.updated_at',
      destination, stage.slice(0, 64), code.slice(0, 64), new Date().toISOString(),
    );
  }

  private readDiagnosticStage(destination: 'drive' | 'notion'): string | null {
    const row = this.ctx.storage.sql.exec<{ failure_stage: string }>(
      'SELECT failure_stage FROM mirror_diagnostics WHERE destination = ?', destination,
    ).toArray()[0];
    return row?.failure_stage ?? null;
  }

  private async saveDriveState(state: DriveMirrorState): Promise<void> {
    await this.ctx.storage.put(DRIVE_STATE_KEY, state);
    this.ctx.storage.sql.exec(
      'INSERT INTO sync_health (destination, status, pending_count, last_error, last_synced_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(destination) DO UPDATE SET status=excluded.status, pending_count=excluded.pending_count, last_error=excluded.last_error, last_synced_at=excluded.last_synced_at, updated_at=excluded.updated_at',
      'drive', state.status, state.pendingCount, state.lastError ?? null, state.lastSyncedAt ?? null, new Date().toISOString(),
    );
  }

  private async readPriorDriveContent(input: {
    client: GoogleDriveClient;
    state: DriveMirrorState;
    path: string;
    logicalName: string;
    parentId: string;
    mimeType: string;
  }): Promise<string | undefined> {
    const snapshot = input.state.snapshots?.[input.path];
    if (snapshot) {
      const content = await input.client.readTextContent(snapshot.id);
      if (await sha256Hex(content) !== snapshot.sha256) throw new DriveMirrorError('invalid_response');
      const expectedName = await snapshotName(input.logicalName, content);
      if (snapshot.name !== expectedName) throw new DriveMirrorError('invalid_response');
      return content;
    }

    const id = input.state.files[input.path]?.id
      ?? await input.client.findTextFileId(input.logicalName, input.parentId, input.mimeType);
    if (!id) return undefined;
    const content = await input.client.readTextContent(id);
    const expectedHash = input.state.fileHashes[input.path];
    if (expectedHash && await sha256Hex(content) !== expectedHash) throw new DriveMirrorError('invalid_response');
    return content;
  }

  private async writeDriveSnapshot(input: {
    client: GoogleDriveClient;
    state: DriveMirrorState;
    path: string;
    logicalName: string;
    parentId: string;
    mimeType: string;
    desiredContent: string;
    mergeContent: (previous: string, desired: string) => string;
    trackHash?: boolean;
  }): Promise<DriveSnapshotRef> {
    const previous = await this.readPriorDriveContent(input);
    const content = previous === undefined ? input.desiredContent : input.mergeContent(previous, input.desiredContent);
    const saved = await input.client.writeImmutableTextFile({
      logicalName: input.logicalName,
      parentId: input.parentId,
      mimeType: input.mimeType,
      content,
    });
    input.state.snapshots = { ...(input.state.snapshots ?? {}), [input.path]: saved };
    if (input.trackHash !== false) input.state.fileHashes[input.path] = saved.sha256;
    return saved;
  }

  private async maxSequence(): Promise<number> {
    return Number(this.ctx.storage.sql.exec<{ seq: number }>(
      'SELECT COALESCE(MAX(seq), 0) AS seq FROM learning_events',
    ).one().seq);
  }

  private projectionSequence(): number {
    return Number(this.ctx.storage.sql.exec<{ last_seq: number }>(
      'SELECT last_seq FROM notion_projection_meta WHERE singleton = 1',
    ).one().last_seq);
  }

  private setProjectionSequence(sequence: number): void {
    this.ctx.storage.sql.exec('UPDATE notion_projection_meta SET last_seq = ? WHERE singleton = 1', sequence);
  }

  private readNotionProjection<T>(kind: string, key: string): T | undefined {
    const row = this.ctx.storage.sql.exec<{ projection_json: string }>(
      'SELECT projection_json FROM notion_projections WHERE projection_type = ? AND projection_key = ?',
      kind, key,
    ).toArray()[0];
    return row ? JSON.parse(row.projection_json) as T : undefined;
  }

  private saveNotionProjection(kind: string, key: string, value: unknown): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO notion_projections (projection_type, projection_key, projection_json) VALUES (?, ?, ?) ON CONFLICT(projection_type, projection_key) DO UPDATE SET projection_json = excluded.projection_json',
      kind, key, JSON.stringify(value),
    );
  }

  private applyNotionProjection(event: LearnEvent): void {
    if (typeof event.isTest !== 'boolean') return;
    if (event.type === 'chapter_snapshot') return;
    const priorSession = this.readNotionProjection<SessionProjection>('session', event.session);
    this.saveNotionProjection('session', event.session, applySessionEvent(priorSession, event));
    if (event.isTest) return;

    const dayKey = tehranDayKey(event.ts);
    const priorDaily = this.readNotionProjection<DailyProjection>('daily', dayKey);
    const daily = applyDailyEvent(priorDaily, event);
    if (daily) this.saveNotionProjection('daily', dayKey, daily);

    const conceptKey = [event.chapter, event.lesson, event.concept].join(':');
    const priorConcept = this.readNotionProjection<ConceptProjection>('concept', conceptKey);
    const concept = applyConceptEvent(priorConcept, event);
    if (concept) this.saveNotionProjection('concept', conceptKey, concept);
  }

  private async repairNotionProjections(through: number): Promise<boolean> {
    const projectedThrough = this.projectionSequence();
    if (projectedThrough >= through) return true;
    const rows = this.ctx.storage.sql.exec<{ seq: number; event_json: string }>(
      'SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?',
      projectedThrough, through, NOTION_PROJECTION_PAGE_SIZE,
    ).toArray();
    if (rows.length === 0) return this.projectionSequence() >= through;
    this.ctx.storage.transactionSync(() => {
      for (const row of rows) {
        const sequence = Number(row.seq);
        if (sequence !== this.projectionSequence() + 1) break;
        this.applyNotionProjection(JSON.parse(row.event_json) as LearnEvent);
        this.setProjectionSequence(sequence);
      }
    });
    return this.projectionSequence() >= through;
  }

  private async getDriveStatus(): Promise<DriveMirrorStatus> {
    const maxSeq = await this.maxSequence();
    if (!this.driveConfigured()) {
      return {
        status: 'not_configured', lastSyncedAt: null, pendingCount: maxSeq, quarantinedCount: null, lastError: null,
        failureStage: null,
        weeklyBackup: { status: 'not_configured', lastCreatedAt: null, lastError: null },
      };
    }
    const state = await this.readDriveState();
    return {
      status: state.status,
      lastSyncedAt: state.lastSyncedAt ?? null,
      pendingCount: Math.max(0, maxSeq - state.lastSeq)
        + (state.appStateRevision === this.appStateRevision() ? 0 : 1),
      quarantinedCount: state.quarantinedCount ?? null,
      lastError: state.lastError ?? null,
      failureStage: state.status === 'error' ? this.readDiagnosticStage('drive') : null,
      weeklyBackup: {
        status: state.weeklyBackup?.status ?? 'scheduled',
        lastCreatedAt: state.weeklyBackup?.lastCreatedAt ?? null,
        lastError: state.weeklyBackup?.lastError ?? null,
      },
    };
  }

  private async readNotionState(): Promise<StoredNotionMirrorState> {
    return await this.ctx.storage.get<StoredNotionMirrorState>(NOTION_MIRROR_STATE_KEY)
      ?? { status: 'pending', lastSeq: 0, pendingCount: 0, quarantinedCount: undefined };
  }

  private async saveNotionState(state: StoredNotionMirrorState): Promise<void> {
    await this.ctx.storage.put(NOTION_MIRROR_STATE_KEY, state);
    this.ctx.storage.sql.exec(
      'INSERT INTO sync_health (destination, status, pending_count, last_error, last_synced_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(destination) DO UPDATE SET status=excluded.status, pending_count=excluded.pending_count, last_error=excluded.last_error, last_synced_at=excluded.last_synced_at, updated_at=excluded.updated_at',
      'notion', state.status, state.pendingCount, state.lastError ?? null, state.lastSyncedAt ?? null, new Date().toISOString(),
    );
  }

  private async getNotionStatus(): Promise<NotionMirrorStatus> {
    const maxSeq = await this.maxSequence();
    if (!notionDataSourcesFromEnv(this.env)) {
      return { status: 'not_configured', lastSyncedAt: null, pendingCount: maxSeq, quarantinedCount: null, lastError: null };
    }
    const state = await this.readNotionState();
    return {
      status: state.status,
      lastSyncedAt: state.lastSyncedAt ?? null,
      pendingCount: this.notionPendingCount(maxSeq, state.lastSeq),
      quarantinedCount: state.quarantinedCount ?? null,
      lastError: state.lastError ?? null,
    };
  }

  private notionStateQueueCount(): number {
    return Number(this.ctx.storage.sql.exec<{ count: number }>(
      'SELECT COUNT(*) AS count FROM notion_state_queue',
    ).one().count);
  }

  private notionPendingCount(maxSeq: number, lastSeq: number): number {
    return Math.max(0, maxSeq - lastSeq) + this.notionStateQueueCount();
  }

  private async queueNotionState(key: string, revision: number): Promise<void> {
    if (this.isLearningResetLocked()) return;
    if (!notionDataSourcesFromEnv(this.env)) return;
    // The archive is mirrored as a raw state record while it is live. Chapter
    // snapshots remain append-only learning events before local cleanup.
    this.ctx.storage.sql.exec(
      'INSERT INTO notion_state_queue(key,revision) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET revision=MAX(revision,excluded.revision)',
      key, revision,
    );
    const state = await this.readNotionState();
    const maxSeq = await this.maxSequence();
    await this.saveNotionState({
      ...state,
      status: 'pending',
      pendingCount: this.notionPendingCount(maxSeq, state.lastSeq),
      lastError: state.lastError,
    });
    await this.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
  }

  private async queueNotionMirror(cursor: number): Promise<void> {
    if (this.isLearningResetLocked()) return;
    if (!notionDataSourcesFromEnv(this.env)) return;
    const state = await this.readNotionState();
    if (cursor <= state.lastSeq) return;
    const maxSeq = await this.maxSequence();
    await this.saveNotionState({
      ...state,
      status: 'pending',
      pendingCount: this.notionPendingCount(maxSeq, state.lastSeq),
      // Keep the last failure visible until a mirror run actually succeeds.
      lastError: state.lastError,
    });
    await this.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
  }

  private async scheduleAlarmIn(delayMs: number): Promise<void> {
    if (this.isLearningResetLocked()) return;
    const requested = Date.now() + delayMs;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || requested < existing) await this.ctx.storage.setAlarm(requested);
  }

  private async syncNotion(): Promise<NotionMirrorStatus> {
    if (this.isLearningResetLocked()) return this.getNotionStatus();
    if (!notionDataSourcesFromEnv(this.env)) return this.getNotionStatus();
    if (this.notionSyncPromise) return this.notionSyncPromise;
    this.notionSyncPromise = this.performNotionSync().finally(() => { this.notionSyncPromise = undefined; });
    return this.notionSyncPromise;
  }

  private async performNotionSync(): Promise<NotionMirrorStatus> {
    const dataSources = notionDataSourcesFromEnv(this.env);
    if (!dataSources || !this.env.NOTION_API_KEY) return this.getNotionStatus();
    const state = await this.readNotionState();
    const through = await this.maxSequence();
    if (through === state.lastSeq && this.notionStateQueueCount() === 0 && state.status === 'synced') {
      // Backfill the SQL health dashboard for mirrors synced before the table existed.
      await this.saveNotionState({ ...state, pendingCount: 0 });
      return this.getNotionStatus();
    }
    await this.saveNotionState({
      ...state,
      status: 'syncing',
      pendingCount: this.notionPendingCount(through, state.lastSeq),
      lastError: undefined,
    });

    try {
      const projectionsReady = await this.repairNotionProjections(through);
      if (!projectionsReady) {
        const rebuilding: StoredNotionMirrorState = {
          ...state,
          status: 'pending',
          pendingCount: this.notionPendingCount(through, state.lastSeq),
          lastError: undefined,
        };
        await this.saveNotionState(rebuilding);
        await this.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
        return this.toNotionStatus(rebuilding, through);
      }

      this.notionClient ??= createNotionClient(this.env.NOTION_API_KEY, this.budgetedFetch);
      const events = this.readEventsAfter(state.lastSeq, through, NOTION_EVENTS_PER_RUN);
      let lastSeq = state.lastSeq;
      let lastSyncedAt = state.lastSyncedAt;
      let quarantinedCount = state.quarantinedCount ?? 0;
      for (const stored of events) {
        const event = stored.event;
        if (typeof event.isTest !== 'boolean') {
          quarantinedCount += 1;
          lastSeq = stored.seq;
          await this.saveNotionState({
            status: 'pending',
            lastSeq,
            pendingCount: this.notionPendingCount(through, lastSeq),
            quarantinedCount,
            ...(lastSyncedAt ? { lastSyncedAt } : {}),
          });
          continue;
        }
        const session = this.readNotionProjection<SessionProjection>('session', event.session)
          ?? applySessionEvent(undefined, event);
        const daily = event.isTest ? undefined : this.readNotionProjection<DailyProjection>('daily', tehranDayKey(event.ts));
        const conceptKey = [event.chapter, event.lesson, event.concept].join(':');
        const hasConceptUpdate = isAttemptLikeEvent(event) || event.type === 'mastery_changed' || event.type === 'gate_passed';
        const concept = event.isTest || !hasConceptUpdate ? undefined : this.readNotionProjection<ConceptProjection>('concept', conceptKey);
        const context = this.createNotionContext(dataSources, new Date().toISOString());
        await syncNotionEvent(context, { event, session, daily, concept });
        lastSeq = stored.seq;
        lastSyncedAt = new Date().toISOString();
        await this.saveNotionState({
          status: 'pending',
          lastSeq,
          pendingCount: this.notionPendingCount(through, lastSeq),
          quarantinedCount,
          lastSyncedAt,
        });
      }

      const queuedStateRows = this.ctx.storage.sql.exec<PendingNotionState>(
        'SELECT key, revision FROM notion_state_queue ORDER BY key LIMIT ?', NOTION_STATE_KEYS_PER_RUN,
      ).toArray();
      for (const queued of queuedStateRows) {
        const current = this.ctx.storage.sql.exec<{
          value: string | null;
          revision: number;
          updated_at: string;
        }>('SELECT value, revision, updated_at FROM app_state WHERE key = ?', queued.key).toArray()[0];
        const revision = current ? Number(current.revision) : Number(queued.revision);
        const context = this.createNotionContext(dataSources, new Date().toISOString());
        await syncNotionAppState(context, {
          key: queued.key,
          value: current?.value ?? null,
          revision,
          updatedAt: current?.updated_at ?? new Date().toISOString(),
        });
        this.ctx.storage.sql.exec(
          'DELETE FROM notion_state_queue WHERE key = ? AND revision <= ?', queued.key, revision,
        );
        lastSyncedAt = new Date().toISOString();
        const currentMax = await this.maxSequence();
        await this.saveNotionState({
          status: 'pending',
          lastSeq,
          pendingCount: this.notionPendingCount(currentMax, lastSeq),
          quarantinedCount,
          lastSyncedAt,
        });
      }

      const currentMax = await this.maxSequence();
      const pendingCount = this.notionPendingCount(currentMax, lastSeq);
      const completed: StoredNotionMirrorState = {
        status: pendingCount === 0 ? 'synced' : 'pending',
        lastSeq,
        pendingCount,
        quarantinedCount,
        lastSyncedAt: lastSyncedAt ?? new Date().toISOString(),
      };
      await this.saveNotionState(completed);
      if (pendingCount > 0) await this.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
      return this.toNotionStatus(completed, currentMax);
    } catch (error) {
      const currentMax = await this.maxSequence();
      const currentState = await this.readNotionState();
      const failed: StoredNotionMirrorState = {
        ...currentState,
        status: 'error',
        pendingCount: this.notionPendingCount(currentMax, currentState.lastSeq),
        lastError: notionErrorCode(error),
      };
      await this.saveNotionState(failed);
      this.recordDiagnostic('notion', 'notion_event_sync', failed.lastError ?? 'unknown');
      await this.scheduleAlarmIn(NOTION_RETRY_MS);
      return this.toNotionStatus(failed, currentMax);
    }
  }

  private toNotionStatus(state: StoredNotionMirrorState, maxSeq: number): NotionMirrorStatus {
    return {
      status: state.status,
      lastSyncedAt: state.lastSyncedAt ?? null,
      pendingCount: this.notionPendingCount(maxSeq, state.lastSeq),
      quarantinedCount: state.quarantinedCount ?? null,
      lastError: state.lastError ?? null,
    };
  }

  private createNotionContext(dataSources: NonNullable<ReturnType<typeof notionDataSourcesFromEnv>>, now: string): NotionEventContext {
    return {
      client: this.notionClient!,
      dataSources,
      now,
      call: operation => this.notionRequests.run(operation),
      getPageRef: async (kind, key) => {
        const row = this.ctx.storage.sql.exec<{ page_id: string }>(
          'SELECT page_id FROM notion_page_refs WHERE kind = ? AND external_key = ?', kind, key,
        ).toArray()[0];
        return row?.page_id;
      },
      setPageRef: async (kind, key, pageId) => {
        this.ctx.storage.sql.exec(
          'INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?) ON CONFLICT(kind, external_key) DO UPDATE SET page_id = excluded.page_id',
          kind, key, pageId,
        );
      },
      getPageRefs: async (kind, prefix) => this.ctx.storage.sql.exec<{ external_key: string; page_id: string }>(
        'SELECT external_key, page_id FROM notion_page_refs WHERE kind = ? AND substr(external_key, 1, ?) = ? ORDER BY external_key',
        kind, prefix.length, prefix,
      ).toArray().map(row => ({ key: row.external_key, pageId: row.page_id })),
      deletePageRef: async (kind, key) => {
        this.ctx.storage.sql.exec('DELETE FROM notion_page_refs WHERE kind = ? AND external_key = ?', kind, key);
      },
      getMistakeState: async key => {
        const row = this.ctx.storage.sql.exec<{
          event_id: string;
          review_successes: number;
          last_review_event_id: string | null;
        }>(
          'SELECT event_id, review_successes, last_review_event_id FROM notion_mistake_reviews WHERE item_key = ?', key,
        ).toArray()[0];
        return row ? {
          eventId: row.event_id,
          reviewSuccesses: Number(row.review_successes),
          ...(row.last_review_event_id ? { lastReviewEventId: row.last_review_event_id } : {}),
        } : undefined;
      },
      setMistakeState: async (key, value: MistakeReviewState) => {
        this.ctx.storage.sql.exec(
          'INSERT INTO notion_mistake_reviews (item_key, event_id, review_successes, last_review_event_id) VALUES (?, ?, ?, ?) ON CONFLICT(item_key) DO UPDATE SET event_id = excluded.event_id, review_successes = excluded.review_successes, last_review_event_id = excluded.last_review_event_id',
          key, value.eventId, value.reviewSuccesses, value.lastReviewEventId ?? null,
        );
      },
      getSessionMistakePageIds: async sessionId => this.ctx.storage.sql.exec<{ page_id: string }>(
        'SELECT page_id FROM notion_session_mistakes WHERE session_id = ? ORDER BY page_id', sessionId,
      ).toArray().map(row => row.page_id),
      addSessionMistakePageId: async (sessionId, pageId) => {
        this.ctx.storage.sql.exec(
          'INSERT OR IGNORE INTO notion_session_mistakes (session_id, page_id) VALUES (?, ?)',
          sessionId, pageId,
        );
      },
      getSessionPageIds: async sessionIds => sessionIds.flatMap(sessionId => {
        const row = this.ctx.storage.sql.exec<{ page_id: string }>(
          'SELECT page_id FROM notion_page_refs WHERE kind = ? AND external_key = ?', 'session', sessionId,
        ).toArray()[0];
        return row ? [row.page_id] : [];
      }),
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
      // A newly queued event does not mean the previous Drive failure was fixed.
      lastError: state.lastError,
    });
    await this.scheduleAlarmIn(DRIVE_DEBOUNCE_MS);
  }

  private syncWeeklyBackup(now = new Date()): Promise<DriveMirrorStatus['weeklyBackup']> {
    if (this.isLearningResetLocked()) {
      return Promise.resolve({ status: 'scheduled', lastCreatedAt: null, lastError: null });
    }
    if (!this.driveConfigured()) {
      return Promise.resolve({ status: 'not_configured', lastCreatedAt: null, lastError: null });
    }
    if (this.weeklyBackupPromise) return this.weeklyBackupPromise;
    this.weeklyBackupPromise = this.withDriveOperation(() => this.performWeeklyBackup(now)).finally(() => { this.weeklyBackupPromise = undefined; });
    return this.weeklyBackupPromise;
  }

  /** Drive sync and scheduled backups share one persisted file manifest, so serialize their writes. */
  private withDriveOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.driveOperationQueue.then(operation, operation);
    this.driveOperationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async performWeeklyBackup(now = new Date()): Promise<DriveMirrorStatus['weeklyBackup']> {
    if (!this.driveConfigured()) return { status: 'not_configured', lastCreatedAt: null, lastError: null };
    const state = await this.readDriveState();
    if (!state.folders && (await this.maxSequence()) === 0 && this.appStateRevision() === 0) {
      return { status: 'scheduled', lastCreatedAt: null, lastError: null };
    }
    const date = formatTehran(now).slice(0, 10);
    if (state.weeklyBackup?.status === 'created' && state.weeklyBackup.date === date) {
      return { status: 'created', lastCreatedAt: state.weeklyBackup.lastCreatedAt ?? null, lastError: null };
    }

    try {
      this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch);
      const client = this.driveClient;
      let folders = state.folders;
      if (!folders) {
        const rootId = await this.getConfiguredDriveRootId(client);
        const syncId = await client.ensureFolder('03_Sync', rootId);
        const eventsId = await client.ensureFolder('events', syncId);
        const stateId = await client.ensureFolder('state', syncId);
        folders = { rootId, syncId, eventsId, stateId };
      }
      const backupsId = folders.backupsId ?? await client.ensureFolder('06_Backups', folders.rootId);
      folders = { ...folders, backupsId };
      state.folders = folders;
      await this.saveDriveState({ ...state, status: state.status, folders });

      const through = await this.maxSequence();
      const events = this.readEventsThrough(through);
      const mirrorableEvents = events.filter(item => typeof item.event.isTest === 'boolean');
      const quarantinedCount = events.length - mirrorableEvents.length;
      const snapshotCreatedAtUtc = state.weeklyBackup?.date === date && state.weeklyBackup.snapshotCreatedAtUtc
        ? state.weeklyBackup.snapshotCreatedAtUtc : now.toISOString();
      state.weeklyBackup = { ...state.weeklyBackup, status: 'scheduled', date, snapshotCreatedAtUtc };
      await this.saveDriveState({ ...state, status: state.status, weeklyBackup: state.weeklyBackup });
      const snapshotCreatedAt = new Date(snapshotCreatedAtUtc);
      const unsigned = {
        format: 'math-scratchpad-weekly-backup/v1',
        schemaVersion: 1,
        backupDateTehran: date,
        createdAtUtc: snapshotCreatedAt.toISOString(),
        createdAtTehran: formatTehran(snapshotCreatedAt),
        snapshot: {
          lastSeq: through,
          eventCount: mirrorableEvents.length,
          quarantinedEventCount: quarantinedCount,
          progress: buildProgressProjection(mirrorableEvents, snapshotCreatedAt),
        },
        events: mirrorableEvents,
      };
      const contents = `${JSON.stringify({ ...unsigned, sha256: await sha256Hex(canonicalJson(unsigned)) }, null, 2)}\n`;
      const name = `sync_backup_${date}.json`;
      const path = `backups/${name}`;
      await this.writeDriveSnapshot({
        client, state, path, logicalName: name,
        parentId: backupsId,
        mimeType: 'application/json',
        desiredContent: contents,
        mergeContent: mergeWeeklyBackupContent,
        trackHash: false,
      });
      state.weeklyBackup = { ...state.weeklyBackup, status: 'created', date, snapshotCreatedAtUtc, lastCreatedAt: now.toISOString(), lastSeq: through };
      await this.saveDriveState({ ...state, status: state.status, weeklyBackup: state.weeklyBackup });
      return { status: 'created', lastCreatedAt: now.toISOString(), lastError: null };
    } catch (error) {
      const code = error instanceof DriveMirrorError ? error.code
        : (error as { code?: unknown } | null)?.code === 'subrequest_budget_exceeded' ? 'subrequest_budget_exceeded'
        : error instanceof Error && error.message === 'event_id_conflict' ? 'etag_conflict' : 'network_error';
      state.weeklyBackup = { ...state.weeklyBackup, status: 'error', date, lastError: code };
      await this.saveDriveState({ ...state, status: state.status, weeklyBackup: state.weeklyBackup });
      await this.scheduleAlarmIn(WEEKLY_BACKUP_RETRY_MS);
      return { status: 'error', lastCreatedAt: state.weeklyBackup.lastCreatedAt ?? null, lastError: code };
    }
  }

  private async syncDrive(): Promise<DriveMirrorStatus> {
    if (this.isLearningResetLocked()) return this.getDriveStatus();
    if (!this.driveConfigured()) return this.getDriveStatus();
    if (this.driveSyncPromise) return this.driveSyncPromise;
    this.driveSyncPromise = this.withDriveOperation(() => this.performDriveSync()).finally(() => { this.driveSyncPromise = undefined; });
    return this.driveSyncPromise;
  }

  private async performDriveSync(): Promise<DriveMirrorStatus> {
    const state = await this.readDriveState();
    const through = await this.maxSequence();
    if (!state.folders && through === 0 && this.appStateRevision() === 0) {
      return {
        status: 'synced', lastSyncedAt: null, pendingCount: 0, quarantinedCount: 0,
        lastError: null, failureStage: null,
        weeklyBackup: { status: 'scheduled', lastCreatedAt: null, lastError: null },
      };
    }
    if (through === state.lastSeq && state.appStateRevision === this.appStateRevision() && state.status === 'synced') return this.getDriveStatus();
    await this.saveDriveState({ ...state, status: 'syncing', pendingCount: Math.max(0, through - state.lastSeq), lastError: undefined });

    try {
      this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch);
      const client = this.driveClient;
      const events = this.readEventsThrough(through);
      const mirrorableEvents = events.filter(item => typeof item.event.isTest === 'boolean');
      const quarantinedCount = events.length - mirrorableEvents.length;
      const newEvents = mirrorableEvents.filter(item => item.seq > state.lastSeq);
      let folders = state.folders;
      if (!folders) {
        const rootId = await this.getConfiguredDriveRootId(client);
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
        const content = mergeJsonlEventContent('', serializeJsonlEvents(mirrorableEvents.filter(item => {
          const date = new Date(item.event.ts);
          return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` === month;
        })));
        await this.writeDriveSnapshot({
          client, state, path, logicalName: name,
          parentId: folders.eventsId,
          mimeType: 'application/x-ndjson',
          desiredContent: content,
          mergeContent: mergeJsonlEventContent,
        });
        await this.saveDriveState({ ...state, status: 'syncing', pendingCount: Math.max(0, through - state.lastSeq) });
      }

      const progress = buildProgressProjection(events);
      const desiredProgress = `${JSON.stringify(progress, null, 2)}\n`;
      await this.writeDriveSnapshot({
        client, state, path: 'state/progress.json', logicalName: 'progress.json',
        parentId: folders.stateId,
        mimeType: 'application/json',
        desiredContent: desiredProgress,
        mergeContent: mergeProgressContent,
      });
      const stateRevision = this.appStateRevision();
      const persistedState = this.ctx.storage.sql.exec<{ key: string; value: string | null; revision: number }>(
        'SELECT key, value, revision FROM app_state ORDER BY key',
      ).toArray();
      const stateContent = JSON.stringify({
        format: 'math-scratchpad-server-state/v1',
        revision: stateRevision,
        records: persistedState,
      }, null, 2) + '\n';
      await this.writeDriveSnapshot({
        client, state, path: 'state/editor_state.json', logicalName: 'editor_state.json',
        parentId: folders.stateId,
        mimeType: 'application/json',
        desiredContent: stateContent,
        mergeContent: mergeEditorStateContent,
      });


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
        files: Object.entries(state.snapshots ?? {})
          .filter(([path]) => path !== 'sync_manifest.json' && !path.startsWith('backups/'))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([path, snapshot]) => ({ path, sha256: snapshot.sha256, name: snapshot.name, id: snapshot.id })),
      };
      await this.writeDriveSnapshot({
        client, state, path: 'sync_manifest.json', logicalName: 'sync_manifest.json',
        parentId: folders.syncId,
        mimeType: 'application/json',
        desiredContent: `${JSON.stringify(manifest, null, 2)}\n`,
        mergeContent: mergeManifestContent,
      });

      const currentMax = await this.maxSequence();
      const pendingCount = Math.max(0, currentMax - through)
        + (this.appStateRevision() === stateRevision ? 0 : 1);
      const finalState: DriveMirrorState = {
        ...state,
        status: pendingCount === 0 ? 'synced' : 'pending',
        lastSeq: through,
        appStateRevision: stateRevision,
        pendingCount,
        quarantinedCount,
        lastSyncedAt: now.toISOString(),
        lastError: undefined,
      };
      await this.saveDriveState(finalState);
      if (pendingCount > 0) await this.scheduleAlarmIn(DRIVE_DEBOUNCE_MS);
      return {
        status: finalState.status,
        lastSyncedAt: finalState.lastSyncedAt ?? null,
        pendingCount: finalState.pendingCount,
        quarantinedCount: finalState.quarantinedCount ?? 0,
        lastError: null,
        failureStage: null,
        weeklyBackup: {
          status: finalState.weeklyBackup?.status ?? 'scheduled',
          lastCreatedAt: finalState.weeklyBackup?.lastCreatedAt ?? null,
          lastError: finalState.weeklyBackup?.lastError ?? null,
        },
      };
    } catch (error) {
      const code = error instanceof DriveMirrorError ? error.code : (error as { code?: unknown } | null)?.code === 'subrequest_budget_exceeded'
        ? 'subrequest_budget_exceeded' : error instanceof Error && error.message === 'event_id_conflict'
        ? 'etag_conflict' : 'network_error';
      const currentMax = await this.maxSequence();
      const failed: DriveMirrorState = {
        ...state,
        status: 'error',
        pendingCount: Math.max(0, currentMax - state.lastSeq),
        lastError: code,
      };
      await this.saveDriveState(failed);
      this.recordDiagnostic('drive', this.driveClient?.diagnosticStage ?? 'worker_internal', code);
      await this.scheduleAlarmIn(DRIVE_RETRY_MS);
      return {
        status: failed.status,
        lastSyncedAt: failed.lastSyncedAt ?? null,
        pendingCount: failed.pendingCount,
        quarantinedCount: failed.quarantinedCount ?? null,
        lastError: failed.lastError ?? null,
        failureStage: this.readDiagnosticStage('drive'),
        weeklyBackup: {
          status: failed.weeklyBackup?.status ?? 'scheduled',
          lastCreatedAt: failed.weeklyBackup?.lastCreatedAt ?? null,
          lastError: failed.weeklyBackup?.lastError ?? null,
        },
      };
    }
  }

  private readEventsAfter(cursor: number, through: number, limit: number): SequencedLearnEvent[] {
    const rows = this.ctx.storage.sql.exec<{ seq: number; event_json: string }>(
      'SELECT seq, event_json FROM learning_events WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?',
      cursor, through, limit,
    ).toArray();
    return rows.map(row => ({ seq: Number(row.seq), event: JSON.parse(row.event_json) as LearnEvent }));
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
class BankTooLargeError extends Error {}
class BankFileTypeError extends Error {}

/** Same limit as the browser's bank parser. */
const MAX_BANK_BYTES = 1_000_000;
const BANK_META_FIELDS = 'id,name,mimeType,size,md5Checksum,modifiedTime,headRevisionId,version,trashed';
type BankFileMeta = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; modifiedTime?: string; headRevisionId?: string; version?: string; trashed?: boolean };

function isValidDriveFileId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,150}$/.test(id);
}

async function readBankMetadata(client: GoogleDriveClient, fileId: string): Promise<BankFileMeta> {
  const raw = await client.readFileMetadata(fileId, BANK_META_FIELDS);
  if (raw.id !== fileId || typeof raw.name !== 'string' || typeof raw.mimeType !== 'string') throw new DriveMirrorError('invalid_response');
  const meta: BankFileMeta = { id: fileId, name: raw.name, mimeType: raw.mimeType };
  for (const key of ['size', 'md5Checksum', 'modifiedTime', 'headRevisionId', 'version'] as const) {
    if (typeof raw[key] === 'string') meta[key] = raw[key] as string;
  }
  if (typeof raw.trashed === 'boolean') meta.trashed = raw.trashed;
  if (meta.trashed) throw new BankFileTypeError('bank_trashed');
  if (meta.mimeType.startsWith('application/vnd.google-apps.')) throw new BankFileTypeError('bank_not_json_file');
  if (meta.size !== undefined && Number(meta.size) > MAX_BANK_BYTES) throw new BankTooLargeError();
  return meta;
}

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

function mergeEditorStateContent(remote: string, desired: string): string {
  const previous = parseJsonContent(remote);
  const current = parseJsonContent(desired);
  if (previous.format !== 'math-scratchpad-server-state/v1' || current.format !== 'math-scratchpad-server-state/v1'
    || !Number.isSafeInteger(previous.revision) || !Number.isSafeInteger(current.revision)
    || !Array.isArray(previous.records) || !Array.isArray(current.records)) {
    throw new DriveMirrorError('invalid_response');
  }
  if (Number(previous.revision) > Number(current.revision)) throw new DriveMirrorError('etag_conflict');
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
