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

  fetch(request: Request): Promise<Response> {
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
    });
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
