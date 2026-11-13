import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';

it('cron.reports-both-destinations.when-drive-throws', async () => {
  const e=env as unknown as WorkerEnv;
  const stub=e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-cron-failure'));
  await runInDurableObject(stub, async instance => {
    const target=instance as unknown as { syncDrive:()=>Promise<unknown>; syncNotion:()=>Promise<unknown>; fetch:(req:Request)=>Promise<Response> };
    let notionCalled=false;
    target.syncDrive=async()=>{throw new Error('synthetic-drive-failure')};
    target.syncNotion=async()=>{notionCalled=true;return {status:'synced'}};
    const response=await target.fetch(new Request('https://local.test/internal/sync-all',{method:'POST'}));
    expect(response.status).toBe(200);
    const body=await response.json() as {drive:{status:string};notion:{status:string}};
    expect(notionCalled).toBe(true);
    expect(body.drive.status).toBe('error');
    expect(body.notion.status).toBe('synced');
  });
});
