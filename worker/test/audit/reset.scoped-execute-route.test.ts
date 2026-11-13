import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { createApp } from '../../src/index';
import type { WorkerEnv } from '../../src/env';

it('reset.scoped-execute.route-exists-for-owner', async () => {
  const e=env as unknown as WorkerEnv;
  const app=createApp(async()=>({sub:'synthetic',email:e.OWNER_EMAIL,email_verified:true}));
  const request=new Request('https://worker.test/reset/execute',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic'},body:JSON.stringify({scope:{bankVersion:'synthetic-v1',chapter:1,lesson:'1.1'},confirm:'synthetic'})});
  const response=await app.fetch(request,e);
  expect(response.status).not.toBe(404);
});

it('reset.epoch.route-returns-the-owner-generation', async () => {
  const e = env as unknown as WorkerEnv;
  const app = createApp(async () => ({ sub: 'synthetic', email: e.OWNER_EMAIL, email_verified: true }));
  const response = await app.fetch(new Request('https://worker.test/reset/epoch', {
    headers: { Authorization: 'Bearer synthetic' },
  }), e);
  expect(response.status).toBe(200);
  const body = await response.json() as { epoch?: unknown };
  expect(typeof body.epoch).toBe('string');
  expect(body.epoch).toMatch(/^[a-zA-Z0-9._:-]{8,128}$/);
});
