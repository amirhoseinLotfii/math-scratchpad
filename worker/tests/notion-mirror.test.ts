import { afterEach, describe, expect, it, vi } from 'vitest';
import { env, reset, runInDurableObject } from 'cloudflare:test';
import type { LearnEvent } from '../../src/sync/events';
import type { WorkerEnv } from '../src/env';
import {
  applyDailyEvent,
  applySessionEvent,
  buildAttemptProperties,
  buildConceptProperties,
  buildDailyReportProperties,
  confidenceCalibration,
  tehranDateTime,
  tehranDayKey,
  type ConceptProjection,
} from '../src/notion-projection';
import {
  NotionRequestQueue,
  syncNotionEvent,
  type NotionClientPort,
  type NotionDataSources,
  type NotionEventContext,
  type NotionMirrorStatus,
} from '../src/notion-mirror';
import { createApp, type IdTokenVerifier } from '../src/index';
import type { GoogleIdentity } from '../src/env';

const OWNER_EMAIL = 'amirhoseinlotfalizadeprogramer@gmail.com';
const ALLOWED_ORIGIN = 'https://amirhoseinlotfii.github.io';
const testEnv = env as unknown as WorkerEnv;
const owner: GoogleIdentity = { sub: 'test-owner', email: OWNER_EMAIL, email_verified: true };
const validVerifier: IdTokenVerifier = async token => {
  if (token !== 'valid-test-token') throw new Error('invalid_token');
  return owner;
};
const sources: NotionDataSources = {
  attempts: '0303207d-a6a8-4631-9fa8-3b09942e9046',
  sessions: '87f156ae-7937-4fbe-9301-103c7dfb57a7',
  mistakes: 'c94b70b8-1ca5-4ddc-9519-edc43a075cc4',
  concepts: 'e2f2f7a0-dfb8-424a-b464-fb8af13566c7',
  dailyReports: '6c154e26-ac84-4537-a66a-9e6be62d4f23',
};

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

function makeEvent(index: number, overrides: Partial<LearnEvent> = {}): LearnEvent {
  const uuid = (value: number) => '00000000-0000-4000-8000-' + value.toString(16).padStart(12, '0');
  return {
    id: uuid(index),
    schema: 1,
    isTest: false,
    ts: '2026-11-02T00:00:00.000Z',
    deviceId: uuid(999),
    bankVersion: 'v21',
    session: 'S001',
    chapter: 1,
    lesson: '1.1',
    section: '1.1',
    concept: 'domain-range',
    type: 'exercise_attempt',
    itemId: 'PC-1.1-L01',
    itemType: 'typed',
    questionText: 'دامنهٔ {(1,2),(2,4)} را بنویس.',
    userAnswer: '{1, 2}',
    steps: ['زوج‌های مرتب را می‌خوانم.', 'مولفه‌های اول را می‌گیرم.'],
    verdict: 'submitted',
    verdictSource: 'none',
    attemptNo: 1,
    durationMs: 90_000,
    activeMs: 60_000,
    distractedMs: 10_000,
    ...overrides,
  };
}

type PropertyRecord = Record<string, unknown>;
type FakePage = { id: string; dataSourceId: string; properties: PropertyRecord };

function textValue(property: unknown): string {
  if (!property || typeof property !== 'object') return '';
  const record = property as Record<string, unknown>;
  const pieces = (record.title ?? record.rich_text) as Array<{ text?: { content?: string }; plain_text?: string }> | undefined;
  return pieces?.map(piece => piece.plain_text ?? piece.text?.content ?? '').join('') ?? '';
}

