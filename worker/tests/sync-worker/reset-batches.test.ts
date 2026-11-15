import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import type { WorkerEnv } from '../../src/env';
import { OWNER_EMAIL, testEnv } from '../helpers/sync-worker';
describe('reset batches', () => {
  afterEach(async () => reset());
  it('trashes Drive learning mirrors in bounded batches and clears cloud records only after Drive is done', async () => {
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const { runInDurableObject } = await import('cloudflare:test');
    const resetId = crypto.randomUUID();
    await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        env: WorkerEnv;
        driveClient?: unknown;
        executeLearningReset: (request: Request) => Promise<Response>;
        ctx: {
          storage: {
            sql: { exec<T>(sql: string, ...bindings: Array<string | number | null>): { one(): T } };
            put: (key: string, value: unknown) => Promise<void>;
          };
        };
      };
      const originalBindings = {
        GOOGLE_CLIENT_ID: target.env.GOOGLE_CLIENT_ID,
        GOOGLE_DRIVE_CLIENT_SECRET: target.env.GOOGLE_DRIVE_CLIENT_SECRET,
        GOOGLE_DRIVE_REFRESH_TOKEN: target.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      };
      Object.assign(target.env, {
        GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        GOOGLE_DRIVE_CLIENT_SECRET: 'test-drive-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'test-drive-refresh-token',
      });
      try {
        const sql = target.ctx.storage.sql;
        sql.exec("UPDATE learning_reset_control SET status = 'idle', reset_id = NULL WHERE singleton = 1");
        sql.exec('DELETE FROM learning_events');
        sql.exec(
          'INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)',
          'batched-event',
          '{"id":"batched-event"}',
          new Date().toISOString(),
        );
        await target.ctx.storage.put('drive-mirror-state-v1', {
          status: 'synced',
          lastSeq: 1,
          pendingCount: 0,
          folders: { rootId: 'root-folder', syncId: 'sync-folder', eventsId: 'events-folder', stateId: 'state-folder' },
          files: {},
          fileHashes: {},
          snapshots: {},
        });
        const folder = (id: string, name: string, parent: string) => ({
          id,
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parent],
          trashed: false,
        });
        const metadata: Record<string, Record<string, unknown>> = {
          'root-folder': folder('root-folder', 'Math_Project', 'root'),
          'sync-folder': folder('sync-folder', '03_Sync', 'root-folder'),
          'events-folder': folder('events-folder', 'events', 'sync-folder'),
          'state-folder': folder('state-folder', 'state', 'sync-folder'),
        };
        let stateFiles: Array<{ id: string; name: string; mimeType: string; parents: string[]; appProperties?: Record<string, string> }> =
          Array.from({ length: 30 }, (_, index) => ({
            id: `mirror-${index}`,
            name: `progress.sha256-${index.toString(16).padStart(64, '0')}.json`,
            mimeType: 'application/json',
            parents: ['state-folder'],
            appProperties: { msOwner: 'math-scratchpad', msKind: 'state' },
          }));
        stateFiles.push({ id: 'keep-notes', name: 'notes.txt', mimeType: 'text/plain', parents: ['state-folder'] });
        target.driveClient = {
          diagnosticStage: 'idle',
          findFolderId: async () => undefined,
          readFileMetadata: async (id: string) => metadata[id] ?? {},
          listFilesInFolder: async (parentId: string) => (parentId === 'state-folder' ? [...stateFiles] : []),
          trashFileInFolder: async (id: string) => {
            stateFiles = stateFiles.filter((file) => file.id !== id);
            return true;
          },
        };
        const run = () =>
          target.executeLearningReset(
            new Request('https://event-store.internal/internal/learning-reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ resetId }),
            }),
          );
        const eventCount = () => Number(sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM learning_events').one().count);
        const status = () => sql.exec<{ status: string }>('SELECT status FROM learning_reset_control WHERE singleton = 1').one().status;

        for (const expectedRemaining of [18, 6]) {
          const partial = await run();
          expect(partial.status, await partial.clone().text()).toBe(202);
          expect(await partial.json()).toMatchObject({
            completed: false,
            inProgress: true,
            retryWithSameResetId: true,
            drive: { movedToTrash: 12, remainingLearningMirrors: true },
          });
          expect(stateFiles.length - 1).toBe(expectedRemaining);
          expect(eventCount()).toBe(1);
          expect(status()).toBe('running');
        }
        const final = await run();
        expect(final.status).toBe(200);
        expect(await final.json()).toMatchObject({
          completed: true,
          releaseRequired: true,
          drive: { movedToTrash: 6, preservedFiles: 1 },
          cloud: { deletedLearningEvents: 1 },
        });
        expect(stateFiles.map((file) => file.id)).toEqual(['keep-notes']);
        expect(eventCount()).toBe(0);
        expect(status()).toBe('awaiting_release');
      } finally {
        Object.assign(target.env, originalBindings);
        target.driveClient = undefined;
      }
    });
  });
});
