import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import { createApp } from '../../src/index';
import type { WorkerEnv } from '../../src/env';
import { DriveMirrorError } from '../../src/google-drive';
import { OWNER_EMAIL, testEnv, validVerifier, makeEvent, call } from '../helpers/sync-worker';
describe('reset recovery', () => {
  afterEach(async () => reset());
  it('records a sanitized Google Drive stage when coordinated reset cleanup fails', async () => {
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const { runInDurableObject } = await import('cloudflare:test');
    const resetId = crypto.randomUUID();
    await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        env: WorkerEnv;
        driveClient?: { diagnosticStage: string; findFolderId: () => Promise<string | undefined> };
        executeLearningReset: (request: Request) => Promise<Response>;
        ctx: { storage: { sql: { exec<T>(sql: string, ...bindings: Array<string | number>): { toArray(): T[] } } } };
      };
      Object.assign(target.env, {
        GOOGLE_DRIVE_CLIENT_SECRET: 'test-drive-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'test-drive-refresh-token',
      });
      target.ctx.storage.sql.exec(
        'INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)',
        `preserved-on-failure-${resetId}`,
        JSON.stringify({ id: `preserved-on-failure-${resetId}` }),
        new Date().toISOString(),
      );
      target.driveClient = {
        diagnosticStage: 'drive_file_lookup_fetch_rejected_type_error',
        findFolderId: async () => {
          throw new DriveMirrorError('network_error');
        },
      };

      const response = await target.executeLearningReset(
        new Request('https://event-store.internal/internal/learning-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetId }),
        }),
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: 'learning_reset_incomplete',
        code: 'network_error',
        failureStage: 'drive_reset:drive_file_lookup_fetch_rejected_type_error',
        retryWithSameResetId: true,
      });
      expect(
        target.ctx.storage.sql
          .exec<{
            failure_stage: string;
            error_code: string;
          }>("SELECT failure_stage, error_code FROM mirror_diagnostics WHERE destination = 'drive'")
          .toArray(),
      ).toEqual([{ failure_stage: 'drive_reset:drive_file_lookup_fetch_rejected_type_error', error_code: 'network_error' }]);
      expect(
        target.ctx.storage.sql.exec<{ status: string }>('SELECT status FROM learning_reset_control WHERE singleton = 1').toArray(),
      ).toEqual([{ status: 'running' }]);
      expect(target.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM learning_events').toArray()).toEqual([
        { count: 1 },
      ]);
    });
  });

  it('lets the admin inspect and explicitly take over a learning reset lock orphaned by a lost reset id', async () => {
    const app = createApp(validVerifier);
    const adminEnv = { ...testEnv, LEARNING_RESET_TOKEN: 'admin-reset-test-token' } as WorkerEnv;
    const admin = (path: string, body?: unknown, token = 'admin-reset-test-token') =>
      app.fetch(
        new Request(`https://worker.test${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        adminEnv,
      );
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const { runInDurableObject } = await import('cloudflare:test');
    const lostResetId = crypto.randomUUID();
    const newResetId = crypto.randomUUID();
    type Target = {
      activeLearningResetId?: string;
      executeLearningReset: (request: Request) => Promise<Response>;
      ctx: { storage: { sql: { exec<T>(sql: string, ...bindings: Array<string | number | null>): { one(): T; toArray(): T[] } } } };
    };
    const row = () =>
      runInDurableObject(stub, async (instance) =>
        (instance as unknown as Target).ctx.storage.sql
          .exec<{ status: string; reset_id: string | null }>('SELECT status, reset_id FROM learning_reset_control WHERE singleton = 1')
          .one(),
      );

    for (const stuckStatus of ['running', 'awaiting_release']) {
      await runInDurableObject(stub, async (instance) => {
        (instance as unknown as Target).ctx.storage.sql.exec(
          'UPDATE learning_reset_control SET status = ?, reset_id = ?, completed_at = NULL WHERE singleton = 1',
          stuckStatus,
          lostResetId,
        );
      });
      expect((await admin('/admin/learning-reset/status', undefined, 'wrong-token')).status).toBe(401);
      const status = await admin('/admin/learning-reset/status');
      expect(status.status).toBe(200);
      const statusBody = (await status.json()) as Record<string, unknown>;
      expect(statusBody).toEqual({ status: stuckStatus, hasResetId: true, completedAt: null, activeInThisInstance: false });
      expect(JSON.stringify(statusBody)).not.toContain(lostResetId);

      const blocked = await admin('/admin/learning-reset', { confirm: 'DELETE_ALL_LEARNING_DATA', resetId: newResetId });
      expect(blocked.status).toBe(409);
      expect(await blocked.json()).toMatchObject({ error: 'learning_reset_in_progress' });
      expect(
        (await admin('/admin/learning-reset', { confirm: 'DELETE_ALL_LEARNING_DATA', resetId: newResetId, takeover: true })).status,
      ).toBe(400);
      expect(await row()).toEqual({ status: stuckStatus, reset_id: lostResetId });
    }

    await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as Target;
      target.activeLearningResetId = lostResetId;
      const live = await target.executeLearningReset(
        new Request('https://event-store.internal/internal/learning-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetId: newResetId, takeover: true }),
        }),
      );
      expect(live.status).toBe(409);
      expect(await live.json()).toMatchObject({ error: 'learning_reset_active' });
      target.activeLearningResetId = undefined;
    });
    expect(await row()).toEqual({ status: 'awaiting_release', reset_id: lostResetId });

    // Earlier tests may leave Drive credentials on the shared instance; this test covers lock handling only.
    const driveBindings = await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as { env: WorkerEnv; driveClient?: unknown };
      const saved = {
        GOOGLE_DRIVE_CLIENT_SECRET: target.env.GOOGLE_DRIVE_CLIENT_SECRET,
        GOOGLE_DRIVE_REFRESH_TOKEN: target.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      };
      Object.assign(target.env, { GOOGLE_DRIVE_CLIENT_SECRET: undefined, GOOGLE_DRIVE_REFRESH_TOKEN: undefined });
      target.driveClient = undefined;
      return saved;
    });
    const takeover = await Promise.resolve(
      admin('/admin/learning-reset', {
        confirm: 'DELETE_ALL_LEARNING_DATA',
        resetId: newResetId,
        takeover: 'TAKEOVER_STUCK_LEARNING_RESET',
      }),
    ).finally(() =>
      runInDurableObject(stub, async (instance) => {
        Object.assign((instance as unknown as { env: WorkerEnv }).env, driveBindings);
      }),
    );
    const takeoverBody = await takeover.clone().text();
    expect(takeover.status, takeoverBody).toBe(200);
    expect(await takeover.json()).toMatchObject({ completed: true, releaseRequired: true });
    expect(await row()).toEqual({ status: 'awaiting_release', reset_id: newResetId });
    expect((await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } })).status).toBe(503);
    expect(await (await admin('/admin/learning-reset/status')).json()).toMatchObject({ status: 'awaiting_release', hasResetId: true });

    expect((await admin('/admin/learning-reset/release', { confirm: 'RELEASE_LEARNING_SYNC', resetId: lostResetId })).status).toBe(409);
    const release = await admin('/admin/learning-reset/release', { confirm: 'RELEASE_LEARNING_SYNC', resetId: newResetId });
    expect(release.status).toBe(200);
    expect(await (await admin('/admin/learning-reset/status')).json()).toMatchObject({ status: 'released' });
  });
});
