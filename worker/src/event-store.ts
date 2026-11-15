import { projectionSequence, setProjectionSequence, readNotionProjection, applyNotionProjection, repairNotionProjections, rebuildNotionProjectionsFromEventLog } from './event-store/notion-projection-repository';
import { resetPreview } from './event-store/scoped-reset-preview';
import { executeScopedReset } from './event-store/scoped-reset-service';
import type { ScopedResetDependencies } from './event-store/scoped-reset-preview';
import { executeLearningReset, learningResetStatus, learningResetClientStatus, releaseLearningReset } from './event-store/reset-service';
import { trashLearningMirrorFiles } from './event-store/reset-drive-mirror';
import { notionResetReconciliationPendingCount } from './event-store/reset-repository';
import { performNotionSync, type StoredNotionMirrorState } from './event-store/notion-mirror-service';
import { isScopedResetSharedStateKey } from '../../shared/contracts/storage-keys';
import { performDriveSync, type DriveSnapshotWrite } from './event-store/drive-mirror-service';
import type { DriveMirrorState, DriveMirrorStatus } from './event-store/drive-mirror-state';
export type { DriveMirrorStatus } from './event-store/drive-mirror-state';
import { buildScopedResetSnapshot, type ScopedResetSnapshot } from './event-store/scoped-reset-snapshot';
import { appendEvents } from './event-store/event-append';
import { canonicalJson } from './event-store/canonical-json';
import { maxSequence, readEventsAfter, readEventsThrough, readPage } from './event-store/event-repository';
import { initializeStoreSchema } from './event-store/schema';
import { json } from './event-store/response';
import { handleSession } from './event-store/session-service';
import { readBank, registerBankSource } from './event-store/bank-source-service';
import { appStateRevision as readAppStateRevision, readAppState, writeAppState } from './event-store/state-repository';
import { NOTION_RESET_RECONCILIATION_PER_CALL, RATE_WINDOW_MS, DRIVE_STATE_KEY, DRIVE_DEBOUNCE_MS, DRIVE_RETRY_MS, WEEKLY_BACKUP_RETRY_MS, NOTION_PROJECTION_PAGE_SIZE, NOTION_DEBOUNCE_MS, MAX_MIRROR_SUBREQUESTS, NOTION_MIRROR_STATE_KEY, LEARNING_RESET_TABLE, SCOPED_RESET_OPERATIONS_TABLE, MAX_SCOPED_RESET_BODY_BYTES, MAX_SCOPED_RESET_REBUILD_EVENTS, SCOPED_RESET_REVIEW_CONFIRMATION, SCOPED_RESET_DELETE_CONFIRMATION, LEARNING_RESET_TRASH_PER_CALL } from './event-store/limits';
import { DurableObject } from 'cloudflare:workers';
import { learnEventSchema, type LearnEvent } from '../../shared/contracts/learn-event';
import { readBoundedBody } from './body';
import type { WorkerEnv } from './env';
import { DriveMirrorError, GoogleDriveClient, hasLearningMirrorOwnership, type DriveFileRef, type DriveMirrorErrorCode, type DriveFolderChild, type DriveMirrorKind, type DriveSnapshotRef } from './google-drive';
import { snapshotName } from './immutable-snapshot';
import { LEARNING_RESET_EPOCH, LEARNING_RESET_EPOCH_HEADER } from '../../shared/contracts/reset-epoch';
import {
  parseScopedLearningResetScope,
  type ScopedLearningResetScope,
} from './scoped-reset-plan';
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
  archiveVerifiedNotionResetPage,
  notionDataSourcesFromEnv,
  notionErrorCode,
  NotionRequestQueue,
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

