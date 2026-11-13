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
