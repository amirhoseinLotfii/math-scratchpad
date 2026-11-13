import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';

it('reset.epoch.changes-between-distinct-releases', async () => {
  const e = env as unknown as WorkerEnv;
  const stub = e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-audit-reset-epoch'));
  await runInDurableObject(stub, async instance => {
    const target = instance as unknown as {
      ctx: { storage: { sql: { exec: (sql: string, ...args: string[]) => { one: () => { client_epoch: string } } } } };
      releaseLearningReset: (req: Request) => Promise<Response>;
    };
    const release = async () => {
      const id = crypto.randomUUID();
      const candidate = crypto.randomUUID();
      target.ctx.storage.sql.exec("UPDATE learning_reset_control SET status = 'awaiting_release', reset_id = ?, client_epoch = ? WHERE singleton = 1", id, candidate);
      const response = await target.releaseLearningReset(new Request('https://local.test/internal/learning-reset/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId: id }) }));
      expect(response.status).toBe(200);
      return target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch;
    };
    const first = await release();
    const second = await release();
    expect(second).not.toBe(first);
  });
});

it('reset.epoch.release-retry-keeps-the-same-generation', async () => {
  const e = env as unknown as WorkerEnv;
  const stub = e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-audit-reset-epoch-retry'));
  await runInDurableObject(stub, async instance => {
    const target = instance as unknown as {
      ctx: { storage: { sql: { exec: (sql: string, ...args: string[]) => { one: () => { client_epoch: string | null } } } } };
      releaseLearningReset: (req: Request) => Promise<Response>;
    };
    const resetId = crypto.randomUUID();
    const candidate = crypto.randomUUID();
    target.ctx.storage.sql.exec("UPDATE learning_reset_control SET status = 'awaiting_release', reset_id = ?, client_epoch = ? WHERE singleton = 1", resetId, candidate);
    const request = () => new Request('https://local.test/internal/learning-reset/release', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }),
    });
    expect((await target.releaseLearningReset(request())).status).toBe(200);
    const first = target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch;
    expect((await target.releaseLearningReset(request())).status).toBe(200);
    const retry = target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch;
    expect(first).toMatch(/^[a-f0-9-]{36}$/i);
    expect(retry).toBe(first);
  });
});
