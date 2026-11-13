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
      target.ctx.storage.sql.exec("UPDATE learning_reset_control SET status = 'awaiting_release', reset_id = ? WHERE singleton = 1", id);
      const response = await target.releaseLearningReset(new Request('https://local.test/internal/learning-reset/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId: id }) }));
      expect(response.status).toBe(200);
      return target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch;
    };
    const first = await release();
    const second = await release();
    expect(second).not.toBe(first);
  });
});
