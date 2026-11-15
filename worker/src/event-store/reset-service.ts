import { LEARNING_RESET_EPOCH } from '../../../shared/contracts/reset-epoch';
import { readBoundedBody } from '../body';
import type { WorkerEnv } from '../env';
import { DriveMirrorError } from '../google-drive';
import { notionDataSourcesFromEnv } from '../notion-mirror';
import { DRIVE_STATE_KEY, LEARNING_RESET_TABLE, NOTION_MIRROR_STATE_KEY } from './limits';
import { clearLearningRecords, journalNotionResetReferences, notionResetReconciliationPendingCount } from './reset-repository';
import type { trashLearningMirrorFiles } from './reset-drive-mirror';
import { json } from './response';

type ResetDependencies = {
  env: WorkerEnv;
  storage: DurableObjectStorage;
  activeReset: () => string | undefined;
  setActiveReset: (id: string | undefined) => void;
  waitForLearningMutations: () => Promise<void>;
  waitForMirrors: () => Promise<unknown>;
  trashLearningMirrorFiles: (bankFileId?: string) => ReturnType<typeof trashLearningMirrorFiles>;
  reconcileNotionResetReferences: (resetId: string) => Promise<{
    archived: number;
    protected: number;
    unverified: number;
    retryable: number;
    pending: number;
  }>;
  driveFailureStage: () => string | undefined;
  recordDiagnostic: (destination: 'drive', stage: string, code: string) => void;
};

/** Retryable coordinated reset. The public entry point requires a temporary Worker secret. */
export async function executeLearningReset(deps: ResetDependencies, request: Request): Promise<Response> {
  const body = await readBoundedBody(request, 4_096);
  if (!body) return json({ error: 'payload_too_large' }, 413);
  let input: { resetId?: unknown; takeover?: unknown };
  try {
    input = JSON.parse(new TextDecoder().decode(body)) ?? {};
  } catch {
    return json({ error: 'invalid_reset_request' }, 400);
  }
  if (typeof input.resetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.resetId)) {
    return json({ error: 'invalid_reset_request' }, 400);
  }
  const resetId = input.resetId;
  const takeover = input.takeover === true;
  if (takeover && deps.activeReset() && deps.activeReset() !== resetId) {
    return json({ error: 'learning_reset_active' }, 409);
  }
  const claim = deps.storage.transactionSync(() => {
    const current = deps.storage.sql
      .exec<{ status: string; reset_id: string | null }>(`SELECT status, reset_id FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`)
      .one();
    // An explicit admin takeover lets a new reset id claim a lock orphaned by a lost reset id.
    const orphanTakeover = takeover && current.reset_id !== resetId;
    if (current.status === 'running' && current.reset_id !== resetId && !orphanTakeover) return 'in_progress';
    if (current.status === 'running' && current.reset_id === resetId) return 'claimed';
    if (current.status === 'awaiting_release' && !orphanTakeover) return current.reset_id === resetId ? 'awaiting_release' : 'in_progress';
    if (current.status === 'released' && current.reset_id === resetId) return 'complete';
    deps.storage.sql.exec(
      `UPDATE ${LEARNING_RESET_TABLE} SET status = 'running', reset_id = ?, completed_at = NULL, client_epoch = ? WHERE singleton = 1`,
      resetId,
      crypto.randomUUID(),
    );
    return 'claimed';
  });
  if (claim === 'in_progress') return json({ error: 'learning_reset_in_progress' }, 409);
  if (claim === 'awaiting_release' || claim === 'complete') {
    const dataSources = notionDataSourcesFromEnv(deps.env);
    if (dataSources && deps.env.NOTION_API_KEY && notionResetReconciliationPendingCount(deps.storage, resetId) > 0) {
      deps.setActiveReset(resetId);
      try {
        const notion = await deps.reconcileNotionResetReferences(resetId);
        if (claim === 'awaiting_release') return json({ completed: true, releaseRequired: true, notion });
        return json({ completed: true, releaseRequired: false, notion });
      } finally {
        if (deps.activeReset() === resetId) deps.setActiveReset(undefined);
      }
    }
    if (claim === 'complete') return json({ error: 'learning_reset_already_complete' }, 409);
    return json({
      completed: true,
      releaseRequired: true,
      notion: { pending: notionResetReconciliationPendingCount(deps.storage, resetId) },
    });
  }

  deps.setActiveReset(resetId);
  try {
    await deps.waitForLearningMutations();
    await deps.waitForMirrors();
    await deps.storage.deleteAlarm();

    const bankFileId = deps.storage.sql
      .exec<{ file_id: string }>('SELECT file_id FROM bank_source WHERE singleton = 1')
      .toArray()[0]?.file_id;
    const driveResult = await deps.trashLearningMirrorFiles(bankFileId);
    if (driveResult.remainingLearningMirrors) {
      // Partial Drive progress: keep the lock and every cloud record until a later retry finishes Drive.
      return json({ completed: false, inProgress: true, drive: driveResult, retryWithSameResetId: true }, 202);
    }
    journalNotionResetReferences(deps.storage, resetId);
    const dataSources = notionDataSourcesFromEnv(deps.env);
    const notion =
      dataSources && deps.env.NOTION_API_KEY
        ? await deps.reconcileNotionResetReferences(resetId)
        : { archived: 0, protected: 0, unverified: 0, retryable: 0, pending: notionResetReconciliationPendingCount(deps.storage, resetId) };
    if (notion.pending > 0 && dataSources && deps.env.NOTION_API_KEY) {
      return json({ completed: false, inProgress: true, notion, retryWithSameResetId: true }, 202);
    }
    const cloudResult = clearLearningRecords(deps.storage);
    await deps.storage.delete(DRIVE_STATE_KEY);
    await deps.storage.delete(NOTION_MIRROR_STATE_KEY);
    await deps.storage.deleteAlarm();
    deps.storage.transactionSync(() => {
      deps.storage.sql.exec(
        `UPDATE ${LEARNING_RESET_TABLE} SET status = 'awaiting_release', completed_at = ? WHERE singleton = 1 AND reset_id = ?`,
        new Date().toISOString(),
        resetId,
      );
    });
    return json({
      completed: true,
      releaseRequired: true,
      drive: driveResult,
      cloud: cloudResult,
      notion,
      preserved: { bankSourceRecords: cloudResult.bankSourceRecords, activeAuthSessions: cloudResult.activeAuthSessions },
    });
  } catch (error) {
    const code = error instanceof DriveMirrorError ? error.code : 'reset_failed';
    const failureStage = deps.driveFailureStage() ?? 'worker_internal';
    const safeStage = `drive_reset:${failureStage}`.slice(0, 64);
    deps.recordDiagnostic('drive', safeStage, code);
    return json({ error: 'learning_reset_incomplete', code, failureStage: safeStage, retryWithSameResetId: true }, 502);
  } finally {
    if (deps.activeReset() === resetId) deps.setActiveReset(undefined);
  }
}

