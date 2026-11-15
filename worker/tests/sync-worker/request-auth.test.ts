import { afterEach, describe, expect, it } from 'vitest';
import { reset } from 'cloudflare:test';
import { createApp } from '../../src/index';
import { LEARNING_RESET_EPOCH_HEADER } from '../../../shared/contracts/reset-epoch';
import { ALLOWED_ORIGIN, OWNER, validVerifier, makeEvent, call } from '../helpers/sync-worker';
describe('request auth', () => {
  afterEach(async () => reset());
  it('serves health and exact-origin CORS preflight; rejects other origins', async () => {
    const app = createApp(validVerifier);
    const health = await call(app, '/health', { origin: ALLOWED_ORIGIN });
    expect(health.status).toBe(200);
    expect(health.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(health.headers.get('Cache-Control')).toBe('no-store');
    const apiResponse = await call(app, '/sync', { token: 'valid-test-token', origin: ALLOWED_ORIGIN });
    expect(apiResponse.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);

    const preflight = await call(app, '/events', {
      method: 'OPTIONS',
      origin: ALLOWED_ORIGIN,
      extraHeaders: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key,x-math-scratchpad-reset-epoch',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain(LEARNING_RESET_EPOCH_HEADER);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Idempotency-Key');

    const foreign = await call(app, '/health', { origin: 'https://example.com' });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.has('Access-Control-Allow-Origin')).toBe(false);
    const badPreflight = await call(app, '/events', { method: 'OPTIONS', origin: 'https://example.com' });
    expect(badPreflight.status).toBe(403);
  });

  it('requires a bearer ID token and the one configured owner email', async () => {
    const app = createApp(async (token) => {
      if (token === 'valid-test-token') return OWNER;
      if (token === 'other-owner-token') return { ...OWNER, email: 'other@example.com' };
      throw new Error('invalid token');
    });
    expect((await call(app, '/sync')).status).toBe(401);
    expect((await call(app, '/sync', { token: 'bad-token' })).status).toBe(401);
    expect((await call(app, '/sync', { token: 'other-owner-token' })).status).toBe(401);
    expect((await call(app, '/sync', { token: 'valid-test-token' })).status).toBe(200);
    const corsAuthFailure = await call(app, '/sync', { token: 'bad-token', origin: ALLOWED_ORIGIN });
    expect(corsAuthFailure.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  it('requires owner login and complete scope filters for the read-only reset preflight', async () => {
    const app = createApp(validVerifier);
    expect((await call(app, '/reset/preview?scope=all')).status).toBe(401);
    expect((await call(app, '/reset/preview?scope=unknown', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/preview?scope=section&lesson=L1', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/preview?scope=all&session=x', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/preview?scope=session&session=x&lesson=ignored', { token: 'valid-test-token' })).status).toBe(400);
    expect((await call(app, '/reset/execute', { token: 'valid-test-token', body: {} })).status).toBe(400);
  });

  it('shows all-data reset impact but preserves the question bank config and server state', async () => {
    const app = createApp(validVerifier);
    await call(app, '/events', { token: 'valid-test-token', body: { events: [makeEvent()] } });
    await call(app, '/state', {
      token: 'valid-test-token',
      body: { key: 'math-scratchpad-drive-config-v1', value: '{"fileId":"bank-safe"}', revision: 0 },
    });
    await call(app, '/state', {
      token: 'valid-test-token',
      body: { key: 'math-scratchpad-session-v3', value: '{"draft":true}', revision: 0 },
    });
    const preview = await call(app, '/reset/preview?scope=all', { token: 'valid-test-token' });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      readOnly: true,
      canExecute: false,
      scope: 'all',
      matchingEvents: 1,
      totalEvents: 1,
      lastSeq: 1,
      protectedBankAndIdentityStateKeys: 1,
      sharedStateKeysRequiringSelectiveMerge: 1,
      requiresCloudReconciliation: true,
    });
    const saved = (await (await call(app, '/state', { token: 'valid-test-token' })).json()) as {
      records: { key: string; value: string }[];
    };
    expect(saved.records.some((x) => x.key === 'math-scratchpad-drive-config-v1' && x.value.includes('bank-safe'))).toBe(true);
    expect(saved.records.some((x) => x.key === 'math-scratchpad-session-v3')).toBe(true);
  });

  it('counts only the selected lesson or section without altering the event log', async () => {
    const app = createApp(validVerifier);
    const event = makeEvent();
    await call(app, '/events', { token: 'valid-test-token', body: { events: [event] } });
    const lesson = new URLSearchParams({
      scope: 'lesson',
      bankVersion: event.bankVersion,
      chapter: String(event.chapter),
      lesson: event.lesson,
    });
    expect(await (await call(app, `/reset/preview?${lesson}`, { token: 'valid-test-token' })).json()).toMatchObject({
      scope: 'lesson',
      matchingEvents: 1,
      canExecute: false,
    });
    const otherSection = new URLSearchParams({
      scope: 'section',
      bankVersion: event.bankVersion,
      chapter: String(event.chapter),
      lesson: event.lesson,
      section: 'other-section',
    });
    expect(await (await call(app, `/reset/preview?${otherSection}`, { token: 'valid-test-token' })).json()).toMatchObject({
      matchingEvents: 0,
    });
    expect(((await (await call(app, '/snapshot', { token: 'valid-test-token' })).json()) as { events: unknown[] }).events).toHaveLength(1);
  });

  it('isolates a lesson preview when the same lesson ID exists in another chapter', async () => {
    const app = createApp(validVerifier);
    const first = makeEvent();
    const identicalIdOtherChapter = { ...makeEvent(), chapter: 2 };
    const sent = await call(app, '/events', { token: 'valid-test-token', body: { events: [first, identicalIdOtherChapter] } });
    expect(sent.status).toBe(200);
    const forFirst = new URLSearchParams({ scope: 'lesson', bankVersion: first.bankVersion, chapter: '1', lesson: first.lesson });
    expect(await (await call(app, `/reset/preview?${forFirst}`, { token: 'valid-test-token' })).json()).toMatchObject({
      scope: 'lesson',
      matchingEvents: 1,
      totalEvents: 2,
      canExecute: false,
    });
    const forOther = new URLSearchParams({ scope: 'lesson', bankVersion: first.bankVersion, chapter: '2', lesson: first.lesson });
    expect(await (await call(app, `/reset/preview?${forOther}`, { token: 'valid-test-token' })).json()).toMatchObject({
      scope: 'lesson',
      matchingEvents: 1,
      totalEvents: 2,
      canExecute: false,
    });
    const missingChapter = new URLSearchParams({ scope: 'lesson', bankVersion: first.bankVersion, lesson: first.lesson });
    expect((await call(app, `/reset/preview?${missingChapter}`, { token: 'valid-test-token' })).status).toBe(400);
    expect(((await (await call(app, '/snapshot', { token: 'valid-test-token' })).json()) as { events: unknown[] }).events).toHaveLength(2);
  });

  it('previews a chapter by numeric ID and bank version without touching other chapters or sessions', async () => {
    const app = createApp(validVerifier);
    const first = makeEvent();
    const otherChapter = { ...makeEvent(), id: crypto.randomUUID(), chapter: 2, lesson: '2.1', section: '2.1' };
    const otherBank = { ...makeEvent(), id: crypto.randomUUID(), bankVersion: 'v22' };
    const write = await call(app, '/events', {
      token: 'valid-test-token',
      body: { events: [first, otherChapter, otherBank] },
    });
    expect(write.status).toBe(200);
    const scoped = new URLSearchParams({ scope: 'chapter', bankVersion: 'v21', chapter: '1' });
    const preview = await call(app, `/reset/preview?${scoped}`, { token: 'valid-test-token' });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      readOnly: true,
      canExecute: false,
      scope: 'chapter',
      filters: { bankVersion: 'v21', chapter: '1' },
      matchingEvents: 1,
      totalEvents: 3,
      requiresCloudReconciliation: true,
    });
    const other = new URLSearchParams({ scope: 'chapter', bankVersion: 'v21', chapter: '2' });
    expect(await (await call(app, `/reset/preview?${other}`, { token: 'valid-test-token' })).json()).toMatchObject({
      matchingEvents: 1,
      totalEvents: 3,
    });
    expect(((await (await call(app, '/snapshot', { token: 'valid-test-token' })).json()) as { events: unknown[] }).events).toHaveLength(3);
  });

  it('rejects incomplete or malformed chapter reset filters without a learning write', async () => {
    const app = createApp(validVerifier);
    const invalid = [
      '/reset/preview?scope=chapter&chapter=1',
      '/reset/preview?scope=chapter&bankVersion=v21&chapter=1.0',
      '/reset/preview?scope=chapter&bankVersion=v21&chapter=0',
      '/reset/preview?scope=chapter&bankVersion=v21&chapter=1&lesson=2.1',
    ];
    for (const path of invalid) {
      const result = await call(app, path, { token: 'valid-test-token' });
      expect(result.status).toBe(400);
    }
    const snapshot = await call(app, '/snapshot', { token: 'valid-test-token' });
    expect(((await snapshot.json()) as { events: unknown[] }).events).toEqual([]);
  });
});
