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
    const trashed: string[] = [];
    target.driveConfigured = () => true;
    target.driveClient = {
      findFolderId: async (name: string) => name === 'Math_Project' ? 'root-id' : name === '03_Sync' ? 'sync-id' : undefined,
      readFileMetadata: async (id: string) => id === 'root-id' ? { id, name: 'Math_Project', mimeType: 'application/vnd.google-apps.folder', parents: ['root'], trashed: false } : { id, name: '03_Sync', mimeType: 'application/vnd.google-apps.folder', parents: ['root-id'], trashed: false },
      listFilesInFolder: async () => [{ id: 'unowned-file', name: 'progress.json', mimeType: 'application/json', parents: ['sync-id'] }],
      trashFileInFolder: async (id: string) => { trashed.push(id); return true; },
    };
    expect((await target.executeLearningReset(request())).status).toBe(200);
    expect(trashed).not.toContain('unowned-file');
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