/** Read-only lock state for the admin; never returns the reset id itself. */
export function learningResetStatus(storage: DurableObjectStorage, active: boolean): Response {
  const current = storage.sql
    .exec<{
      status: string;
      reset_id: string | null;
      completed_at: string | null;
    }>(`SELECT status, reset_id, completed_at FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`)
    .one();
  return json({
    status: current.status,
    hasResetId: current.reset_id !== null,
    completedAt: current.completed_at,
    activeInThisInstance: active,
  });
}

/** Public clients need only the lock state and current/candidate epoch to recover safely. */
export function learningResetClientStatus(storage: DurableObjectStorage, consumeRateLimit: () => Response | null): Response {
  const rate = consumeRateLimit();
  if (rate) return rate;
  const current = storage.sql
    .exec<{ status: string; client_epoch: string | null }>(`SELECT status, client_epoch FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`)
    .one();
  const status = ['idle', 'running', 'awaiting_release', 'released'].includes(current.status) ? current.status : 'running';
  return json({ status, epoch: current.client_epoch ?? LEARNING_RESET_EPOCH });
}

export async function releaseLearningReset(storage: DurableObjectStorage, request: Request): Promise<Response> {
  const body = await readBoundedBody(request, 4_096);
  if (!body) return json({ error: 'payload_too_large' }, 413);
  let input: { resetId?: unknown };
  try {
    input = JSON.parse(new TextDecoder().decode(body)) ?? {};
  } catch {
    return json({ error: 'invalid_reset_request' }, 400);
  }
  if (typeof input.resetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.resetId)) {
    return json({ error: 'invalid_reset_request' }, 400);
  }
  const status = storage.transactionSync(() => {
    const current = storage.sql
      .exec<{
        status: string;
        reset_id: string | null;
        client_epoch: string | null;
      }>(`SELECT status, reset_id, client_epoch FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`)
      .one();
    if (current.status === 'released' && current.reset_id === input.resetId) {
      if (!current.client_epoch) {
        storage.sql.exec(
          `UPDATE ${LEARNING_RESET_TABLE} SET client_epoch = ? WHERE singleton = 1 AND reset_id = ?`,
          crypto.randomUUID(),
          input.resetId,
        );
      }
      return 'released';
    }
    if (current.status !== 'awaiting_release' || current.reset_id !== input.resetId) return 'not_ready';
    const clientEpoch = current.client_epoch ?? crypto.randomUUID();
    storage.sql.exec(
      `UPDATE ${LEARNING_RESET_TABLE} SET status = 'released', client_epoch = ? WHERE singleton = 1 AND reset_id = ?`,
      clientEpoch,
      input.resetId,
    );
    return 'released';
  });
  if (status !== 'released') return json({ error: 'learning_reset_not_ready' }, 409);
  return json({ released: true });
}
