import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { createApp } from '../../src/index';
import type { WorkerEnv } from '../../src/env';

it('auth.does-not-report-downstream-storage-failure-as-unauthorized', async () => {
  const actual = env as unknown as WorkerEnv;
  const fake = { ...actual, EVENT_STORE: { idFromName: () => 'synthetic-id', get: () => ({ fetch: async () => { throw new Error('synthetic-storage-failure'); } }) } } as unknown as WorkerEnv;
  const app = createApp(async () => ({ sub:'synthetic',email:actual.OWNER_EMAIL,email_verified:true }));
  const res = await app.fetch(new Request('https://worker.test/state', { headers:{Authorization:'Bearer synthetic'} }),fake);
  expect(res.status).toBeGreaterThanOrEqual(500);
});