function makeFakeNotion() {
  const pages = new Map<string, FakePage>();
  const operations: Array<{ kind: 'query' | 'create' | 'update'; dataSourceId?: string; pageId?: string; properties?: PropertyRecord }> = [];
  const failCreates = new Set<string>();
  let nextId = 0;
  const client: NotionClientPort = {
    dataSources: {
      query: async args => {
        const sourceId = String(args.data_source_id);
        const filter = args.filter as Record<string, unknown>;
        const propertyName = String(filter.property);
        const condition = (filter.rich_text ?? filter.title) as { equals?: string };
        operations.push({ kind: 'query', dataSourceId: sourceId });
        const match = [...pages.values()].find(page => page.dataSourceId === sourceId
          && textValue(page.properties[propertyName]) === condition.equals);
        return { results: match ? [{ id: match.id }] : [] };
      },
    },
    pages: {
      create: async args => {
        const parent = args.parent as { data_source_id?: string };
        const properties = args.properties as PropertyRecord;
        if (failCreates.has(String(parent.data_source_id))
          && operations.some(operation => operation.kind === 'create' && operation.dataSourceId === String(parent.data_source_id))) {
          throw Object.assign(new Error('temporary remote failure'), { status: 503 });
        }
        const id = 'notion-page-' + (++nextId);
        pages.set(id, { id, dataSourceId: String(parent.data_source_id), properties: { ...properties } });
        operations.push({ kind: 'create', dataSourceId: String(parent.data_source_id), pageId: id, properties });
        return { id };
      },
      retrieve: async args => {
        const id = String(args.page_id);
        const page = pages.get(id);
        if (!page) throw Object.assign(new Error('not found'), { status: 404 });
        return { id, parent: { type: 'data_source_id', data_source_id: page.dataSourceId }, properties: page.properties };
      },
      update: async args => {
        const id = String(args.page_id);
        const page = pages.get(id);
        if (!page) throw Object.assign(new Error('not found'), { status: 404 });
        const properties = args.properties as PropertyRecord;
        page.properties = { ...page.properties, ...properties };
        operations.push({ kind: 'update', pageId: id, properties });
        return { id };
      },
    },
  };
  return { client, pages, operations, failCreates };
}

function makeContext(client: NotionClientPort): NotionEventContext {
  const refs = new Map<string, string>();
  const mistakeStates = new Map<string, { eventId: string; reviewSuccesses: number; lastReviewEventId?: string }>();
  const mistakesBySession = new Map<string, Set<string>>();
  return {
    client,
    dataSources: sources,
    now: '2026-11-02T00:05:00.000Z',
    call: operation => operation(),
    getPageRef: async (kind, key) => refs.get(kind + ':' + key),
    setPageRef: async (kind, key, pageId) => { refs.set(kind + ':' + key, pageId); },
    getMistakeState: async key => mistakeStates.get(key),
    setMistakeState: async (key, state) => { mistakeStates.set(key, state); },
    getSessionMistakePageIds: async session => [...(mistakesBySession.get(session) ?? [])],
    addSessionMistakePageId: async (session, pageId) => {
      const ids = mistakesBySession.get(session) ?? new Set<string>();
      ids.add(pageId);
      mistakesBySession.set(session, ids);
    },
    getSessionPageIds: async sessionIds => sessionIds.flatMap(session => {
      const id = refs.get('session:' + session);
      return id ? [id] : [];
    }),
  };
}

function rowBySource(pages: Map<string, FakePage>, sourceId: string): FakePage {
  const row = [...pages.values()].find(page => page.dataSourceId === sourceId);
  if (!row) throw new Error('Missing test page for ' + sourceId);
  return row;
}

