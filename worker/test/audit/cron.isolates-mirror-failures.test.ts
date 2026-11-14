import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../../src/env';
import { requestMirrorSync } from '../../src/index';

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

it('cron.returns-two-sanitized-errors-and-request-counts-when-both-destinations-reject', async () => {
  const e=env as unknown as WorkerEnv;
  const stub=e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-cron-both-fail'));
  await runInDurableObject(stub, async instance => {
    const target=instance as unknown as { syncDrive:()=>Promise<unknown>; syncNotion:()=>Promise<unknown>; fetch:(req:Request)=>Promise<Response> };
    target.syncDrive=async()=>{throw new Error('private-drive-detail')};
    target.syncNotion=async()=>{throw new Error('private-notion-detail')};
    const response=await target.fetch(new Request('https://local.test/internal/sync-all',{method:'POST'}));
    const raw=await response.text();
    expect(response.status).toBe(200);
    expect(raw).not.toContain('private-drive-detail');
    expect(raw).not.toContain('private-notion-detail');
    expect(JSON.parse(raw)).toMatchObject({
      drive:{status:'error',lastError:'network_error',failureStage:'sync_all'},
      notion:{status:'error',lastError:'network_error'},
      subrequestsUsed:0,
      subrequestLimit:40,
    });
  });
});

it('cron.keeps-drive-result-when-notion-rejects', async () => {
  const e=env as unknown as WorkerEnv;
  const stub=e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-cron-notion-fail'));
  await runInDurableObject(stub, async instance => {
    const target=instance as unknown as { syncDrive:()=>Promise<unknown>; syncNotion:()=>Promise<unknown>; fetch:(req:Request)=>Promise<Response> };
    target.syncDrive=async()=>({status:'synced',pendingCount:0});
    target.syncNotion=async()=>{throw new Error('private-notion-detail')};
    const response=await target.fetch(new Request('https://local.test/internal/sync-all',{method:'POST'}));
    const raw=await response.text();
    expect(response.status).toBe(200);
    expect(raw).not.toContain('private-notion-detail');
    expect(JSON.parse(raw)).toMatchObject({drive:{status:'synced'},notion:{status:'error',lastError:'network_error'}});
  });
});

it('cron.emits-sanitized-retry-diagnostics-with-subrequest-counts', async () => {
  const warnings: unknown[][]=[];
  const warn=vi.spyOn(console,'warn').mockImplementation((...args)=>{warnings.push(args)});
  const fakeEnv={
    OWNER_EMAIL:'owner@example.test',
    EVENT_STORE:{
      idFromName:(owner:string)=>owner,
      get:(id:string)=>({
        fetch:async()=>new Response(JSON.stringify({
          drive:{status:'error',lastError:'private-token-value',failureStage:'private-url?token=x'},
          notion:{status:'error',lastError:'remote_error'},
          subrequestsUsed:47,
          subrequestLimit:50,
        }),{status:200,headers:{'Content-Type':'application/json'}}),
      }),
    },
  } as unknown as Pick<WorkerEnv,'EVENT_STORE'|'OWNER_EMAIL'>;
  try {
    await expect(requestMirrorSync(fakeEnv)).rejects.toThrow('scheduled_mirror_retry_incomplete');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.[0]).toBe('scheduled_mirror_sync_incomplete');
    expect(JSON.stringify(warnings[0]?.[1])).toContain('subrequestsUsed');
    expect(JSON.stringify(warnings[0]?.[1])).not.toContain('private-token-value');
    expect(JSON.stringify(warnings[0]?.[1])).not.toContain('private-url');
  } finally {
    warn.mockRestore();
  }
});
