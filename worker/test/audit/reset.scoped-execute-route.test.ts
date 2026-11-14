import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { createApp } from '../../src/index';
import type { WorkerEnv } from '../../src/env';
import type { LearnEvent } from '../../../src/sync/events';

type Fixture = {
  app: ReturnType<typeof createApp>;
  workerEnv: WorkerEnv;
  ownerEmail: string;
};

type TestStore = {
  env: WorkerEnv;
  driveConfigured: () => boolean;
  ctx: { storage: { sql: { exec<T = Record<string, unknown>>(sql: string, ...args: Array<string | number | null>): { one: () => T; toArray: () => T[] } } } };
};

const scope = { type: 'lesson', id: '1.1', chapter: 1, bankVersion: 'v21' } as const;
const previewPath = `/reset/preview?${new URLSearchParams({ scope: 'lesson', bankVersion: 'v21', chapter: '1', lesson: '1.1' })}`;

async function createFixture(): Promise<Fixture> {
  const base = env as unknown as WorkerEnv;
  const ownerEmail = `scoped-reset-${crypto.randomUUID()}@example.test`;
  const workerEnv = { ...base, OWNER_EMAIL: ownerEmail, SCOPED_RESET_ENABLED: 'true' } as WorkerEnv;
  const stub = workerEnv.EVENT_STORE.get(workerEnv.EVENT_STORE.idFromName(ownerEmail));
  await runInDurableObject(stub, instance => {
    const target = instance as unknown as TestStore;
    // The scenario is intentionally synthetic and local. Do not let a local
    // secret or Wrangler fixture turn this test into a real mirror operation.
    Object.assign(target.env, {
      GOOGLE_DRIVE_CLIENT_SECRET: undefined,
      GOOGLE_DRIVE_REFRESH_TOKEN: undefined,
      NOTION_API_KEY: undefined,
      NOTION_DATA_SOURCE_ATTEMPTS: '',
      NOTION_DATA_SOURCE_SESSIONS: '',
      NOTION_DATA_SOURCE_MISTAKES: '',
      NOTION_DATA_SOURCE_CONCEPTS: '',
      NOTION_DATA_SOURCE_DAILY_REPORTS: '',
    });
    target.driveConfigured = () => false;
  });
  const app = createApp(async () => ({ sub: 'synthetic-scoped-reset', email: ownerEmail, email_verified: true }));
  return { app, workerEnv, ownerEmail };
}