describe('Notion event mapping', () => {
  it('counts nested activity scopes once using the session-end total', () => {
    const attempt = makeEvent(50, { durationMs: 90_000, activeMs: 60_000, distractedMs: 5_000 });
    const chunk = makeEvent(51, {
      type: 'chunk_read', itemId: 'concept-chunk', durationMs: 240_000, activeMs: 180_000, distractedMs: 10_000,
    });
    const end = makeEvent(52, {
      type: 'session_end', itemId: undefined, questionText: undefined,
      durationMs: 420_000, activeMs: 300_000, distractedMs: 60_000,
    });

    const session = [attempt, chunk, end].reduce<Parameters<typeof applySessionEvent>[0]>(
      (state, event) => applySessionEvent(state, event), undefined,
    );
    const daily = [attempt, chunk, end].reduce<Parameters<typeof applyDailyEvent>[0]>(
      (state, event) => applyDailyEvent(state, event), undefined,
    );

    expect(session).toMatchObject({ activeMs: 300_000, wallMs: 420_000, distractedMs: 60_000, itemsAttempted: 1 });
    expect(daily).toMatchObject({ activeMs: 300_000, wallMs: 420_000, distractedMs: 60_000, items: 1 });
  });

  it('maps full attempt details, trusted verdict, timing, links and test mode to the existing Attempts schema', () => {
    const event = makeEvent(1, {
      type: 'tryit_attempt',
      verdict: 'correct',
      verdictSource: 'checker',
      attemptNo: 3,
      confidence: 'high',
      hintLevel: 2,
      errorTag: 'sign',
      masteryLevel: 'learning',
      endTs: '2026-11-02T00:01:30.000Z',
      pdfPage: 20,
      bookPage: 18,
      skill: 'domain',
    });
    const properties = buildAttemptProperties(event, 'session-page', '2026-11-02T00:05:00.000Z');
    expect(properties).toMatchObject({
      'Event ID': { rich_text: [{ text: { content: event.id } }] },
      Session: { relation: [{ id: 'session-page' }] },
      'Data Mode': { select: { name: 'Live' } },
      isTest: { checkbox: false },
      Chapter: { number: 1 },
      Lesson: { select: { name: '1.1' } },
      'Item source': { select: { name: 'Try It' } },
      'Item type': { select: { name: 'typed' } },
      Verdict: { select: { name: 'correct' } },
      'Verdict source': { select: { name: 'checker' } },
      'Confidence rating': { select: { name: 'مطمئنم' } },
      'Hints used': { number: 2 },
      'Active time (s)': { number: 60 },
      'Distracted time (s)': { number: 10 },
      'Wall time (s)': { number: 90 },
      'Book page': { number: 18 },
      'PDF page': { number: 20 },
      'Mastery after': { select: { name: 'learning' } },
    });
    expect(textValue(properties.Question)).toBe(event.questionText);
    expect(textValue(properties.Answer)).toBe(event.userAnswer);
    expect(textValue(properties.Steps)).toContain('زوج‌های مرتب');
    expect(properties.Start).toEqual({ date: { start: '2026-11-02T03:30:00.000+03:30' } });
    expect(properties.End).toEqual({ date: { start: '2026-11-02T03:31:30.000+03:30' } });
    expect(buildAttemptProperties({ ...event, type: 'exercise_attempt', itemId: 'extra-domain-01' }, 'session-page', event.ts)['Item source'])
      .toEqual({ select: { name: 'extra' } });
  });

  it('uses Tehran calendar boundaries and filters test events from reports and concepts', () => {
    expect(tehranDayKey('2026-11-02T20:29:00.000Z')).toBe('2026-11-02');
    expect(tehranDayKey('2026-11-02T20:30:00.000Z')).toBe('2026-11-03');
    expect(tehranDateTime('2026-11-02T00:00:00.000Z')).toBe('2026-11-02T03:30:00.000+03:30');

    const live = makeEvent(2, { verdict: 'incorrect', verdictSource: 'checker', confidence: 2 });
    const test = makeEvent(3, { isTest: true, verdict: 'incorrect', verdictSource: 'checker' });
    const daily = buildDailyReportProperties({
      date: '2026-11-02', sessions: ['S001'], items: 1, correct: 0, graded: 1,
      activeMs: 60_000, wallMs: 90_000, distractedMs: 10_000, gatesPassed: 0,
      gatesFailed: 0, newMistakes: 1, reviewsDone: 0, reviewsDue: 0,
    }, ['session-page']);
    expect(daily['Accuracy %']).toEqual({ number: 0 });
    expect(daily['Data Mode']).toEqual({ select: { name: 'Live' } });
    expect(daily.Sessions).toEqual({ relation: [{ id: 'session-page' }] });
    expect(buildAttemptProperties(test, 'test-session-page', test.ts)).toMatchObject({
      'Data Mode': { select: { name: 'Test' } },
      isTest: { checkbox: true },
    });

    const concept: ConceptProjection = {
      conceptId: live.concept, chapter: 1, lesson: '1.1', attempts: 2, correct: 1, graded: 2,
      activeMs: 90_000, masteryLevel: 'learning', lastPracticedAt: live.ts,
      gatePassed: false, errorCounts: { sign: 1 },
      confidenceTotals: { high: 1, medium: 0, low: 1 },
      confidenceCorrect: { high: 1, medium: 0, low: 0 },
    };
    expect(confidenceCalibration(concept)).toBe('high 1/1; medium —; low 0/1');
    expect(buildConceptProperties(concept)).toMatchObject({
      'Accuracy %': { number: 50 },
      'Top error tag': { select: { name: 'sign' } },
      'Data Mode': { select: { name: 'Live' } },
    });
    expect(test.isTest).toBe(true);
  });
});

