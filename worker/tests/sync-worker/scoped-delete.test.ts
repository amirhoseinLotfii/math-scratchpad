import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import { createApp } from '../../src/index';
import { validVerifier, call } from '../helpers/sync-worker';
describe('scoped delete', () => {
  afterEach(async () => reset());
  it('deletes only the explicitly requested server state key and rejects unrelated names', async () => {
    const app = createApp(validVerifier);
    const key = 'math-scratchpad-session-v3';
    await call(app, '/state', { token: 'valid-test-token', body: { key, value: 'temporary', revision: 0 } });
    const deleted = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key, value: null, revision: 1 },
    });
    expect(deleted.status).toBe(200);
    const afterDelete = await call(app, '/state', { token: 'valid-test-token' });
    expect(await afterDelete.json()).toMatchObject({ records: [{ key, value: null, revision: 2 }], revision: 2 });
    const invalid = await call(app, '/state', {
      token: 'valid-test-token',
      body: { key: 'another-app-secret', value: 'x', revision: 0 },
    });
    expect(invalid.status).toBe(400);
  });
});
