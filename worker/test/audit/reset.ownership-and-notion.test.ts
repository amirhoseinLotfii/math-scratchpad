import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';
import type { NotionClientPort } from '../../src/notion-mirror';

type Target = {
  env: WorkerEnv;
  ctx: { storage: { sql: { exec: <T = Record<string, unknown>>(sql: string, ...args: Array<string | number | null>) => { one: () => T; toArray: () => T[] } } } };
  driveConfigured: () => boolean;
  driveClient: unknown;
  notionClient?: NotionClientPort;
  journalNotionResetReferences: (resetId: string) => number;
  reconcileNotionResetReferences: (resetId: string) => Promise<{ archived: number; protected: number; unverified: number; retryable: number; pending: number }>;
  executeLearningReset: (req: Request) => Promise<Response>;
};
const request = () => new Request('https://local.test/internal/learning-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId: crypto.randomUUID() }) });
const resetRequest = (resetId: string) => new Request('https://local.test/internal/learning-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }) });
const stubFor = (name: string) => { const e = env as unknown as WorkerEnv; return e.EVENT_STORE.get(e.EVENT_STORE.idFromName(name)); };
const notionBindings = {
  NOTION_API_KEY: 'test-notion-key',
  NOTION_DATA_SOURCE_ATTEMPTS: '0303207d-a6a8-4631-9fa8-3b09942e9046',
  NOTION_DATA_SOURCE_SESSIONS: '87f156ae-7937-4fbe-9301-103c7dfb57a7',
  NOTION_DATA_SOURCE_MISTAKES: 'c94b70b8-1ca5-4ddc-9519-edc43a075cc4',
  NOTION_DATA_SOURCE_CONCEPTS: 'e2f2f7a0-dfb8-424a-b464-fb8af13566c7',
  NOTION_DATA_SOURCE_DAILY_REPORTS: '6c154e26-ac84-4537-a66a-9e6be62d4f23',
};
const notionBindingKeys = Object.keys(notionBindings) as Array<keyof typeof notionBindings>;

it('reset.preserves-unmarked-matching-filename', async () => {
  await runInDurableObject(stubFor('synthetic-ownership'), async instance => {
    const target = instance as unknown as Target;
    const trashed: Array<{ id: string; kind: string }> = [];
    const listedFolders: string[] = [];
    const owned = (kind: string) => ({ msOwner: 'math-scratchpad', msKind: kind });
    target.driveConfigured = () => true;
    target.ctx.storage.sql.exec(
      'INSERT INTO bank_source (singleton, file_id, file_name, registered_at) VALUES (1, ?, ?, ?)',
      'bank-protected', 'question-bank.json', new Date().toISOString(),
    );
    target.driveClient = {
      findFolderId: async (name: string) => ({
        Math_Project: 'root-id', '03_Sync': 'sync-id', events: 'events-id', state: 'state-id', '06_Backups': 'backups-id',
      } as Record<string, string>)[name],
      readFileMetadata: async (id: string) => {
        const folders: Record<string, { name: string; parent: string }> = {
          'root-id': { name: 'Math_Project', parent: 'root' },
          'sync-id': { name: '03_Sync', parent: 'root-id' },
          'events-id': { name: 'events', parent: 'sync-id' },
          'state-id': { name: 'state', parent: 'sync-id' },
          'backups-id': { name: '06_Backups', parent: 'root-id' },
        };
        const folder = folders[id];
        return { id, name: folder.name, mimeType: 'application/vnd.google-apps.folder', parents: [folder.parent], trashed: false };
      },
      listFilesInFolder: async (id: string) => {
        listedFolders.push(id);
        const child = (fileId: string, name: string, parent: string, appProperties?: Record<string, string>) => ({
          id: fileId, name, mimeType: 'application/json', parents: [parent], appProperties,
        });
        if (id === 'sync-id') return [child('sync-unrelated', 'sync_manifest.json', id, { msOwner: 'notion-pomodoro', msKind: 'state' })];
        if (id === 'events-id') return [
          child('owned-event', 'events_2026-11.sha256-' + 'a'.repeat(64) + '.jsonl', id, owned('events')),
          child('foreign-event', 'events_2026-11.sha256-' + 'b'.repeat(64) + '.jsonl', id, { msOwner: 'notion-pomodoro', msKind: 'events' }),
          child('similar-event', 'events_2026-11.jsonl.backup', id, owned('events')),
        ];
        if (id === 'state-id') return [
          child('unowned-file', 'progress.json', id),
          child('owned-progress', 'progress.sha256-' + 'c'.repeat(64) + '.json', id, owned('state')),
          child('bank-protected', 'progress.sha256-' + 'd'.repeat(64) + '.json', id, owned('state')),
        ];
        if (id === 'backups-id') return [
          child('foreign-backup', 'sync_backup_2026-11-13.sha256-' + 'e'.repeat(64) + '.json', id, { msOwner: 'notion-pomodoro', msKind: 'backups' }),
        ];
        return [];
      },
      trashFileInFolder: async (id: string, _parentId: string, kind: string) => { trashed.push({ id, kind }); return true; },
    };
    expect((await target.executeLearningReset(request())).status).toBe(200);
    expect(trashed).toEqual([{ id: 'owned-event', kind: 'events' }, { id: 'owned-progress', kind: 'state' }]);
    expect(listedFolders).toContain('sync-id');
  });
});

it('reset.retains-notion-reference-until-external-reconciliation', async () => {
  await runInDurableObject(stubFor('synthetic-notion-reconciliation'), async instance => {
    const target = instance as unknown as Target;
    target.driveConfigured = () => false;
    target.ctx.storage.sql.exec('INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'attempt', 'synthetic-event', 'synthetic-page');
    expect((await target.executeLearningReset(request())).status).toBe(200);
    const row = target.ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM notion_page_refs').one();
    expect(Number(row.count)).toBe(1);
    expect(target.ctx.storage.sql.exec('SELECT status FROM notion_reset_reconciliation').one()).toEqual({ status: 'pending' });
  });
});

it('reset.mocked-notion-failure-retains-reference-and-retry-journal', async () => {
  await runInDurableObject(stubFor('synthetic-notion-retry'), async instance => {
    const target = instance as unknown as Target;
    const originalBindings = Object.fromEntries(notionBindingKeys.map(key => [key, target.env[key]]));
    const resetId = crypto.randomUUID();
    Object.assign(target.env, notionBindings);
    target.driveConfigured = () => false;
    target.notionClient = {
      dataSources: { query: async () => ({ results: [] }) },
      pages: {
        create: async () => ({ id: 'unused' }),
        retrieve: async () => { throw Object.assign(new Error('temporary test outage'), { status: 503 }); },
        update: async () => ({ id: 'unused' }),
      },
    };
    target.ctx.storage.sql.exec(
      'INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'attempt', 'retry-event', 'retry-page',
    );
    try {
      const response = await target.executeLearningReset(resetRequest(resetId));
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ completed: false, retryWithSameResetId: true, notion: { retryable: 1, pending: 1 } });
      expect(target.ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM notion_page_refs').one()).toEqual({ count: 1 });
      expect(target.ctx.storage.sql.exec('SELECT status, attempts FROM notion_reset_reconciliation').one()).toMatchObject({ status: 'retry', attempts: 1 });
    } finally {
      Object.assign(target.env, originalBindings);
      target.notionClient = undefined;
    }
  });
});

it('reset.mocked-notion-success-archives-only-verified-project-pages', async () => {
  await runInDurableObject(stubFor('synthetic-notion-archive-verification'), async instance => {
    const target = instance as unknown as Target;
    const originalBindings = Object.fromEntries(notionBindingKeys.map(key => [key, target.env[key]]));
    Object.assign(target.env, notionBindings);
    const attemptsSource = notionBindings.NOTION_DATA_SOURCE_ATTEMPTS;
    const page = (id: string, eventId: string, dataSourceId = attemptsSource) => ({
      id,
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: {
        'Event ID': { rich_text: [{ type: 'text', text: { content: eventId } }] },
        'Data Mode': { select: { name: 'Live' } },
        isTest: { checkbox: false },
      },
    });
    const pages = new Map([
      ['owned-page', page('owned-page', 'owned-event')],
      ['foreign-page', page('foreign-page', 'different-event')],
    ]);
    const retrieved: string[] = [];
    const archived: string[] = [];
    target.notionClient = {
      dataSources: { query: async () => ({ results: [] }) },
      pages: {
        create: async () => ({ id: 'unused' }),
        retrieve: async args => {
          const id = String(args.page_id);
          retrieved.push(id);
          const result = pages.get(id);
          if (!result) throw Object.assign(new Error('not found'), { status: 404 });
          return result;
        },
        update: async args => {
          expect(args.archived).toBe(true);
          archived.push(String(args.page_id));
          return { id: String(args.page_id) };
        },
      },
    };
    target.ctx.storage.sql.exec('INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'attempt', 'owned-event', 'owned-page');
    target.ctx.storage.sql.exec('INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'attempt', 'foreign-event', 'foreign-page');
    target.ctx.storage.sql.exec('INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'session', 'session-1', 'session-page');
    target.ctx.storage.sql.exec('INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?)', 'pomodoro', 'pomodoro-1', 'pomodoro-page');
    const resetId = crypto.randomUUID();
    try {
      expect(target.journalNotionResetReferences(resetId)).toBe(4);
      const result = await target.reconcileNotionResetReferences(resetId);
      expect(result).toMatchObject({ archived: 1, unverified: 1, pending: 1 });
      expect(retrieved.sort()).toEqual(['foreign-page', 'owned-page']);
      expect(archived).toEqual(['owned-page']);
      expect(target.ctx.storage.sql.exec('SELECT kind, status FROM notion_reset_reconciliation ORDER BY kind, external_key').toArray()).toEqual([
        { kind: 'attempt', status: 'ownership_unverified' },
        { kind: 'attempt', status: 'archived' },
        { kind: 'pomodoro', status: 'protected' },
        { kind: 'session', status: 'protected' },
      ]);
      expect(target.ctx.storage.sql.exec('SELECT kind, external_key FROM notion_page_refs ORDER BY kind, external_key').toArray()).toEqual([
        { kind: 'attempt', external_key: 'foreign-event' },
        { kind: 'pomodoro', external_key: 'pomodoro-1' },
        { kind: 'session', external_key: 'session-1' },
      ]);
    } finally {
      Object.assign(target.env, originalBindings);
      target.notionClient = undefined;
    }
  });
});
