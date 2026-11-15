import { describe, expect, it } from 'vitest';
import { runInDurableObject } from 'cloudflare:test';
import type { WorkerEnv } from '../../src/env';
import { NotionRequestQueue, type NotionClientPort, type NotionMirrorStatus } from '../../src/notion-mirror';
import { createApp } from '../../src/index';
import {
  OWNER_EMAIL,
  ALLOWED_ORIGIN,
  testEnv,
  validVerifier,
  sources,
  makeEvent,
  textValue,
  makeFakeNotion,
} from '../helpers/notion-mirror';
describe('Durable Object Notion sync checkpoints', () => {
  it('reports unconfigured status safely and protects manual sync with owner authentication', async () => {
    const app = createApp(validVerifier);
    const status = await app.fetch(
      new Request('https://worker.test/notion/status', {
        headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN },
      }),
      testEnv,
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      status: 'not_configured',
      lastSyncedAt: null,
      pendingCount: 0,
      quarantinedCount: null,
      lastError: null,
    });
    const manual = await app.fetch(
      new Request('https://worker.test/notion/sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN },
      }),
      testEnv,
    );
    expect(manual.status).toBe(503);
    expect(await manual.text()).not.toContain('NOTION_API_KEY');
    const unauthorized = await app.fetch(new Request('https://worker.test/notion/status'), testEnv);
    expect(unauthorized.status).toBe(401);
  });

  it('saves an attempt, session and report through the Worker and resumes without duplicate rows', async () => {
    const fake = makeFakeNotion();
    const event = makeEvent(30, { verdict: 'incorrect', verdictSource: 'checker', confidence: 2, errorTag: 'sign' });
    const app = createApp(validVerifier);
    const response = await app.fetch(
      new Request('https://worker.test/events', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [event] }),
      }),
      testEnv,
    );
    expect(response.status).toBe(200);

    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const status = await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        env: WorkerEnv;
        notionClient: NotionClientPort | undefined;
        notionRequests: NotionRequestQueue;
        performNotionSync: () => Promise<NotionMirrorStatus>;
      };
      Object.assign(target.env, { NOTION_API_KEY: 'test-only-not-a-secret' });
      target.notionClient = fake.client;
      target.notionRequests = new NotionRequestQueue(0, async () => undefined);
      const first = await target.performNotionSync();
      const second = await target.performNotionSync();
      expect(second.pendingCount).toBe(0);
      return first;
    });

    expect(status).toMatchObject({ status: 'synced', pendingCount: 0, lastError: null });
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.attempts)).toHaveLength(1);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.sessions)).toHaveLength(1);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.mistakes)).toHaveLength(1);
    expect(fake.operations.filter((operation) => operation.kind === 'create')).toHaveLength(5);
  });

  it('quarantines unclassified events, advances the cursor, and writes only explicitly classified events', async () => {
    const fake = makeFakeNotion();
    const live = makeEvent(31);
    const unclassified = makeEvent(32, { isTest: undefined });
    const app = createApp(validVerifier);
    const response = await app.fetch(
      new Request('https://worker.test/events', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [live, unclassified] }),
      }),
      testEnv,
    );
    expect(response.status).toBe(200);

    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const status = await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        env: WorkerEnv;
        notionClient: NotionClientPort | undefined;
        notionRequests: NotionRequestQueue;
        performNotionSync: () => Promise<NotionMirrorStatus>;
      };
      Object.assign(target.env, { NOTION_API_KEY: 'test-only-not-a-secret' });
      target.notionClient = fake.client;
      target.notionRequests = new NotionRequestQueue(0, async () => undefined);
      return target.performNotionSync();
    });

    expect(status).toMatchObject({ status: 'synced', pendingCount: 0, quarantinedCount: 1 });
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.attempts)).toHaveLength(1);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.sessions)).toHaveLength(1);
    expect([...fake.pages.values()].some((page) => textValue(page.properties['Event ID']) === unclassified.id)).toBe(false);
  });

  it('keeps the successful cursor checkpoint when Notion fails partway, then resumes without duplicate rows', async () => {
    const fake = makeFakeNotion();
    fake.failCreates.add(sources.attempts);
    const events = [
      makeEvent(40, { verdict: 'correct', verdictSource: 'checker', attemptNo: 1 }),
      makeEvent(41, { itemId: 'PC-1.1-L02', verdict: 'submitted', verdictSource: 'none', attemptNo: 1 }),
    ];
    const app = createApp(validVerifier);
    const response = await app.fetch(
      new Request('https://worker.test/events', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      }),
      testEnv,
    );
    expect(response.status).toBe(200);

    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const result = await runInDurableObject(stub, async (instance) => {
      const target = instance as unknown as {
        env: WorkerEnv;
        notionClient: NotionClientPort | undefined;
        notionRequests: NotionRequestQueue;
        performNotionSync: () => Promise<NotionMirrorStatus>;
      };
      Object.assign(target.env, { NOTION_API_KEY: 'test-only-not-a-secret' });
      target.notionClient = fake.client;
      target.notionRequests = new NotionRequestQueue(0, async () => undefined);
      const failed = await target.performNotionSync();
      expect(failed).toMatchObject({ status: 'error', pendingCount: 1, lastError: 'remote_error' });
      expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.attempts)).toHaveLength(1);

      fake.failCreates.clear();
      const retried = await target.performNotionSync();
      expect(retried).toMatchObject({ status: 'synced', pendingCount: 0, lastError: null });
      return retried;
    });

    expect(result.status).toBe('synced');
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.attempts)).toHaveLength(2);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.sessions)).toHaveLength(1);
  });
});
