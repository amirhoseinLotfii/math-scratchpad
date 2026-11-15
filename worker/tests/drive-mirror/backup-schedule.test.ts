import { describe, expect, it } from 'vitest';
import { requestWeeklyDriveBackup } from '../../src/index';
import type { WorkerEnv } from '../../src/env';
import { OWNER_EMAIL } from '../helpers/drive-mirror';
describe('scheduled weekly backup trigger', () => {
  it('targets only the normalized owner Durable Object and passes the scheduled instant', async () => {
    const requests: Array<{ owner: string; url: string; method: string }> = [];
    const fakeNamespace = {
      idFromName(ownerId: string) {
        return ownerId;
      },
      get(ownerId: string) {
        return {
          fetch: async (request: Request) => {
            requests.push({ owner: ownerId, url: request.url, method: request.method });
            return Response.json({ weeklyBackup: { status: 'created' } });
          },
        };
      },
    };
    const scheduledTime = Date.UTC(2026, 10, 8, 2);
    await requestWeeklyDriveBackup(
      { OWNER_EMAIL: ` ${OWNER_EMAIL.toUpperCase()} `, EVENT_STORE: fakeNamespace } as unknown as Pick<
        WorkerEnv,
        'OWNER_EMAIL' | 'EVENT_STORE'
      >,
      scheduledTime,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].owner).toBe(OWNER_EMAIL.toLowerCase());
    expect(new URL(requests[0].url).searchParams.get('scheduledTime')).toBe(String(scheduledTime));
    expect(requests[0].method).toBe('POST');
  });
});
