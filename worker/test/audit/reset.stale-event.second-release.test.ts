import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';
import { LEARNING_RESET_EPOCH_HEADER } from '../../../src/sync/learning-reset-epoch';

it('reset.rejects-event-from-before-second-release', async () => {
  const e = env as unknown as WorkerEnv;
  const stub = e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-audit-stale-event'));
  await runInDurableObject(stub, async instance => {
    const target = instance as unknown as {
      ctx: { storage: { sql: { exec: (sql: string, ...args: string[]) => { one: () => { client_epoch: string } } } } };
      releaseLearningReset: (req: Request) => Promise<Response>;
      fetch: (req: Request) => Promise<Response>;
    };
    const release = async () => {
      const id = crypto.randomUUID();
      target.ctx.storage.sql.exec("UPDATE learning_reset_control SET status = 'awaiting_release', reset_id = ? WHERE singleton = 1", id);
      const response = await target.releaseLearningReset(new Request('https://local.test/internal/learning-reset/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId: id }) }));
      expect(response.status).toBe(200);
      return target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch;
    };
    const oldEpoch = await release();
    const event = { id: crypto.randomUUID(), schema: 1, ts: new Date().toISOString(), deviceId: crypto.randomUUID(), bankVersion: 'synthetic-v1', session: 'synthetic-session', chapter: 1, lesson: '1.1', section: '1.1', concept: 'test', type: 'lesson_open' };
    await release();
    const send = (epoch: string) => target.fetch(new Request('https://local.test/events', { method: 'POST', headers: { 'Content-Type': 'application/json', [LEARNING_RESET_EPOCH_HEADER]: epoch }, body: JSON.stringify({ events: [event] }) }));
    expect((await send('definitely-stale')).status).toBe(426);
    const staleResponse = await send(oldEpoch);
    const stored = target.ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM learning_events').one() as unknown as { count: number };
    expect(stored.count).toBe(0);
    expect(staleResponse.status).toBe(426);
  });
});
