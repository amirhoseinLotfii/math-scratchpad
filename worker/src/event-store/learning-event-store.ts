import { EventStoreMirrors } from './mirror-coordinator';
import { parseRateLimit, consumeRateLimit } from './rate-limit';
import { isLearningResetLocked, requiredLearningClientEpoch, learningResetEpoch, isLearningOrMirrorRoute } from './reset-lock';
import { reconcileNotionResetReferences } from './notion-reset-reconciliation';
import { routeStoreRequest } from './router';
import { getNotionStatus, queueNotionMirror } from './notion-mirror-repository';
import { driveConfigured, getDriveStatus, readDriveState } from './drive-mirror-repository';
import { recordDiagnostic } from './mirror-diagnostics';
import {
  projectionSequence,
  setProjectionSequence,
  applyNotionProjection,
  rebuildNotionProjectionsFromEventLog,
} from './notion-projection-repository';
import type { ScopedResetDependencies } from './scoped-reset-preview';
import { executeLearningReset, releaseLearningReset } from './reset-service';
import { trashLearningMirrorFiles } from './reset-drive-mirror';
import { buildScopedResetSnapshot } from './scoped-reset-snapshot';
import { appendEvents } from './event-append';
import { initializeStoreSchema } from './schema';
import { writeAppState } from './state-repository';
import type { WorkerEnv } from '../env';
import { GoogleDriveClient } from '../google-drive';
import { notionDataSourcesFromEnv } from '../notion-mirror';
import { readBoundedBody } from '../body';
import {
  closeWebSocketsForSession,
  handleWebSocketMessage,
  openWebSocket,
  revalidateWebSockets,
  type WebSocketStorePorts,
} from './websocket';
import { isValidSessionHash, issueWebSocketTicketFromInternalRequest } from './websocket-ticket';
import { json } from './response';

const WEBSOCKET_REVALIDATION_INTERVAL_MS = 10 * 60_000;

