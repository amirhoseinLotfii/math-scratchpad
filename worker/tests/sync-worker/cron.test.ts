import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import type { WorkerEnv } from '../../src/env';
import { OWNER_EMAIL, testEnv } from '../helpers/sync-worker';
describe('Math Scratchpad sync Worker API and SQLite Durable Object', () => {
  it('keeps cron mirror syncs independent and returns only sanitized failures and request counts', async () => {
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const { runInDurableObject } = await import('cloudflare:test');
    await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        syncDrive: () => Promise<unknown>;
        syncNotion: () => Promise<unknown>;
        fetch: (request: Request) => Promise<Response>;
        activeMirrorSubrequestBudget?: { used: number; limit: number };
        budgetedFetch: typeof fetch;
      };
      target.activeMirrorSubrequestBudget = { used: 40, limit: 40 };
      expect(() => target.budgetedFetch('https://example.test')).toThrow('subrequest_budget_exceeded');
      target.activeMirrorSubrequestBudget = undefined;
      const calls: string[] = [];
      target.syncDrive = async () => {
        calls.push('drive');
        throw new Error('synthetic secret detail');
      };
      target.syncNotion = async () => {
        calls.push('notion');
        return { status: 'synced', pendingCount: 0 };
      };

      const response = await target.fetch(new Request('https://event-store.internal/internal/sync-all', { method: 'POST' }));
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(calls.sort()).toEqual(['drive', 'notion']);
      expect(body).toContain('"status":"error"');
      expect(body).toContain('"status":"synced"');
      expect(body).toContain('"subrequestsUsed":0');
      expect(body).toContain('"subrequestLimit":40');
      expect(body).not.toContain('synthetic secret detail');
    });
  });

  it('does not let a Drive timeout prevent Notion mirror work', async () => {
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const { runInDurableObject } = await import('cloudflare:test');
    await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        env: WorkerEnv;
        notionClient?: unknown;
        syncDrive: () => Promise<unknown>;
        syncNotion: () => Promise<unknown>;
        alarm: () => Promise<void>;
      };
      const originalBindings = {
        GOOGLE_DRIVE_CLIENT_SECRET: target.env.GOOGLE_DRIVE_CLIENT_SECRET,
        GOOGLE_DRIVE_REFRESH_TOKEN: target.env.GOOGLE_DRIVE_REFRESH_TOKEN,
        NOTION_API_KEY: target.env.NOTION_API_KEY,
        notionClient: target.notionClient,
      };
      Object.assign(target.env, {
        GOOGLE_DRIVE_CLIENT_SECRET: 'test-not-secret',
        GOOGLE_DRIVE_REFRESH_TOKEN: 'test-not-token',
        NOTION_API_KEY: 'test-not-secret',
      });
      try {
        const calls: string[] = [];
        target.syncDrive = async () => {
          calls.push('drive');
          throw new Error('timeout');
        };
        target.syncNotion = async () => {
          calls.push('notion');
          return {};
        };
        await target.alarm();
        expect(calls).toContain('notion');
        expect(calls).toContain('drive');
      } finally {
        Object.assign(target.env, {
          GOOGLE_DRIVE_CLIENT_SECRET: originalBindings.GOOGLE_DRIVE_CLIENT_SECRET,
          GOOGLE_DRIVE_REFRESH_TOKEN: originalBindings.GOOGLE_DRIVE_REFRESH_TOKEN,
          NOTION_API_KEY: originalBindings.NOTION_API_KEY,
        });
        target.notionClient = originalBindings.notionClient;
      }
    });
  });

  afterEach(async () => reset());
});
