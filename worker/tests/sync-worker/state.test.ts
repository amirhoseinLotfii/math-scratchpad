import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import { createApp } from '../../src/index';
import { LEARNING_RESET_EPOCH, LEARNING_RESET_EPOCH_HEADER } from '../../../shared/contracts/reset-epoch';
import { OWNER_EMAIL, testEnv, validVerifier, makeEvent, call } from '../helpers/sync-worker';
describe('state', () => {
  afterEach(async () => reset());
  it('persists the editor snapshot on the server with owner authentication and conflict protection', async () => {
    const app = createApp(validVerifier);
    const key = 'math-scratchpad-session-v3';
    expect((await call(app, '/state')).status).toBe(401);
    const empty = await call(app, '/state', { token: 'valid-test-token' });
    expect(await empty.json()).toMatchObject({ records: [], revision: 0 });
    const created = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key, value: '{"draft":1}', revision: 0 },
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ key, revision: 1, updatedAt: expect.any(String) });
    const conflict = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key, value: '{"draft":0}', revision: 0 },
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'state_conflict', revision: 1 });
    const fetched = await call(app, '/state', { token: 'valid-test-token' });
    expect(await fetched.json()).toMatchObject({ records: [{ key, value: '{"draft":1}', revision: 1, updatedAt: expect.any(String) }] });
    const updated = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key, value: '{"draft":2}', revision: 1 },
    });
    expect(updated.status).toBe(200);
  });

  it('reports the UTF-8 state value limit without changing accepted data', async () => {
    const app = createApp(validVerifier);
    const key = 'math-scratchpad-session-v3';
    const value = 'م'.repeat(500_000);
    const atLimit = await call(app, '/state', { token: 'valid-test-token', body: { key, value, revision: 0 } });
    expect(atLimit.status).toBe(200);
    const rejected = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key, value: value + 'a', revision: 1 },
    });
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toEqual({ error: 'state_value_too_large', key, bytes: 1_000_001, limit: 1_000_000 });
    const result = await call(app, '/state', { token: 'valid-test-token' });
    const state = (await result.json()) as { records: Array<{ revision: number; value: string }> };
    expect(state.records[0].revision).toBe(1);
    expect(state.records[0].value === value).toBe(true);
  });

  it('rejects writes from stale clients after reset and accepts the current reset epoch', async () => {
    const app = createApp(validVerifier);
    const stub = testEnv.EVENT_STORE.get(testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase()));
    const resetId = crypto.randomUUID();
    const { runInDurableObject } = await import('cloudflare:test');
    await runInDurableObject(stub, (instance) => {
      const target = instance as unknown as {
        ctx: { storage: { sql: { exec: (sql: string, ...bindings: string[]) => unknown } } };
      };
      target.ctx.storage.sql.exec(
        "UPDATE learning_reset_control SET status = 'released', reset_id = ?, client_epoch = ? WHERE singleton = 1",
        resetId,
        LEARNING_RESET_EPOCH,
      );
    });

    const staleEvent = await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } });
    expect(staleEvent.status).toBe(426);
    expect(await staleEvent.json()).toMatchObject({ error: 'client_update_required' });
    const staleState = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key: 'math-scratchpad-session-v3', value: 'old', revision: 0 },
    });
    expect(staleState.status).toBe(426);

    const currentHeaders = { [LEARNING_RESET_EPOCH_HEADER]: LEARNING_RESET_EPOCH };
    const currentEvent = await call(app, '/events', {
      token: 'valid-test-token',
      body: { events: [makeEvent()] },
      extraHeaders: currentHeaders,
    });
    expect(currentEvent.status).toBe(200);
    const currentState = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key: 'math-scratchpad-session-v3', value: 'new', revision: 0 },
      extraHeaders: currentHeaders,
    });
    expect(currentState.status).toBe(200);
  });
});
