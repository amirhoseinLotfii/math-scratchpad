import type { WorkerEnv } from '../env';
import { notionDataSourcesFromEnv } from '../notion-mirror';
import { LEARNING_RESET_TABLE, SCOPED_RESET_OPERATIONS_TABLE } from './limits';
export function initializeStoreSchema(ctx: DurableObjectState, env: WorkerEnv): void {
  // Queryable operational mirror status: unlike internal Durable Object KV,
  // this can be inspected through the authenticated Cloudflare SQL console.
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS sync_health (destination TEXT PRIMARY KEY, status TEXT NOT NULL, pending_count INTEGER NOT NULL, last_error TEXT, last_synced_at TEXT, updated_at TEXT NOT NULL)',
  );
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS mirror_diagnostics (destination TEXT PRIMARY KEY, failure_stage TEXT NOT NULL, error_code TEXT NOT NULL, updated_at TEXT NOT NULL)',
  );
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS mirror_configuration (destination TEXT PRIMARY KEY, configured INTEGER NOT NULL, updated_at TEXT NOT NULL)',
  );
  const configuration = [
    ['drive', Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN)],
    ['notion', Boolean(notionDataSourcesFromEnv(env))],
  ] as const;
  for (const [destination, configured] of configuration) {
    ctx.storage.sql.exec(
      'INSERT INTO mirror_configuration(destination,configured,updated_at) VALUES(?,?,?) ON CONFLICT(destination) DO UPDATE SET configured=excluded.configured,updated_at=excluded.updated_at',
      destination,
      configured ? 1 : 0,
      new Date().toISOString(),
    );
  }

  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)',
  );
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS app_state_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision INTEGER NOT NULL)',
  );
  ctx.storage.sql.exec('INSERT OR IGNORE INTO app_state_meta (singleton, revision) VALUES (1, 0)');
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS notion_projections (projection_type TEXT NOT NULL, projection_key TEXT NOT NULL, projection_json TEXT NOT NULL, PRIMARY KEY (projection_type, projection_key))',
  );
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS notion_projection_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), last_seq INTEGER NOT NULL)',
  );
  ctx.storage.sql.exec('INSERT OR IGNORE INTO notion_projection_meta (singleton, last_seq) VALUES (1, 0)');
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS notion_page_refs (kind TEXT NOT NULL, external_key TEXT NOT NULL, page_id TEXT NOT NULL, PRIMARY KEY (kind, external_key))',
  );
  ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS notion_reset_reconciliation (
      reset_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      external_key TEXT NOT NULL,
      page_id TEXT NOT NULL,
      owner_marker TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      reconciled_at TEXT,
      PRIMARY KEY (reset_id, kind, external_key)
    )`);
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notion_state_queue (key TEXT PRIMARY KEY, revision INTEGER NOT NULL)');
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS notion_mistake_reviews (item_key TEXT PRIMARY KEY, event_id TEXT NOT NULL, review_successes INTEGER NOT NULL, last_review_event_id TEXT)',
  );
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS notion_session_mistakes (session_id TEXT NOT NULL, page_id TEXT NOT NULL, PRIMARY KEY (session_id, page_id))',
  );
  ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS learning_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL,
        event_ts TEXT NOT NULL
      )
    `);
  // Worker sessions: only SHA-256 digests of the bearer values are stored.
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, sub TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER)',
  );
  // The question-bank file the owner picked once with Google Picker (drive.file grant for this OAuth app).
  ctx.storage.sql.exec(
    'CREATE TABLE IF NOT EXISTS bank_source (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), file_id TEXT NOT NULL, file_name TEXT NOT NULL, registered_at TEXT NOT NULL)',
  );
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
  if (!resetColumns.some((column) => column.name === 'client_epoch')) {
    ctx.storage.sql.exec(`ALTER TABLE ${LEARNING_RESET_TABLE} ADD COLUMN client_epoch TEXT`);
  }
  ctx.storage.sql.exec(`INSERT OR IGNORE INTO ${LEARNING_RESET_TABLE} (singleton, status, reset_id) VALUES (1, 'idle', NULL)`);
  ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS ${SCOPED_RESET_OPERATIONS_TABLE} (
      operation_id TEXT PRIMARY KEY,
      scope_json TEXT NOT NULL,
      snapshot_token TEXT NOT NULL,
      state TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
}