type MirrorSubrequestBudget = { used: number; limit: number };
class MirrorSubrequestBudgetExceeded extends Error {
  readonly code = 'subrequest_budget_exceeded';
  constructor() { super('subrequest_budget_exceeded'); }
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
    initializeStoreSchema(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/internal/learning-reset') return this.executeLearningReset(request);
    if (request.method === 'POST' && url.pathname === '/internal/learning-reset/release') return this.releaseLearningReset(request);
    if (request.method === 'GET' && url.pathname === '/internal/learning-reset/status') return learningResetStatus(this.ctx.storage, this.activeLearningResetId !== undefined);
    if (request.method === 'GET' && url.pathname === '/internal/learning-reset/client-status') return learningResetClientStatus(this.ctx.storage, () => this.consumeRateLimit());
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
    if (request.method === 'POST' && url.pathname.startsWith('/internal/session/')) return handleSession(this.ctx.storage, () => this.consumeRateLimit(), url.pathname, request);
    if ((request.method === 'GET' && (url.pathname === '/bank/meta' || url.pathname === '/bank/content'))
      || (request.method === 'POST' && url.pathname === '/bank/source')) {
      const rate = this.consumeRateLimit();
      if (rate) return rate;
      if (url.pathname === '/bank/source') return registerBankSource(this.ctx.storage, () => this.bankDriveClient(), request);
      return readBank(this.ctx.storage, () => this.bankDriveClient(), url.pathname === '/bank/content');
    }
    const supported = (request.method === 'POST' && (url.pathname === '/events' || url.pathname === '/reset/execute'))
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

    if (url.pathname === '/reset/preview') return resetPreview(this.scopedResetDependencies(), url);
    if (request.method === 'POST' && url.pathname === '/reset/execute') return executeScopedReset(this.scopedResetDependencies(), request);
    if (url.pathname === '/state') return request.method === 'GET' ? readAppState(this.ctx.storage)
      : this.trackLearningMutation(() => writeAppState(this.ctx.storage, request, () => this.isLearningResetLocked(), (key, revision) => this.mirrorStateChange(key, revision)));
    if (url.pathname === '/events') return this.trackLearningMutation(() => appendEvents(
      this.ctx.storage, request, () => this.isLearningResetLocked(),
      (seq, event) => {
        const projectedThrough = projectionSequence(this.ctx.storage);
        if (projectedThrough === seq - 1) {
          applyNotionProjection(this.ctx.storage, event);
          setProjectionSequence(this.ctx.storage, seq);
        }
      },
      async cursor => {
        await this.queueDriveMirror(cursor);
        await this.queueNotionMirror(cursor);
      },
    ));
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
    return readPage(this.ctx.storage, url, url.pathname === '/snapshot');
  }