describe('Notion API mirroring', () => {
  it('upserts one linked row per attempt and aggregates session, concept and Tehran day without duplicates', async () => {
    const fake = makeFakeNotion();
    const context = makeContext(fake.client);
    const event = makeEvent(10, {
      verdict: 'incorrect',
      verdictSource: 'checker',
      confidence: 2,
      errorTag: 'sign',
      note: 'علامت منفی را جا انداختم.',
    });
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../src/notion-projection');
    const input = {
      event,
      session: applySessionEvent(undefined, event),
      daily: applyDailyEvent(undefined, event),
      concept: applyConceptEvent(undefined, event),
    };
    await syncNotionEvent(context, input);
    await syncNotionEvent(context, input);

    const attempt = rowBySource(fake.pages, sources.attempts);
    const session = rowBySource(fake.pages, sources.sessions);
    const mistake = rowBySource(fake.pages, sources.mistakes);
    const concept = rowBySource(fake.pages, sources.concepts);
    const daily = rowBySource(fake.pages, sources.dailyReports);
    expect(textValue(attempt.properties['Event ID'])).toBe(event.id);
    expect(textValue(attempt.properties.Question)).toBe(event.questionText);
    expect(textValue(attempt.properties.Answer)).toBe(event.userAnswer);
    expect(attempt.properties.Session).toEqual({ relation: [{ id: session.id }] });
    expect(attempt.properties.Verdict).toEqual({ select: { name: 'incorrect' } });
    expect(mistake.properties.Status).toEqual({ select: { name: 'open' } });
    expect(mistake.properties.Session).toEqual({ relation: [{ id: session.id }] });
    expect(mistake.properties.Attempt).toEqual({ relation: [{ id: attempt.id }] });
    expect(session.properties.Mistakes).toEqual({ relation: [{ id: mistake.id }] });
    expect(textValue(concept.properties['Concept ID'])).toBe(event.concept);
    expect(textValue(daily.properties.Date)).toBe('2026-11-02');
    expect(daily.properties.Sessions).toEqual({ relation: [{ id: session.id }] });
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.attempts)).toHaveLength(1);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.sessions)).toHaveLength(1);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.mistakes)).toHaveLength(1);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.concepts)).toHaveLength(1);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.dailyReports)).toHaveLength(1);
  });

  it('stores tagged live-check attempts in Test mode and excludes them from live reports, mastery and mistakes', async () => {
    const fake = makeFakeNotion();
    const context = makeContext(fake.client);
    const event = makeEvent(11, { isTest: true, verdict: 'incorrect', verdictSource: 'checker', confidence: 1 });
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../src/notion-projection');
    await syncNotionEvent(context, {
      event,
      session: applySessionEvent(undefined, event),
      daily: applyDailyEvent(undefined, event),
      concept: applyConceptEvent(undefined, event),
    });

    expect(rowBySource(fake.pages, sources.attempts).properties).toMatchObject({
      'Data Mode': { select: { name: 'Test' } }, isTest: { checkbox: true },
    });
    expect(rowBySource(fake.pages, sources.sessions).properties).toMatchObject({
      'Data Mode': { select: { name: 'Test' } }, isTest: { checkbox: true },
    });
    expect([...fake.pages.values()].some(page => page.dataSourceId === sources.dailyReports)).toBe(false);
    expect([...fake.pages.values()].some(page => page.dataSourceId === sources.concepts)).toBe(false);
    expect([...fake.pages.values()].some(page => page.dataSourceId === sources.mistakes)).toBe(false);
  });

  it('does not write unclassified events to any Notion database', async () => {
    const fake = makeFakeNotion();
    const context = makeContext(fake.client);
    const event = makeEvent(13, { isTest: undefined });
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../src/notion-projection');
    await syncNotionEvent(context, {
      event,
      session: applySessionEvent(undefined, event),
      daily: applyDailyEvent(undefined, event),
      concept: applyConceptEvent(undefined, event),
    });
    expect(fake.operations).toEqual([]);
    expect(fake.pages.size).toBe(0);
  });

  it('finds existing Notion pages by external key after the local page-reference cache is empty', async () => {
    const fake = makeFakeNotion();
    const event = makeEvent(12, { verdict: 'correct', verdictSource: 'checker', confidence: 'high' });
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../src/notion-projection');
    const input = {
      event,
      session: applySessionEvent(undefined, event),
      daily: applyDailyEvent(undefined, event),
      concept: applyConceptEvent(undefined, event),
    };
    await syncNotionEvent(makeContext(fake.client), input);
    const createCount = fake.operations.filter(operation => operation.kind === 'create').length;
    await syncNotionEvent(makeContext(fake.client), input);

    expect(fake.operations.filter(operation => operation.kind === 'query').length).toBeGreaterThan(5);
    expect(fake.operations.filter(operation => operation.kind === 'create')).toHaveLength(createCount);
    expect([...fake.pages.values()]).toHaveLength(4);
  });

  it('resolves a mistake only after two later confident correct attempts and makes each update idempotent', async () => {
    const fake = makeFakeNotion();
    const context = makeContext(fake.client);
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../src/notion-projection');
    const sync = async (event: LearnEvent) => syncNotionEvent(context, {
      event,
      session: applySessionEvent(undefined, event),
      daily: applyDailyEvent(undefined, event),
      concept: applyConceptEvent(undefined, event),
    });
    const wrong = makeEvent(20, { verdict: 'incorrect', verdictSource: 'checker' });
    await sync(wrong);
    const firstCorrect = makeEvent(21, { verdict: 'correct', verdictSource: 'checker', confidence: 'high', attemptNo: 2 });
    await sync(firstCorrect);
    await sync(firstCorrect);
    const mistake = rowBySource(fake.pages, sources.mistakes);
    expect(mistake.properties.Status).toEqual({ select: { name: 'reviewing' } });
    expect(mistake.properties['Review successes']).toEqual({ number: 1 });

    const secondCorrect = makeEvent(22, { verdict: 'correct', verdictSource: 'checker', confidence: 5, attemptNo: 3 });
    await sync(secondCorrect);
    expect(mistake.properties.Status).toEqual({ select: { name: 'resolved' } });
    expect(mistake.properties['Review successes']).toEqual({ number: 2 });
  });

  it('retries 429 responses and serializes API calls at no more than three per second', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const waits: number[] = [];
    const queue = new NotionRequestQueue(350, async milliseconds => {
      waits.push(milliseconds);
      now += milliseconds;
    });
    const starts: number[] = [];
    let attempts = 0;
    const operation = async () => {
      starts.push(now);
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('limited'), { status: 429 });
      return 'ok';
    };
    const results = await Promise.all([queue.run(operation), queue.run(async () => { starts.push(now); return 'next'; })]);
    expect(results).toEqual(['ok', 'next']);
    expect(attempts).toBe(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(350);
    expect(waits).toContain(500);
  });
});

