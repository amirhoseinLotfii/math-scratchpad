import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';
import { LEARNING_RESET_EPOCH_HEADER } from '../../../src/sync/learning-reset-epoch';

it('reset.rejects-pre-reset-event.after-two-complete-local-resets', async () => {
  const e = env as unknown as WorkerEnv;
  const stub = e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-two-complete-resets'));
  await runInDurableObject(stub, async instance => {
    const target = instance as unknown as {
      ctx: { storage: { sql: { exec: (sql: string) => { one: () => Record<string, unknown> } } } };
      driveConfigured: () => boolean;
      executeLearningReset: (req: Request) => Promise<Response>;
      releaseLearningReset: (req: Request) => Promise<Response>;
      fetch: (req: Request) => Promise<Response>;
    };
    // Force no external Drive operations; this synthetic Durable Object is isolated.
    target.driveConfigured = () => false;
    const reset = async () => {
      const resetId = crypto.randomUUID();
      const request = (path: string) => new Request(`https://local.test/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }) });
      const executed = await target.executeLearningReset(request('internal/learning-reset'));
      expect(executed.status).toBe(200);
      const released = await target.releaseLearningReset(request('internal/learning-reset/release'));
      expect(released.status).toBe(200);
      const epoch = target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch as string;
      const releaseRetry = await target.releaseLearningReset(request('internal/learning-reset/release'));
      expect(releaseRetry.status).toBe(200);
      expect(target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch).toBe(epoch);
      return epoch;
    };
    const oldEpoch = await reset();
    const event = { id: crypto.randomUUID(), schema: 1, ts: new Date().toISOString(), deviceId: crypto.randomUUID(), bankVersion: 'synthetic-v1', session: 'synthetic-session', chapter: 1, lesson: '1.1', section: '1.1', concept: 'test', type: 'lesson_open' };
    const currentEpoch = await reset();
    const count = () => Number(target.ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM learning_events').one().count);
    expect(count()).toBe(0);
    const response = await target.fetch(new Request('https://local.test/events', { method: 'POST', headers: { 'Content-Type': 'application/json', [LEARNING_RESET_EPOCH_HEADER]: oldEpoch }, body: JSON.stringify({ events: [event] }) }));
    expect(count()).toBe(0);
    expect(response.status).toBe(426);
    const freshEvent = { ...event, id: crypto.randomUUID() };
    const freshResponse = await target.fetch(new Request('https://local.test/events', { method: 'POST', headers: { 'Content-Type': 'application/json', [LEARNING_RESET_EPOCH_HEADER]: currentEpoch }, body: JSON.stringify({ events: [freshEvent] }) }));
    expect(freshResponse.status).toBe(200);
    expect(count()).toBe(1);
  });
});
