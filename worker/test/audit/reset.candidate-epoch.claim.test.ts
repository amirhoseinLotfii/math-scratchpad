import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import type { WorkerEnv } from '../../src/env';

it('reset.claim-creates-a-candidate-epoch-and-same-id-retries-preserve-it', async () => {
  const e = env as unknown as WorkerEnv;
  const stub = e.EVENT_STORE.get(e.EVENT_STORE.idFromName('synthetic-audit-candidate-epoch'));
  await runInDurableObject(stub, async instance => {
    const target = instance as unknown as {
      ctx: { storage: { sql: { exec: (sql: string, ...args: string[]) => { one: () => { client_epoch: string | null } } } } };
      executeLearningReset: (request: Request) => Promise<Response>;
      releaseLearningReset: (request: Request) => Promise<Response>;
      trashLearningMirrorFiles: () => Promise<{ movedToTrash: number; inspectedFiles: number; preservedFiles: number; protectedBankFileSkipped: boolean; foldersFound: number }>;
      reconcileNotionResetReferences: () => Promise<{ archived: number; protected: number; unverified: number; retryable: number; pending: number }>;
    };
    target.trashLearningMirrorFiles = async () => ({ movedToTrash: 0, inspectedFiles: 0, preservedFiles: 0, protectedBankFileSkipped: false, foldersFound: 0 });
    target.reconcileNotionResetReferences = async () => ({ archived: 0, protected: 0, unverified: 0, retryable: 0, pending: 0 });
    const resetId = crypto.randomUUID();
    const execute = (id: string) => target.executeLearningReset(new Request('https://local.test/internal/learning-reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId: id }),
    }));
    const epoch = () => target.ctx.storage.sql.exec('SELECT client_epoch FROM learning_reset_control WHERE singleton = 1').one().client_epoch;

    expect((await execute(resetId)).status).toBe(200);
    const candidate = epoch();
    expect(candidate).toMatch(/^[a-f0-9-]{36}$/i);
    expect((await execute(resetId)).status).toBe(200);
    expect(epoch()).toBe(candidate);

    const release = () => target.releaseLearningReset(new Request('https://local.test/internal/learning-reset/release', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }),
    }));
    expect((await release()).status).toBe(200);
    expect(epoch()).toBe(candidate);

    const nextResetId = crypto.randomUUID();
    expect((await execute(nextResetId)).status).toBe(200);
    expect(epoch()).not.toBe(candidate);
  });
});