function request(fixture: Fixture, path: string, options: {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
} = {}) {
  const headers = new Headers({ Authorization: 'Bearer synthetic', ...options.headers });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return fixture.app.fetch(new Request(`https://worker.test${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  }), fixture.workerEnv);
}

function event(overrides: Partial<LearnEvent> = {}): LearnEvent {
  return {
    id: crypto.randomUUID(),
    schema: 1,
    ts: new Date().toISOString(),
    deviceId: crypto.randomUUID(),
    bankVersion: 'v21',
    session: 'synthetic-session',
    chapter: 1,
    lesson: '1.1',
    section: '1.1',
    concept: 'synthetic-concept',
    type: 'lesson_open',
    isTest: true,
    ...overrides,
  };
}

async function seedEvents(fixture: Fixture, events: LearnEvent[]) {
  const response = await request(fixture, '/events', { body: { events } });
  expect(response.status).toBe(200);
}

async function preview(fixture: Fixture) {
  const response = await request(fixture, previewPath);
  expect(response.status).toBe(200);
  return await response.json() as {
    readOnly: boolean;
    canExecute: boolean;
    scopedExecution?: { eligible: boolean; snapshotToken: string | null; matchingEvents: number; blockers: string[] };
  };
}

async function confirmReview(fixture: Fixture, operationId: string, snapshotToken: string) {
  return request(fixture, '/reset/execute', {
    body: {
      action: 'confirm_review', operationId, scope, snapshotToken,
      confirmation: 'I_REVIEWED_SCOPED_RESET_PREVIEW',
    },
    headers: { 'Idempotency-Key': operationId },
  });
}

async function confirmDelete(fixture: Fixture, operationId: string) {
  return request(fixture, '/reset/execute', {
    body: { action: 'confirm_delete', operationId, confirmation: 'I_CONFIRM_SCOPED_LEARNING_DATA_DELETION' },
    headers: { 'Idempotency-Key': operationId },
  });
}

async function execute(fixture: Fixture, operationId: string) {
  return request(fixture, '/reset/execute', {
    body: { action: 'execute', operationId },
    headers: { 'Idempotency-Key': operationId },
  });
}

it('reset.scoped-execute.preview-confirms-twice-executes-and-preserves-unrelated-data', async () => {
  const fixture = await createFixture();
  const targetEvent = event();
  const siblingLesson = event({ lesson: '1.2', section: '1.2' });
  const otherChapter = event({ chapter: 2, lesson: '2.1', section: '2.1' });
  const otherBank = event({ bankVersion: 'v22' });
  await seedEvents(fixture, [targetEvent, siblingLesson, otherChapter, otherBank]);
  for (const [key, value] of [
    ['math-scratchpad-user-preferences-v1', '{"theme":"dark"}'],
    ['math-scratchpad-drive-config-v1', '{"fileId":"synthetic-bank"}'],
  ]) {
    const saved = await request(fixture, '/state', { body: { key, value, revision: 0 } });
    expect(saved.status).toBe(200);
  }

  const before = await preview(fixture);
  expect(before).toMatchObject({ readOnly: true, canExecute: false });
  expect(before.scopedExecution).toMatchObject({ eligible: true, matchingEvents: 1, blockers: [] });
  const token = before.scopedExecution?.snapshotToken;
  expect(token).toMatch(/^scoped-v1-[0-9a-f]{16}$/);

  const op = crypto.randomUUID();
  expect((await execute(fixture, op)).status).toBe(409); // Execution requires two distinct confirmations.
  expect((await confirmReview(fixture, op, token!)).status).toBe(200);
  expect((await confirmDelete(fixture, op)).status).toBe(200);
  const executed = await execute(fixture, op);
  expect(executed.status).toBe(200);
  expect(await executed.json()).toMatchObject({ completed: true, deletedEvents: 1, preservedEvents: 3, cloudReconciliation: 'not_configured' });

  // A new Worker app instance and a fresh namespace stub observe the durable journal.
  const restartedApp = createApp(async () => ({ sub: 'synthetic-scoped-reset', email: fixture.ownerEmail, email_verified: true }));
  const retry = await restartedApp.fetch(new Request('https://worker.test/reset/execute', {
    method: 'POST',
    headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json', 'Idempotency-Key': op },
    body: JSON.stringify({ action: 'execute', operationId: op }),
  }), fixture.workerEnv);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({ completed: true, deletedEvents: 1, idempotent: true });

  const savedEvents = await (await request(fixture, '/snapshot')).json() as { events: Array<{ event: LearnEvent }> };
  expect(savedEvents.events.map(item => item.event.id)).toEqual([siblingLesson.id, otherChapter.id, otherBank.id]);
  const savedState = await (await request(fixture, '/state')).json() as { records: Array<{ key: string; value: string }> };
  expect(savedState.records).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: 'math-scratchpad-user-preferences-v1', value: '{"theme":"dark"}' }),
    expect.objectContaining({ key: 'math-scratchpad-drive-config-v1', value: '{"fileId":"synthetic-bank"}' }),
  ]));
});

it('reset.scoped-execute-rejects-stale-preview-and-shared-state-without-deletion', async () => {
  const fixture = await createFixture();
  const targetEvent = event();
  await seedEvents(fixture, [targetEvent]);
  const firstPreview = await preview(fixture);
  const staleOperation = crypto.randomUUID();
  await seedEvents(fixture, [event({ lesson: '1.2', section: '1.2' })]);
  const stale = await confirmReview(fixture, staleOperation, firstPreview.scopedExecution!.snapshotToken!);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: 'stale_reset_preview' });

  const state = await request(fixture, '/state', {
    body: { key: 'math-scratchpad-session-v3', value: '{"draft":true}', revision: 0 },
  });
  expect(state.status).toBe(200);
  const blockedPreview = await preview(fixture);
  expect(blockedPreview.scopedExecution).toMatchObject({ eligible: false, blockers: ['learning_state_requires_selective_merge'] });
  const blockedOperation = crypto.randomUUID();
  const blocked = await confirmReview(fixture, blockedOperation, blockedPreview.scopedExecution!.snapshotToken!);
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({ error: 'scoped_reset_not_safe' });
  const remains = await (await request(fixture, '/snapshot')).json() as { events: Array<{ event: LearnEvent }> };
  expect(remains.events.map(item => item.event.id)).toContain(targetEvent.id);
});

it('reset.scoped-execute-serializes-concurrent-retries-and-deletes-once', async () => {
  const fixture = await createFixture();
  await seedEvents(fixture, [event()]);
  const first = await preview(fixture);
  const token = first.scopedExecution!.snapshotToken!;
  const op = crypto.randomUUID();
  expect((await confirmReview(fixture, op, token)).status).toBe(200);
  expect((await confirmDelete(fixture, op)).status).toBe(200);

  const responses = await Promise.all([execute(fixture, op), execute(fixture, op)]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  const results = await Promise.all(responses.map(response => response.json() as Promise<{ deletedEvents: number; idempotent?: boolean }>));
  expect(results.filter(result => result.deletedEvents === 1)).toHaveLength(2);
  expect(results.some(result => result.idempotent)).toBe(true);
  const remaining = await (await request(fixture, '/snapshot')).json() as { events: LearnEvent[] };
  expect(remaining.events).toHaveLength(0);
});

it('reset.scoped-execute-is-owner-authenticated-and-disabled-without-the-feature-flag', async () => {
  const base = env as unknown as WorkerEnv;
  const unauthorized = createApp(async () => ({ sub: 'synthetic-other', email: 'other@example.test', email_verified: true }));
  const requestBody = JSON.stringify({ action: 'execute', operationId: crypto.randomUUID() });
  const ownerResponse = await unauthorized.fetch(new Request('https://worker.test/reset/execute', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: requestBody,
  }), base);
  expect(ownerResponse.status).toBe(401);

  const disabledEnv = { ...base, SCOPED_RESET_ENABLED: undefined } as WorkerEnv;
  const owner = createApp(async () => ({ sub: 'synthetic-owner', email: base.OWNER_EMAIL, email_verified: true }));
  const disabled = await owner.fetch(new Request('https://worker.test/reset/execute', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: requestBody,
  }), disabledEnv);
  expect(disabled.status).toBe(503);
  expect(await disabled.json()).toMatchObject({ error: 'scoped_reset_disabled' });
});