/** One owner-scoped, append-only SQLite event log. */
export class LearningEventStore extends EventStoreMirrors {
  private readonly rateLimit: number;
  private bankClient: GoogleDriveClient | undefined;
  private activeLearningMutations = 0;
  /** Reset id currently executing in this isolate; a takeover must never race a live run. */
  private activeLearningResetId: string | undefined;
  private readonly learningMutationWaiters = new Set<() => void>();

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.rateLimit = parseRateLimit(env.EVENT_RATE_LIMIT);
    initializeStoreSchema(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return openWebSocket(this.webSocketPorts(), request);
    }
    return routeStoreRequest(request, {
      storage: this.ctx.storage,
      activeLearningResetId: this.activeLearningResetId,
      executeLearningReset: (req) => this.executeLearningReset(req),
      releaseLearningReset: (req) => this.releaseLearningReset(req),
      learningResetEpoch: () => learningResetEpoch(this.ctx.storage),
      isLearningResetLocked: () => isLearningResetLocked(this.ctx.storage),
      isLearningOrMirrorRoute: (path, method) => isLearningOrMirrorRoute(path, method),
      requiredLearningClientEpoch: () => requiredLearningClientEpoch(this.ctx.storage),
      consumeRateLimit: () => consumeRateLimit(this.ctx.storage, this.rateLimit),
      bankDriveClient: () => this.bankDriveClient(),
      withMirrorSubrequestBudget: (operation) => this.withMirrorSubrequestBudget(operation),
      syncWeeklyBackup: (now) => this.syncWeeklyBackup(now),
      syncDrive: () => this.syncDrive(),
      syncNotion: () => this.syncNotion(),
      recordDiagnostic: (destination, stage, code) => recordDiagnostic(this.ctx.storage, destination, stage, code),
      getDriveStatus: () => getDriveStatus(this.ctx.storage, this.driveConfigured()),
      getNotionStatus: () => getNotionStatus(this.ctx.storage, this.env),
      scopedResetDependencies: () => this.scopedResetDependencies(),
      writeState: (req) =>
        this.trackLearningMutation(() =>
          writeAppState(
            this.ctx.storage,
            req,
            () => isLearningResetLocked(this.ctx.storage),
            (key, revision) => this.mirrorStateChange(key, revision),
          ),
        ),
      appendEvents: (req) =>
        this.trackLearningMutation(() =>
          appendEvents(
            this.ctx.storage,
            req,
            () => isLearningResetLocked(this.ctx.storage),
            (seq, event) => {
              const projectedThrough = projectionSequence(this.ctx.storage);
              if (projectedThrough === seq - 1) {
                applyNotionProjection(this.ctx.storage, event);
                setProjectionSequence(this.ctx.storage, seq);
              }
            },
            async (cursor) => {
              await this.queueDriveMirror(cursor);
              await queueNotionMirror(this.notionQueueDependencies(), cursor);
            },
          ),
        ),
      issueWebSocketTicket: (req) => issueWebSocketTicketFromInternalRequest(this.ctx.storage, req),
      revokeWebSockets: (req) => this.revokeWebSockets(req),
    });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    this.ctx.waitUntil(handleWebSocketMessage(this.webSocketPorts(), socket, message));
  }

  async alarm(): Promise<void> {
    await super.alarm();
    revalidateWebSockets(this.webSocketPorts());
    const nextRevalidation = Date.now() + WEBSOCKET_REVALIDATION_INTERVAL_MS;
    const existingAlarm = await this.ctx.storage.getAlarm();
    if (existingAlarm === null || existingAlarm > nextRevalidation) await this.ctx.storage.setAlarm(nextRevalidation);
  }

  private webSocketPorts(): WebSocketStorePorts {
    return {
      ctx: this.ctx,
      env: this.env,
      appendEvents: (req) =>
        this.trackLearningMutation(() =>
          appendEvents(
            this.ctx.storage,
            req,
            () => isLearningResetLocked(this.ctx.storage),
            (seq, event) => {
              const projectedThrough = projectionSequence(this.ctx.storage);
              if (projectedThrough === seq - 1) {
                applyNotionProjection(this.ctx.storage, event);
                setProjectionSequence(this.ctx.storage, seq);
              }
            },
            async (cursor) => {
              await this.queueDriveMirror(cursor);
              await queueNotionMirror(this.notionQueueDependencies(), cursor);
            },
          ),
        ),
      writeState: (req) =>
        this.trackLearningMutation(() =>
          writeAppState(
            this.ctx.storage,
            req,
            () => isLearningResetLocked(this.ctx.storage),
            (key, revision) => this.mirrorStateChange(key, revision),
          ),
        ),
      requiredEpoch: () => requiredLearningClientEpoch(this.ctx.storage),
      resetLocked: () => isLearningResetLocked(this.ctx.storage),
    };
  }

  private async revokeWebSockets(request: Request): Promise<Response> {
    const body = await readBoundedBody(request, 4_096);
    if (!body) return json({ error: 'payload_too_large' }, 413);
    let input: { sessionHash?: unknown; all?: unknown };
    try {
      input = JSON.parse(new TextDecoder().decode(body)) ?? {};
    } catch {
      return json({ error: 'invalid_websocket_revoke' }, 400);
    }
    const sessionHash = isValidSessionHash(input.sessionHash) ? input.sessionHash : undefined;
    if (input.all !== true && !sessionHash) return json({ error: 'invalid_websocket_revoke' }, 400);
    return json({ closed: closeWebSocketsForSession(this.ctx, input.all === true ? undefined : sessionHash) });
  }

  private executeLearningReset(request: Request): Promise<Response> {
    return executeLearningReset(
      {
        env: this.env,
        storage: this.ctx.storage,
        activeReset: () => this.activeLearningResetId,
        setActiveReset: (id) => {
          this.activeLearningResetId = id;
        },
        waitForLearningMutations: () => this.waitForLearningMutations(),
        waitForMirrors: () =>
          Promise.allSettled([this.driveSyncPromise, this.weeklyBackupPromise, this.notionSyncPromise, this.driveOperationQueue]),
        trashLearningMirrorFiles: (bankFileId) =>
          trashLearningMirrorFiles(
            this.env,
            this.driveConfigured(),
            () => readDriveState(this.ctx.storage),
            () => (this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch)),
            bankFileId,
          ),
        reconcileNotionResetReferences: (resetId) => this.reconcileNotionResetReferences(resetId),
        driveFailureStage: () => this.driveClient?.diagnosticStage,
        recordDiagnostic: (destination, stage, code) => recordDiagnostic(this.ctx.storage, destination, stage, code),
      },
      request,
    );
  }

  private releaseLearningReset(request: Request): Promise<Response> {
    return releaseLearningReset(this.ctx.storage, request);
  }

  private async trackLearningMutation(operation: () => Promise<Response>): Promise<Response> {
    this.activeLearningMutations += 1;
    try {
      return await operation();
    } finally {
      this.activeLearningMutations -= 1;
      if (this.activeLearningMutations === 0) {
        for (const resolve of this.learningMutationWaiters) resolve();
        this.learningMutationWaiters.clear();
      }
    }
  }

  private async waitForLearningMutations(): Promise<void> {
    if (this.activeLearningMutations === 0) return;
    await new Promise<void>((resolve) => this.learningMutationWaiters.add(resolve));
  }

  private bankDriveClient(): GoogleDriveClient {
    this.bankClient ??= new GoogleDriveClient(this.env, this.budgetedFetch);
    return this.bankClient;
  }

  private scopedResetDependencies(): ScopedResetDependencies {
    return {
      env: this.env,
      storage: this.ctx.storage,
      isLearningResetLocked: () => isLearningResetLocked(this.ctx.storage),
      snapshot: (scope) =>
        buildScopedResetSnapshot(
          this.ctx.storage,
          {
            drive: this.driveConfigured(),
            notion: Boolean(notionDataSourcesFromEnv(this.env) && this.env.NOTION_API_KEY),
          },
          scope,
        ),
      rebuildNotionProjections: () => rebuildNotionProjectionsFromEventLog(this.ctx.storage),
    };
  }
}
