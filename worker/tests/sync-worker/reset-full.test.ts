import { seedResetData } from '../helpers/reset-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import { createApp } from '../../src/index';
import type { WorkerEnv } from '../../src/env';
import { LEARNING_RESET_EPOCH_HEADER } from '../../../shared/contracts/reset-epoch';
import { OWNER_EMAIL, testEnv, validVerifier, makeEvent, call } from '../helpers/sync-worker';
describe('reset full', () => {
  afterEach(async () => reset());
  it('clears learning mirrors, preserves bank and identity data, and requires release before fresh writes', async () => {
    const app = createApp(validVerifier);
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const { runInDurableObject } = await import('cloudflare:test');
    const resetId = crypto.randomUUID();

    await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        env: WorkerEnv;
        notionClient?: unknown;
        driveClient?: {
          diagnosticStage: string;
          readFileMetadata: (id: string, fields: string) => Promise<Record<string, unknown>>;
          listFilesInFolder: (parentId: string) => Promise<Array<{ id: string; name: string; mimeType: string; parents: string[] }>>;
          trashFileInFolder: (id: string, parentId: string) => Promise<boolean>;
        };
        executeLearningReset: (request: Request) => Promise<Response>;
        releaseLearningReset: (request: Request) => Promise<Response>;
        ctx: {
          storage: {
            sql: { exec<T>(sql: string, ...bindings: Array<string | number | null>): { one(): T; toArray(): T[] } };
            put: (key: string, value: unknown) => Promise<void>;
            get: <T>(key: string) => Promise<T | undefined>;
          };
        };
      };
      const originalBindings = {
        GOOGLE_CLIENT_ID: target.env.GOOGLE_CLIENT_ID,
        GOOGLE_DRIVE_CLIENT_SECRET: target.env.GOOGLE_DRIVE_CLIENT_SECRET,
        GOOGLE_DRIVE_REFRESH_TOKEN: target.env.GOOGLE_DRIVE_REFRESH_TOKEN,
        NOTION_API_KEY: target.env.NOTION_API_KEY,
        notionClient: target.notionClient,
      };
      Object.assign(target.env, {
        GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        GOOGLE_DRIVE_CLIENT_SECRET: 'test-drive-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'test-drive-refresh-token',
        NOTION_API_KEY: undefined,
      });
      target.notionClient = undefined;

      try {
        const sql = target.ctx.storage.sql;
        await seedResetData(target.ctx.storage);
        const folderMetadata: Record<string, Record<string, unknown>> = {
          'root-folder': {
            id: 'root-folder',
            name: 'Math_Project',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root'],
            trashed: false,
          },
          'sync-folder': {
            id: 'sync-folder',
            name: '03_Sync',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root-folder'],
            trashed: false,
          },
          'events-folder': {
            id: 'events-folder',
            name: 'events',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['sync-folder'],
            trashed: false,
          },
          'state-folder': {
            id: 'state-folder',
            name: 'state',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['sync-folder'],
            trashed: false,
          },
          'backup-folder': {
            id: 'backup-folder',
            name: '06_Backups',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root-folder'],
            trashed: false,
          },
        };
        const child = (
          id: string,
          name: string,
          parentId: string,
          mimeType = 'application/json',
          kind?: 'events' | 'state' | 'backups',
        ) => ({
          id,
          name,
          mimeType,
          parents: [parentId],
          ...(kind ? { appProperties: { msOwner: 'math-scratchpad', msKind: kind } } : {}),
        });
        const filesByFolder = new Map([
          [
            'events-folder',
            [
              child('mirror-events', 'events_2026-11.jsonl', 'events-folder', 'application/x-ndjson', 'events'),
              child('course-source', 'lesson-source.pdf', 'events-folder', 'application/pdf'),
              child('nested-folder', 'nested', 'events-folder', 'application/vnd.google-apps.folder'),
            ],
          ],
          [
            'state-folder',
            [
              child('bank-protected', 'progress.json', 'state-folder', 'application/json', 'state'),
              child('mirror-progress', 'progress.json', 'state-folder', 'application/json', 'state'),
              child('unrelated-state', 'notes.txt', 'state-folder', 'text/plain'),
            ],
          ],
          ['backup-folder', [child('mirror-backup', 'sync_backup_2026-11-12.json', 'backup-folder', 'application/json', 'backups')]],
        ]);
        const trashed: Array<{ id: string; parentId: string }> = [];
        target.driveClient = {
          diagnosticStage: 'idle',
          readFileMetadata: async (id) => folderMetadata[id] ?? {},
          listFilesInFolder: async (parentId) => filesByFolder.get(parentId) ?? [],
          trashFileInFolder: async (id, parentId) => {
            trashed.push({ id, parentId });
            return true;
          },
        };

        const response = await target.executeLearningReset(
          new Request('https://event-store.internal/internal/learning-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resetId }),
          }),
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          completed: true,
          releaseRequired: true,
          drive: { movedToTrash: 3, inspectedFiles: 6, preservedFiles: 3, protectedBankFileSkipped: true, foldersFound: 5 },
          cloud: {
            deletedLearningEvents: 1,
            deletedAppStateRecords: 1,
            deletedNotionProjectionRecords: 1,
            deletedNotionReferences: 0,
            retainedNotionReferences: 1,
            pendingNotionReconciliation: 1,
            deletedQueuedMirrorRecords: 3,
            bankSourceRecords: 1,
            activeAuthSessions: 1,
            preservedIdentityAndDriveConfigRecords: 2,
          },
          preserved: { bankSourceRecords: 1, activeAuthSessions: 1 },
        });
        expect(trashed).toEqual([
          { id: 'mirror-events', parentId: 'events-folder' },
          { id: 'mirror-progress', parentId: 'state-folder' },
          { id: 'mirror-backup', parentId: 'backup-folder' },
        ]);

        const count = (table: string) => Number(sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).one().count);
        expect(count('learning_events')).toBe(0);
        expect(count('notion_projections')).toBe(0);
        expect(count('notion_page_refs')).toBe(1);
        expect(count('notion_state_queue')).toBe(0);
        expect(count('notion_mistake_reviews')).toBe(0);
        expect(count('notion_session_mistakes')).toBe(0);
        expect(count('bank_source')).toBe(1);
        expect(count('auth_sessions')).toBe(1);
        expect(sql.exec<{ key: string; value: string }>('SELECT key, value FROM app_state ORDER BY key').toArray()).toEqual([
          { key: 'math-scratchpad-device-id-v1', value: '"device-safe"' },
          { key: 'math-scratchpad-drive-config-v1', value: '{"fileId":"bank-protected"}' },
        ]);
        expect(sql.exec<{ revision: number }>('SELECT revision FROM app_state_meta WHERE singleton = 1').one()).toEqual({ revision: 0 });
        expect(sql.exec<{ last_seq: number }>('SELECT last_seq FROM notion_projection_meta WHERE singleton = 1').one()).toEqual({
          last_seq: 0,
        });
        expect(await target.ctx.storage.get('drive-mirror-state-v1')).toBeUndefined();
        expect(await target.ctx.storage.get('notion-mirror-state-v1')).toBeUndefined();
        expect(sql.exec<{ status: string }>('SELECT status FROM learning_reset_control WHERE singleton = 1').one()).toEqual({
          status: 'awaiting_release',
        });

        const lockedWrite = await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } });
        expect(lockedWrite.status).toBe(503);
        const blockedRelease = await target.releaseLearningReset(
          new Request('https://event-store.internal/internal/learning-reset/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resetId: crypto.randomUUID() }),
          }),
        );
        expect(blockedRelease.status).toBe(409);
        expect(sql.exec<{ status: string }>('SELECT status FROM learning_reset_control WHERE singleton = 1').one()).toEqual({
          status: 'awaiting_release',
        });

        const release = await target.releaseLearningReset(
          new Request('https://event-store.internal/internal/learning-reset/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resetId }),
          }),
        );
        expect(release.status).toBe(200);
        expect(await release.json()).toMatchObject({ released: true });
        expect((await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } })).status).toBe(426);
        const currentEpoch = sql
          .exec<{ client_epoch: string }>('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1')
          .one().client_epoch;
        const freshWrite = await call(app, '/events', {
          token: 'valid-test-token',
          body: { events: [makeEvent()] },
          extraHeaders: { [LEARNING_RESET_EPOCH_HEADER]: currentEpoch },
        });
        expect(freshWrite.status).toBe(200);
      } finally {
        Object.assign(target.env, {
          GOOGLE_CLIENT_ID: originalBindings.GOOGLE_CLIENT_ID,
          GOOGLE_DRIVE_CLIENT_SECRET: originalBindings.GOOGLE_DRIVE_CLIENT_SECRET,
          GOOGLE_DRIVE_REFRESH_TOKEN: originalBindings.GOOGLE_DRIVE_REFRESH_TOKEN,
          NOTION_API_KEY: originalBindings.NOTION_API_KEY,
        });
        target.notionClient = originalBindings.notionClient;
      }
    });
  });
});
