import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index';
import { ALLOWED_ORIGIN, testEnv, validVerifier } from '../helpers/drive-mirror';
describe('authenticated Drive status endpoints', () => {
  function request(app: ReturnType<typeof createApp>, path: string, method = 'GET') {
    return app.fetch(
      new Request(`https://worker.test${path}`, {
        method,
        headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN },
      }),
      testEnv,
    );
  }

  it('reports unconfigured Drive without exposing credentials, and rejects unauthenticated status reads', async () => {
    const app = createApp(validVerifier);
    const status = await request(app, '/drive/status');
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      status: 'not_configured',
      lastSyncedAt: null,
      pendingCount: 0,
      quarantinedCount: null,
      lastError: null,
      failureStage: null,
      weeklyBackup: { status: 'not_configured', lastCreatedAt: null, lastError: null },
    });
    const sync = await request(app, '/drive/sync', 'POST');
    expect(sync.status).toBe(503);
    expect(await sync.json()).toMatchObject({ drive: { status: 'not_configured' } });
    const unauthorized = await app.fetch(new Request('https://worker.test/drive/status'), testEnv);
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.text()).not.toContain('refresh_token');
  });
});
