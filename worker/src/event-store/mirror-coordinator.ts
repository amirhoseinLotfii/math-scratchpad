import { runMirrorAlarm } from './alarm';
import { isLearningResetLocked } from './reset-lock';
import { reconcileNotionResetReferences } from './notion-reset-reconciliation';
import { performWeeklyBackup } from './weekly-backup';
import { createNotionContext } from './notion-context';
import {
  getNotionStatus,
  notionPendingCount,
  notionStateQueueCount,
  queueNotionState,
  readNotionState,
  saveNotionState,
} from './notion-mirror-repository';
import { driveConfigured, getDriveStatus, getConfiguredDriveRootId, readDriveState, saveDriveState } from './drive-mirror-repository';
import { writeDriveSnapshot } from './drive-snapshot-repository';
import { recordDiagnostic, readDiagnosticStage } from './mirror-diagnostics';
import { readNotionProjection, repairNotionProjections } from './notion-projection-repository';
import { notionResetReconciliationPendingCount } from './reset-repository';
import { performNotionSync, type StoredNotionMirrorState } from './notion-mirror-service';
import { performDriveSync } from './drive-mirror-service';
import type { DriveMirrorStatus } from './drive-mirror-state';
import { maxSequence } from './event-repository';
import { DRIVE_DEBOUNCE_MS, MAX_MIRROR_SUBREQUESTS } from './limits';
import { DurableObject } from 'cloudflare:workers';
import type { WorkerEnv } from '../env';
import { GoogleDriveClient } from '../google-drive';
import {
  createNotionClient,
  notionDataSourcesFromEnv,
  NotionRequestQueue,
  type NotionClientPort,
  type NotionMirrorStatus,
} from '../notion-mirror';

type MirrorSubrequestBudget = { used: number; limit: number };
class MirrorSubrequestBudgetExceeded extends Error {
  readonly code = 'subrequest_budget_exceeded';
  constructor() {
    super('subrequest_budget_exceeded');
  }
}

export class EventStoreMirrors extends DurableObject<WorkerEnv> {
  protected driveClient: GoogleDriveClient | undefined;
  protected driveSyncPromise: Promise<DriveMirrorStatus> | undefined;
  protected weeklyBackupPromise: Promise<DriveMirrorStatus['weeklyBackup']> | undefined;
  protected driveOperationQueue: Promise<void> = Promise.resolve();
  private notionClient: NotionClientPort | undefined;
  protected notionSyncPromise: Promise<NotionMirrorStatus> | undefined;
  private readonly notionRequests = new NotionRequestQueue();
  private activeMirrorSubrequestBudget?: MirrorSubrequestBudget;
  protected readonly budgetedFetch: typeof fetch = (input, init) => {
    const budget = this.activeMirrorSubrequestBudget;
    if (budget) {
      if (budget.used >= budget.limit) throw new MirrorSubrequestBudgetExceeded();
      budget.used += 1;
    }
    return globalThis.fetch(input, init);
  };
  protected reconcileNotionResetReferences(resetId: string) {
    return reconcileNotionResetReferences(
      {
        storage: this.ctx.storage,
        env: this.env,
        ensureNotionClient: (apiKey) => {
          this.notionClient ??= createNotionClient(apiKey, this.budgetedFetch);
        },
        createContext: (sources, now) => createNotionContext(this.ctx.storage, this.notionClient!, this.notionRequests, sources, now),
      },
      resetId,
    );
  }

  alarm(): Promise<void> {
    return runMirrorAlarm({
      notionConfigured: () => !!notionDataSourcesFromEnv(this.env),
      driveConfigured: () => this.driveConfigured(),
      isLearningResetLocked: () => isLearningResetLocked(this.ctx.storage),
      withMirrorSubrequestBudget: (operation) => this.withMirrorSubrequestBudget(operation),
      syncNotion: () => this.syncNotion(),
      syncDrive: () => this.syncDrive(),
      readDriveState: () => readDriveState(this.ctx.storage),
      syncWeeklyBackup: () => this.syncWeeklyBackup(),
    });
  }

  protected async withMirrorSubrequestBudget<T>(operation: () => Promise<T>): Promise<{ value: T; used: number; limit: number }> {
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

  protected async mirrorStateChange(key: string, revision: number): Promise<void> {
    if (this.driveConfigured()) {
      const state = await readDriveState(this.ctx.storage);
      await saveDriveState(this.ctx.storage, {
        ...state,
        status: 'pending',
        pendingCount: Math.max(0, (await maxSequence(this.ctx.storage)) - state.lastSeq) + 1,
      });
      await this.scheduleAlarmIn(DRIVE_DEBOUNCE_MS);
    }
    await queueNotionState(this.notionQueueDependencies(), key, revision);
  }

  protected driveConfigured(): boolean {
    return driveConfigured(this.env);
  }

  protected notionQueueDependencies() {
    return {
      env: this.env,
      storage: this.ctx.storage,
      isLearningResetLocked: () => isLearningResetLocked(this.ctx.storage),
      scheduleAlarmIn: (delay: number) => this.scheduleAlarmIn(delay),
    };
  }

  private async scheduleAlarmIn(delayMs: number): Promise<void> {
    if (isLearningResetLocked(this.ctx.storage)) return;
    const requested = Date.now() + delayMs;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || requested < existing) await this.ctx.storage.setAlarm(requested);
  }

