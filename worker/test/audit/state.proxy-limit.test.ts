import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { createApp } from '../../src/index';
import type { WorkerEnv } from '../../src/env';
import { LEARNING_RESET_EPOCH, LEARNING_RESET_EPOCH_HEADER } from '../../../src/sync/learning-reset-epoch';

it('state.accepts-valid-300kb-value-through-public-worker', async () => {
  const e = env as unknown as WorkerEnv;
  const stub = e.EVENT_STORE.get(e.EVENT_STORE.idFromName(e.OWNER_EMAIL.trim().toLowerCase()));
  const body = (key: string) => JSON.stringify({ key, value: 'x'.repeat(300_000), revision: 0 });
  await runInDurableObject(stub, async instance => {
    const target = instance as unknown as { fetch: (req: Request) => Promise<Response> };
    const direct = await target.fetch(new Request('https://local.test/state', { method: 'POST', headers: { 'Content-Type': 'application/json', [LEARNING_RESET_EPOCH_HEADER]: LEARNING_RESET_EPOCH }, body: body('math-scratchpad-audit-direct') }));
    expect(direct.status).toBe(200);
  });
  const app = createApp(async () => ({ sub: 'synthetic', email: e.OWNER_EMAIL, email_verified: true }));
  const response = await app.fetch(new Request('https://worker.test/state', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-token', [LEARNING_RESET_EPOCH_HEADER]: LEARNING_RESET_EPOCH }, body: body('math-scratchpad-audit-public') }), e);
  expect(response.status).toBe(200);
});
