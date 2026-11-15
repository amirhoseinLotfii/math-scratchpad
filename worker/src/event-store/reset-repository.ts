export function clearLearningRecords(storage: DurableObjectStorage): {
  deletedLearningEvents: number;
  deletedAppStateRecords: number;
  deletedNotionProjectionRecords: number;
  deletedNotionReferences: number;
  retainedNotionReferences: number;
  pendingNotionReconciliation: number;
  deletedQueuedMirrorRecords: number;
  bankSourceRecords: number;
  activeAuthSessions: number;
  preservedIdentityAndDriveConfigRecords: number;
} {
  return storage.transactionSync(() => {
    const count = (sql: string, ...args: Array<string | number>) => Number(storage.sql.exec<{ count: number }>(sql, ...args).one().count);
    const summary = {
      deletedLearningEvents: count('SELECT COUNT(*) AS count FROM learning_events'),
      deletedAppStateRecords: count(
        "SELECT COUNT(*) AS count FROM app_state WHERE key NOT IN ('math-scratchpad-device-id-v1','math-scratchpad-drive-config-v1')",
      ),
      deletedNotionProjectionRecords: count('SELECT COUNT(*) AS count FROM notion_projections'),
      deletedNotionReferences: 0,
      retainedNotionReferences: count('SELECT COUNT(*) AS count FROM notion_page_refs'),
      pendingNotionReconciliation: notionResetReconciliationPendingCount(storage),
      deletedQueuedMirrorRecords:
        count('SELECT COUNT(*) AS count FROM notion_state_queue') +
        count('SELECT COUNT(*) AS count FROM notion_mistake_reviews') +
        count('SELECT COUNT(*) AS count FROM notion_session_mistakes'),
      bankSourceRecords: count('SELECT COUNT(*) AS count FROM bank_source'),
      activeAuthSessions: count('SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?', Date.now()),
      preservedIdentityAndDriveConfigRecords: count(
        "SELECT COUNT(*) AS count FROM app_state WHERE key IN ('math-scratchpad-device-id-v1','math-scratchpad-drive-config-v1')",
      ),
    };
    storage.sql.exec('DELETE FROM learning_events');
    storage.sql.exec("DELETE FROM app_state WHERE key NOT IN ('math-scratchpad-device-id-v1','math-scratchpad-drive-config-v1')");
    storage.sql.exec('UPDATE app_state_meta SET revision = 0 WHERE singleton = 1');
    storage.sql.exec('DELETE FROM notion_projections');
    storage.sql.exec('UPDATE notion_projection_meta SET last_seq = 0 WHERE singleton = 1');
    storage.sql.exec('DELETE FROM notion_state_queue');
    storage.sql.exec('DELETE FROM notion_mistake_reviews');
    storage.sql.exec('DELETE FROM notion_session_mistakes');
    storage.sql.exec('DELETE FROM sync_health');
    storage.sql.exec('DELETE FROM mirror_diagnostics');
    storage.sql.exec('DELETE FROM rate_windows');
    storage.sql.exec("DELETE FROM sqlite_sequence WHERE name = 'learning_events'");
    return summary;
  });
}

export function journalNotionResetReferences(storage: DurableObjectStorage, resetId: string): number {
  const refs = storage.sql
    .exec<{
      kind: string;
      external_key: string;
      page_id: string;
    }>('SELECT kind, external_key, page_id FROM notion_page_refs ORDER BY kind, external_key')
    .toArray();
  const now = new Date().toISOString();
  storage.transactionSync(() => {
    for (const ref of refs) {
      const status = ['attempt', 'app-state', 'chapter-snapshot', 'mistake', 'concept', 'daily'].includes(ref.kind)
        ? 'pending'
        : 'protected';
      storage.sql.exec(
        'INSERT OR IGNORE INTO notion_reset_reconciliation (reset_id, kind, external_key, page_id, owner_marker, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        resetId,
        ref.kind,
        ref.external_key,
        ref.page_id,
        'math-scratchpad',
        status,
        now,
      );
    }
  });
  return refs.length;
}

export function notionResetReconciliationPendingCount(storage: DurableObjectStorage, resetId?: string): number {
  const row =
    resetId === undefined
      ? storage.sql
          .exec<{
            count: number;
          }>(`SELECT COUNT(*) AS count FROM notion_reset_reconciliation WHERE status IN ('pending', 'retry', 'ownership_unverified')`)
          .one()
      : storage.sql
          .exec<{
            count: number;
          }>(`SELECT COUNT(*) AS count FROM notion_reset_reconciliation WHERE reset_id = ? AND status IN ('pending', 'retry', 'ownership_unverified')`, resetId)
          .one();
  return Number(row.count);
}
