import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';
import { createApp } from '../../src/index';

it('reset.client-status-is-public-read-only-and-contains-only-status-and-epoch', async () => {
  const e = env as unknown as WorkerEnv;
  const id = e.EVENT_STORE.idFromName(e.OWNER_EMAIL.trim().toLowerCase());
  const stub = e.EVENT_STORE.get(id);
  const resetId = crypto.randomUUID();
  const candidateEpoch = crypto.randomUUID();
  try {
    await runInDurableObject(stub, async instance => {
      const target = instance as unknown as { ctx: { storage: { sql: { exec: (sql: string, ...args: string[]) => unknown } } } };
      target.ctx.storage.sql.exec("UPDATE learning_reset_control SET status = 'awaiting_release', reset_id = ?, client_epoch = ? WHERE singleton = 1", resetId, candidateEpoch);
    });

    const response = await createApp().fetch(new Request('https://worker.test/reset/status'), e);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ status: 'awaiting_release', epoch: candidateEpoch });
  } finally {
    await runInDurableObject(stub, async instance => {
      const target = instance as unknown as { ctx: { storage: { sql: { exec: (sql: string, ...args: string[]) => unknown } } } };
      target.ctx.storage.sql.exec("UPDATE learning_reset_control SET status = 'idle', reset_id = NULL, completed_at = NULL, client_epoch = NULL WHERE singleton = 1");
    });
  }
});