  private executeLearningReset(request: Request): Promise<Response> {
    return executeLearningReset({
      env: this.env,
      storage: this.ctx.storage,
      activeReset: () => this.activeLearningResetId,
      setActiveReset: id => { this.activeLearningResetId = id; },
      waitForLearningMutations: () => this.waitForLearningMutations(),
      waitForMirrors: () => Promise.allSettled([this.driveSyncPromise, this.weeklyBackupPromise, this.notionSyncPromise, this.driveOperationQueue]),
      trashLearningMirrorFiles: bankFileId => trashLearningMirrorFiles(
        this.env, this.driveConfigured(), () => this.readDriveState(),
        () => this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch), bankFileId,
      ),
      reconcileNotionResetReferences: resetId => this.reconcileNotionResetReferences(resetId),
      driveFailureStage: () => this.driveClient?.diagnosticStage,
      recordDiagnostic: (destination, stage, code) => this.recordDiagnostic(destination, stage, code),
    }, request);
  }

  private releaseLearningReset(request: Request): Promise<Response> {
    return releaseLearningReset(this.ctx.storage, request);
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

  private async reconcileNotionResetReferences(resetId: string): Promise<{
    archived: number;
    protected: number;
    unverified: number;
    retryable: number;
    pending: number;
  }> {
    const dataSources = notionDataSourcesFromEnv(this.env);
    if (!dataSources || !this.env.NOTION_API_KEY) {
      return { archived: 0, protected: 0, unverified: 0, retryable: 0, pending: notionResetReconciliationPendingCount(this.ctx.storage, resetId) };
    }
    this.notionClient ??= createNotionClient(this.env.NOTION_API_KEY, this.budgetedFetch);
    const rows = this.ctx.storage.sql.exec<{
      kind: string; external_key: string; page_id: string; owner_marker: string; attempts: number;
    }>(
      `SELECT kind, external_key, page_id, owner_marker, attempts FROM notion_reset_reconciliation
       WHERE reset_id = ? AND status IN ('pending', 'retry', 'ownership_unverified') ORDER BY kind, external_key LIMIT ?`,
      resetId, NOTION_RESET_RECONCILIATION_PER_CALL,
    ).toArray();
    const totals = { archived: 0, protected: 0, unverified: 0, retryable: 0, pending: 0 };
    for (const row of rows) {
      const now = new Date().toISOString();
      if (row.owner_marker !== 'math-scratchpad') {
        this.ctx.storage.sql.exec(
          `UPDATE notion_reset_reconciliation SET status = 'ownership_unverified', attempts = attempts + 1,
           last_attempt_at = ?, last_error = 'ownership_marker_mismatch' WHERE reset_id = ? AND kind = ? AND external_key = ?`,
          now, resetId, row.kind, row.external_key,
        );
        totals.unverified += 1;
        continue;
      }
      try {
        const result = await archiveVerifiedNotionResetPage(this.createNotionContext(dataSources, now), {
          kind: row.kind, externalKey: row.external_key, pageId: row.page_id,
        });
        if (result === 'archived') {
          this.ctx.storage.transactionSync(() => {
            this.ctx.storage.sql.exec(
              `UPDATE notion_reset_reconciliation SET status = 'archived', attempts = attempts + 1,
               last_attempt_at = ?, last_error = NULL, reconciled_at = ? WHERE reset_id = ? AND kind = ? AND external_key = ?`,
              now, now, resetId, row.kind, row.external_key,
            );
            this.ctx.storage.sql.exec(
              'DELETE FROM notion_page_refs WHERE kind = ? AND external_key = ? AND page_id = ?',
              row.kind, row.external_key, row.page_id,
            );
          });
          totals.archived += 1;
        } else if (result === 'protected') {
          this.ctx.storage.sql.exec(
            `UPDATE notion_reset_reconciliation SET status = 'protected', attempts = attempts + 1,
             last_attempt_at = ?, last_error = NULL WHERE reset_id = ? AND kind = ? AND external_key = ?`,
            now, resetId, row.kind, row.external_key,
          );
          totals.protected += 1;
        } else {
          this.ctx.storage.sql.exec(
            `UPDATE notion_reset_reconciliation SET status = 'ownership_unverified', attempts = attempts + 1,
             last_attempt_at = ?, last_error = 'ownership_unverified' WHERE reset_id = ? AND kind = ? AND external_key = ?`,
            now, resetId, row.kind, row.external_key,
          );
          totals.unverified += 1;
        }
      } catch (error) {
        this.ctx.storage.sql.exec(
          `UPDATE notion_reset_reconciliation SET status = 'retry', attempts = attempts + 1,
           last_attempt_at = ?, last_error = ? WHERE reset_id = ? AND kind = ? AND external_key = ?`,
          now, notionErrorCode(error), resetId, row.kind, row.external_key,
        );
        totals.retryable += 1;
      }
    }
    totals.pending = notionResetReconciliationPendingCount(this.ctx.storage, resetId);
    return totals;
  }


  /** Separate from the mirror client so bank reads never overwrite mirror diagnostics. */
  private bankDriveClient(): GoogleDriveClient {
    this.bankClient ??= new GoogleDriveClient(this.env, this.budgetedFetch);
    return this.bankClient;
  }

  private scopedResetDependencies(): ScopedResetDependencies {
    return {
      env: this.env,
      storage: this.ctx.storage,
      isLearningResetLocked: () => this.isLearningResetLocked(),
      snapshot: scope => buildScopedResetSnapshot(this.ctx.storage, {
        drive: this.driveConfigured(),
        notion: Boolean(notionDataSourcesFromEnv(this.env) && this.env.NOTION_API_KEY),
      }, scope),
      rebuildNotionProjections: () => rebuildNotionProjectionsFromEventLog(this.ctx.storage),
    };
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

  private async mirrorStateChange(key: string, revision: number): Promise<void> {
    if (this.driveConfigured()) {
      const state = await this.readDriveState();
      await this.saveDriveState({
        ...state, status: 'pending',
        pendingCount: Math.max(0, (await maxSequence(this.ctx.storage)) - state.lastSeq) + 1,
      });
      await this.scheduleAlarmIn(DRIVE_DEBOUNCE_MS);
    }
    await this.queueNotionState(key, revision);
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

  private async writeDriveSnapshot(input: DriveSnapshotWrite): Promise<DriveSnapshotRef> {
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


  private async getDriveStatus(): Promise<DriveMirrorStatus> {
    const maxSeq = await maxSequence(this.ctx.storage);
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
        + (state.appStateRevision === readAppStateRevision(this.ctx.storage) ? 0 : 1),
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
    const maxSeq = await maxSequence(this.ctx.storage);
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
    const maxSeq = await maxSequence(this.ctx.storage);
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
    const maxSeq = await maxSequence(this.ctx.storage);
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
    const reconciliationPending = notionResetReconciliationPendingCount(this.ctx.storage);
    if (reconciliationPending > 0) {
      const current = await this.getNotionStatus();
      return { ...current, status: 'pending', pendingCount: Math.max(current.pendingCount, reconciliationPending) };
    }
    if (!notionDataSourcesFromEnv(this.env)) return this.getNotionStatus();
    if (this.notionSyncPromise) return this.notionSyncPromise;
    this.notionSyncPromise = this.performNotionSync().finally(() => { this.notionSyncPromise = undefined; });
    return this.notionSyncPromise;
  }

  private performNotionSync(): Promise<NotionMirrorStatus> {
    return performNotionSync({
      env: this.env,
      storage: this.ctx.storage,
      ensureClient: apiKey => { this.notionClient ??= createNotionClient(apiKey, this.budgetedFetch); },
      getNotionStatus: () => this.getNotionStatus(),
      readNotionState: () => this.readNotionState(),
      notionStateQueueCount: () => this.notionStateQueueCount(),
      saveNotionState: state => this.saveNotionState(state),
      notionPendingCount: (maxSeq, lastSeq) => this.notionPendingCount(maxSeq, lastSeq),
      repairNotionProjections: through => repairNotionProjections(this.ctx.storage, through),
      scheduleAlarmIn: delay => this.scheduleAlarmIn(delay),
      toNotionStatus: (state, maxSeq) => this.toNotionStatus(state, maxSeq),
      readNotionProjection: <T>(kind: string, key: string) => readNotionProjection<T>(this.ctx.storage, kind, key),
      createNotionContext: (sources, now) => this.createNotionContext(sources, now),
      recordDiagnostic: (destination, stage, code) => this.recordDiagnostic(destination, stage, code),
    });
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
    const maxSeq = await maxSequence(this.ctx.storage);
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
    if (!state.folders && (await maxSequence(this.ctx.storage)) === 0 && readAppStateRevision(this.ctx.storage) === 0) {
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

      const through = await maxSequence(this.ctx.storage);
      const events = readEventsThrough(this.ctx.storage, through);
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

  private performDriveSync(): Promise<DriveMirrorStatus> {
    return performDriveSync({
      env: this.env,
      storage: this.ctx.storage,
      getClient: () => this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch),
      currentClient: () => this.driveClient,
      getConfiguredDriveRootId: client => this.getConfiguredDriveRootId(client),
      getDriveStatus: () => this.getDriveStatus(),
      readDiagnosticStage: destination => this.readDiagnosticStage(destination),
      readDriveState: () => this.readDriveState(),
      recordDiagnostic: (destination, stage, code) => this.recordDiagnostic(destination, stage, code),
      saveDriveState: state => this.saveDriveState(state),
      scheduleAlarmIn: delay => this.scheduleAlarmIn(delay),
      writeDriveSnapshot: input => this.writeDriveSnapshot(input),
    });
  }




}