  protected async syncNotion(): Promise<NotionMirrorStatus> {
    if (isLearningResetLocked(this.ctx.storage)) return getNotionStatus(this.ctx.storage, this.env);
    const reconciliationPending = notionResetReconciliationPendingCount(this.ctx.storage);
    if (reconciliationPending > 0) {
      const current = await getNotionStatus(this.ctx.storage, this.env);
      return { ...current, status: 'pending', pendingCount: Math.max(current.pendingCount, reconciliationPending) };
    }
    if (!notionDataSourcesFromEnv(this.env)) return getNotionStatus(this.ctx.storage, this.env);
    if (this.notionSyncPromise) return this.notionSyncPromise;
    this.notionSyncPromise = this.performNotionSync().finally(() => {
      this.notionSyncPromise = undefined;
    });
    return this.notionSyncPromise;
  }

  private performNotionSync(): Promise<NotionMirrorStatus> {
    return performNotionSync({
      env: this.env,
      storage: this.ctx.storage,
      ensureClient: (apiKey) => {
        this.notionClient ??= createNotionClient(apiKey, this.budgetedFetch);
      },
      getNotionStatus: () => getNotionStatus(this.ctx.storage, this.env),
      readNotionState: () => readNotionState(this.ctx.storage),
      notionStateQueueCount: () => notionStateQueueCount(this.ctx.storage),
      saveNotionState: (state) => saveNotionState(this.ctx.storage, state),
      notionPendingCount: (maxSeq, lastSeq) => notionPendingCount(this.ctx.storage, maxSeq, lastSeq),
      repairNotionProjections: (through) => repairNotionProjections(this.ctx.storage, through),
      scheduleAlarmIn: (delay) => this.scheduleAlarmIn(delay),
      toNotionStatus: (state, maxSeq) => this.toNotionStatus(state, maxSeq),
      readNotionProjection: <T>(kind: string, key: string) => readNotionProjection<T>(this.ctx.storage, kind, key),
      createNotionContext: (sources, now) => createNotionContext(this.ctx.storage, this.notionClient!, this.notionRequests, sources, now),
      recordDiagnostic: (destination, stage, code) => recordDiagnostic(this.ctx.storage, destination, stage, code),
    });
  }

  private toNotionStatus(state: StoredNotionMirrorState, maxSeq: number): NotionMirrorStatus {
    return {
      status: state.status,
      lastSyncedAt: state.lastSyncedAt ?? null,
      pendingCount: notionPendingCount(this.ctx.storage, maxSeq, state.lastSeq),
      quarantinedCount: state.quarantinedCount ?? null,
      lastError: state.lastError ?? null,
    };
  }

  protected async queueDriveMirror(cursor: number): Promise<void> {
    if (!this.driveConfigured()) return;
    const state = await readDriveState(this.ctx.storage);
    if (cursor <= state.lastSeq) return;
    const maxSeq = await maxSequence(this.ctx.storage);
    await saveDriveState(this.ctx.storage, {
      ...state,
      status: 'pending',
      pendingCount: Math.max(0, maxSeq - state.lastSeq),
      // A newly queued event does not mean the previous Drive failure was fixed.
      lastError: state.lastError,
    });
    await this.scheduleAlarmIn(DRIVE_DEBOUNCE_MS);
  }

  protected syncWeeklyBackup(now = new Date()): Promise<DriveMirrorStatus['weeklyBackup']> {
    if (isLearningResetLocked(this.ctx.storage)) {
      return Promise.resolve({ status: 'scheduled', lastCreatedAt: null, lastError: null });
    }
    if (!this.driveConfigured()) {
      return Promise.resolve({ status: 'not_configured', lastCreatedAt: null, lastError: null });
    }
    if (this.weeklyBackupPromise) return this.weeklyBackupPromise;
    this.weeklyBackupPromise = this.withDriveOperation(() => this.performWeeklyBackup(now)).finally(() => {
      this.weeklyBackupPromise = undefined;
    });
    return this.weeklyBackupPromise;
  }

  /** Drive sync and scheduled backups share one persisted file manifest, so serialize their writes. */
  private withDriveOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.driveOperationQueue.then(operation, operation);
    this.driveOperationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private performWeeklyBackup(now = new Date()): Promise<DriveMirrorStatus['weeklyBackup']> {
    return performWeeklyBackup(
      {
        env: this.env,
        storage: this.ctx.storage,
        configured: () => this.driveConfigured(),
        getClient: () => (this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch)),
        scheduleAlarmIn: (delay) => this.scheduleAlarmIn(delay),
      },
      now,
    );
  }

  protected async syncDrive(): Promise<DriveMirrorStatus> {
    if (isLearningResetLocked(this.ctx.storage)) return getDriveStatus(this.ctx.storage, this.driveConfigured());
    if (!this.driveConfigured()) return getDriveStatus(this.ctx.storage, this.driveConfigured());
    if (this.driveSyncPromise) return this.driveSyncPromise;
    this.driveSyncPromise = this.withDriveOperation(() => this.performDriveSync()).finally(() => {
      this.driveSyncPromise = undefined;
    });
    return this.driveSyncPromise;
  }

  private performDriveSync(): Promise<DriveMirrorStatus> {
    return performDriveSync({
      env: this.env,
      storage: this.ctx.storage,
      getClient: () => (this.driveClient ??= new GoogleDriveClient(this.env, this.budgetedFetch)),
      currentClient: () => this.driveClient,
      getConfiguredDriveRootId: (client) => getConfiguredDriveRootId(this.env, client),
      getDriveStatus: () => getDriveStatus(this.ctx.storage, this.driveConfigured()),
      readDiagnosticStage: (destination) => readDiagnosticStage(this.ctx.storage, destination),
      readDriveState: () => readDriveState(this.ctx.storage),
      recordDiagnostic: (destination, stage, code) => recordDiagnostic(this.ctx.storage, destination, stage, code),
      saveDriveState: (state) => saveDriveState(this.ctx.storage, state),
      scheduleAlarmIn: (delay) => this.scheduleAlarmIn(delay),
      writeDriveSnapshot: (input) => writeDriveSnapshot(input),
    });
  }
}
