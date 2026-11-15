import type { WorkerEnv } from '../env';
import {
  archiveVerifiedNotionResetPage,
  notionDataSourcesFromEnv,
  notionErrorCode,
  type NotionDataSources,
  type NotionEventContext,
} from '../notion-mirror';
import { notionResetReconciliationPendingCount } from './reset-repository';
import { NOTION_RESET_RECONCILIATION_PER_CALL } from './limits';

type NotionResetDependencies = {
  storage: DurableObjectStorage;
  env: WorkerEnv;
  ensureNotionClient: (apiKey: string) => void;
  createContext: (sources: NotionDataSources, now: string) => NotionEventContext;
};

export async function reconcileNotionResetReferences(
  deps: NotionResetDependencies,
  resetId: string,
): Promise<{
  archived: number;
  protected: number;
  unverified: number;
  retryable: number;
  pending: number;
}> {
  const dataSources = notionDataSourcesFromEnv(deps.env);
  if (!dataSources || !deps.env.NOTION_API_KEY) {
    return {
      archived: 0,
      protected: 0,
      unverified: 0,
      retryable: 0,
      pending: notionResetReconciliationPendingCount(deps.storage, resetId),
    };
  }
  deps.ensureNotionClient(deps.env.NOTION_API_KEY);
  const rows = deps.storage.sql
    .exec<{
      kind: string;
      external_key: string;
      page_id: string;
      owner_marker: string;
      attempts: number;
    }>(
      `SELECT kind, external_key, page_id, owner_marker, attempts FROM notion_reset_reconciliation
     WHERE reset_id = ? AND status IN ('pending', 'retry', 'ownership_unverified') ORDER BY kind, external_key LIMIT ?`,
      resetId,
      NOTION_RESET_RECONCILIATION_PER_CALL,
    )
    .toArray();
  const totals = { archived: 0, protected: 0, unverified: 0, retryable: 0, pending: 0 };
  for (const row of rows) {
    const now = new Date().toISOString();
    if (row.owner_marker !== 'math-scratchpad') {
      deps.storage.sql.exec(
        `UPDATE notion_reset_reconciliation SET status = 'ownership_unverified', attempts = attempts + 1,
         last_attempt_at = ?, last_error = 'ownership_marker_mismatch' WHERE reset_id = ? AND kind = ? AND external_key = ?`,
        now,
        resetId,
        row.kind,
        row.external_key,
      );
      totals.unverified += 1;
      continue;
    }
    try {
      const result = await archiveVerifiedNotionResetPage(deps.createContext(dataSources, now), {
        kind: row.kind,
        externalKey: row.external_key,
        pageId: row.page_id,
      });
      if (result === 'archived') {
        deps.storage.transactionSync(() => {
          deps.storage.sql.exec(
            `UPDATE notion_reset_reconciliation SET status = 'archived', attempts = attempts + 1,
             last_attempt_at = ?, last_error = NULL, reconciled_at = ? WHERE reset_id = ? AND kind = ? AND external_key = ?`,
            now,
            now,
            resetId,
            row.kind,
            row.external_key,
          );
          deps.storage.sql.exec(
            'DELETE FROM notion_page_refs WHERE kind = ? AND external_key = ? AND page_id = ?',
            row.kind,
            row.external_key,
            row.page_id,
          );
        });
        totals.archived += 1;
      } else if (result === 'protected') {
        deps.storage.sql.exec(
          `UPDATE notion_reset_reconciliation SET status = 'protected', attempts = attempts + 1,
           last_attempt_at = ?, last_error = NULL WHERE reset_id = ? AND kind = ? AND external_key = ?`,
          now,
          resetId,
          row.kind,
          row.external_key,
        );
        totals.protected += 1;
      } else {
        deps.storage.sql.exec(
          `UPDATE notion_reset_reconciliation SET status = 'ownership_unverified', attempts = attempts + 1,
           last_attempt_at = ?, last_error = 'ownership_unverified' WHERE reset_id = ? AND kind = ? AND external_key = ?`,
          now,
          resetId,
          row.kind,
          row.external_key,
        );
        totals.unverified += 1;
      }
    } catch (error) {
      deps.storage.sql.exec(
        `UPDATE notion_reset_reconciliation SET status = 'retry', attempts = attempts + 1,
         last_attempt_at = ?, last_error = ? WHERE reset_id = ? AND kind = ? AND external_key = ?`,
        now,
        notionErrorCode(error),
        resetId,
        row.kind,
        row.external_key,
      );
      totals.retryable += 1;
    }
  }
  totals.pending = notionResetReconciliationPendingCount(deps.storage, resetId);
  return totals;
}

/** Separate from the mirror client so bank reads never overwrite mirror diagnostics. */
