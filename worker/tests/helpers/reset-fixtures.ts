import { OWNER_EMAIL } from './sync-worker';
type SqlFixture = { exec: (sql: string, ...bindings: Array<string | number | null>) => unknown };
export async function seedResetData(storage: { sql: SqlFixture; put: (key: string, value: unknown) => Promise<void> }) {
  const { sql } = storage;
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  sql.exec(
    'INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)',
    'reset-event',
    '{"id":"reset-event","type":"attempt"}',
    timestamp,
  );
  sql.exec(
    'INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?)',
    'math-scratchpad-device-id-v1',
    '"device-safe"',
    1,
    timestamp,
  );
  sql.exec(
    'INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?)',
    'math-scratchpad-drive-config-v1',
    '{"fileId":"bank-protected"}',
    2,
    timestamp,
  );
  sql.exec(
    'INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?)',
    'math-scratchpad-session-v3',
    '{"draft":true}',
    3,
    timestamp,
  );
  sql.exec('UPDATE app_state_meta SET revision = 3 WHERE singleton = 1');
  sql.exec(
    'INSERT INTO bank_source (singleton, file_id, file_name, registered_at) VALUES (1, ?, ?, ?)',
    'bank-protected',
    'question-bank.json',
    timestamp,
  );
  sql.exec(
    'INSERT INTO auth_sessions (token_hash, email, sub, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    'a'.repeat(64),
    OWNER_EMAIL,
    'test-subject',
    now,
    now + 60_000,
  );
  sql.exec(
    'INSERT INTO notion_projections (projection_type, projection_key, projection_json) VALUES (?, ?, ?)',
    'attempt',
    'reset-event',
    '{"event":"reset-event"}',
  );
  sql.exec('INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'attempt', 'reset-event', 'notion-page');
  sql.exec('INSERT INTO notion_state_queue (key, revision) VALUES (?, ?)', 'math-scratchpad-session-v3', 3);
  sql.exec(
    'INSERT INTO notion_mistake_reviews (item_key, event_id, review_successes, last_review_event_id) VALUES (?, ?, ?, ?)',
    'mistake-1',
    'reset-event',
    1,
    'reset-event',
  );
  sql.exec('INSERT INTO notion_session_mistakes (session_id, page_id) VALUES (?, ?)', 'session-1', 'notion-mistake-page');
  sql.exec('UPDATE notion_projection_meta SET last_seq = 1 WHERE singleton = 1');
  await storage.put('drive-mirror-state-v1', {
    status: 'synced',
    lastSeq: 1,
    pendingCount: 0,
    folders: {
      rootId: 'root-folder',
      syncId: 'sync-folder',
      eventsId: 'events-folder',
      stateId: 'state-folder',
      backupsId: 'backup-folder',
    },
    files: {},
    fileHashes: {},
    snapshots: {},
  });
  await storage.put('notion-mirror-state-v1', { status: 'synced', lastSeq: 1, pendingCount: 0 });
}