describe('Durable Object Notion sync checkpoints', () => {
  it('reports unconfigured status safely and protects manual sync with owner authentication', async () => {
    const app = createApp(validVerifier);
    const status = await app.fetch(new Request('https://worker.test/notion/status', {
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN },
    }), testEnv);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      status: 'not_configured', lastSyncedAt: null, pendingCount: 0, quarantinedCount: null, lastError: null,
    });
    const manual = await app.fetch(new Request('https://worker.test/notion/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN },
    }), testEnv);
    expect(manual.status).toBe(503);
    expect(await manual.text()).not.toContain('NOTION_API_KEY');
    const unauthorized = await app.fetch(new Request('https://worker.test/notion/status'), testEnv);
    expect(unauthorized.status).toBe(401);
  });

  it('saves an attempt, session and report through the Worker and resumes without duplicate rows', async () => {
    const fake = makeFakeNotion();
    const event = makeEvent(30, { verdict: 'incorrect', verdictSource: 'checker', confidence: 2, errorTag: 'sign' });
    const app = createApp(validVerifier);
    const response = await app.fetch(new Request('https://worker.test/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    }), testEnv);
    expect(response.status).toBe(200);

    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const status = await runInDurableObject(stub, async instance => {
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
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.attempts)).toHaveLength(1);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.sessions)).toHaveLength(1);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.mistakes)).toHaveLength(1);
    expect(fake.operations.filter(operation => operation.kind === 'create')).toHaveLength(5);
  });

  it('quarantines unclassified events, advances the cursor, and writes only explicitly classified events', async () => {
    const fake = makeFakeNotion();
    const live = makeEvent(31);
    const unclassified = makeEvent(32, { isTest: undefined });
    const app = createApp(validVerifier);
    const response = await app.fetch(new Request('https://worker.test/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [live, unclassified] }),
    }), testEnv);
    expect(response.status).toBe(200);

    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const status = await runInDurableObject(stub, async instance => {
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
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.attempts)).toHaveLength(1);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.sessions)).toHaveLength(1);
    expect([...fake.pages.values()].some(page => textValue(page.properties['Event ID']) === unclassified.id)).toBe(false);
  });

  it('keeps the successful cursor checkpoint when Notion fails partway, then resumes without duplicate rows', async () => {
    const fake = makeFakeNotion();
    fake.failCreates.add(sources.attempts);
    const events = [
      makeEvent(40, { verdict: 'correct', verdictSource: 'checker', attemptNo: 1 }),
      makeEvent(41, { itemId: 'PC-1.1-L02', verdict: 'submitted', verdictSource: 'none', attemptNo: 1 }),
    ];
    const app = createApp(validVerifier);
    const response = await app.fetch(new Request('https://worker.test/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    }), testEnv);
    expect(response.status).toBe(200);

    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const result = await runInDurableObject(stub, async instance => {
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
      expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.attempts)).toHaveLength(1);

      fake.failCreates.clear();
      const retried = await target.performNotionSync();
      expect(retried).toMatchObject({ status: 'synced', pendingCount: 0, lastError: null });
      return retried;
    });

    expect(result.status).toBe('synced');
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.attempts)).toHaveLength(2);
    expect([...fake.pages.values()].filter(page => page.dataSourceId === sources.sessions)).toHaveLength(1);
  });
});
