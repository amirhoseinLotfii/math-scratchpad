import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';

type Target = {
  ctx: { storage: { sql: { exec: (sql: string, ...args: string[]) => { one: () => Record<string, unknown> } } } };
  driveConfigured: () => boolean;
  driveClient: unknown;
  executeLearningReset: (req: Request) => Promise<Response>;
};
const request = () => new Request('https://local.test/internal/learning-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId: crypto.randomUUID() }) });
const stubFor = (name: string) => { const e = env as unknown as WorkerEnv; return e.EVENT_STORE.get(e.EVENT_STORE.idFromName(name)); };

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
  });
});
