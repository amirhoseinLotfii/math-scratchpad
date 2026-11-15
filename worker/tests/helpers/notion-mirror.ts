import { afterEach, vi } from 'vitest';
import { env, reset } from 'cloudflare:test';
import type { LearnEvent } from '../../../shared/contracts/learn-event';
import type { WorkerEnv } from '../../src/env';
import { type NotionClientPort, type NotionDataSources, type NotionEventContext } from '../../src/notion-mirror';
import { type IdTokenVerifier } from '../../src/index';
import type { GoogleIdentity } from '../../src/env';

export const OWNER_EMAIL = 'owner@example.test';
export const ALLOWED_ORIGIN = 'https://amirhoseinlotfii.github.io';
export const testEnv = env as unknown as WorkerEnv;
export const owner: GoogleIdentity = { sub: 'test-owner', email: OWNER_EMAIL, email_verified: true };
export const validVerifier: IdTokenVerifier = async (token) => {
  if (token !== 'valid-test-token') throw new Error('invalid_token');
  return owner;
};
export const sources: NotionDataSources = {
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

export function makeEvent(index: number, overrides: Partial<LearnEvent> = {}): LearnEvent {
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

export function textValue(property: unknown): string {
  if (!property || typeof property !== 'object') return '';
  const record = property as Record<string, unknown>;
  const pieces = (record.title ?? record.rich_text) as Array<{ text?: { content?: string }; plain_text?: string }> | undefined;
  return pieces?.map((piece) => piece.plain_text ?? piece.text?.content ?? '').join('') ?? '';
}

export function makeFakeNotion() {
  const pages = new Map<string, FakePage>();
  const operations: Array<{ kind: 'query' | 'create' | 'update'; dataSourceId?: string; pageId?: string; properties?: PropertyRecord }> =
    [];
  const failCreates = new Set<string>();
  let nextId = 0;
  const client: NotionClientPort = {
    dataSources: {
      query: async (args) => {
        const sourceId = String(args.data_source_id);
        const filter = args.filter as Record<string, unknown>;
        const propertyName = String(filter.property);
        const condition = (filter.rich_text ?? filter.title) as { equals?: string };
        operations.push({ kind: 'query', dataSourceId: sourceId });
        const match = [...pages.values()].find(
          (page) => page.dataSourceId === sourceId && textValue(page.properties[propertyName]) === condition.equals,
        );
        return { results: match ? [{ id: match.id }] : [] };
      },
    },
    pages: {
      create: async (args) => {
        const parent = args.parent as { data_source_id?: string };
        const properties = args.properties as PropertyRecord;
        if (
          failCreates.has(String(parent.data_source_id)) &&
          operations.some((operation) => operation.kind === 'create' && operation.dataSourceId === String(parent.data_source_id))
        ) {
          throw Object.assign(new Error('temporary remote failure'), { status: 503 });
        }
        const id = 'notion-page-' + ++nextId;
        pages.set(id, { id, dataSourceId: String(parent.data_source_id), properties: { ...properties } });
        operations.push({ kind: 'create', dataSourceId: String(parent.data_source_id), pageId: id, properties });
        return { id };
      },
      retrieve: async (args) => {
        const id = String(args.page_id);
        const page = pages.get(id);
        if (!page) throw Object.assign(new Error('not found'), { status: 404 });
        return { id, parent: { type: 'data_source_id', data_source_id: page.dataSourceId }, properties: page.properties };
      },
      update: async (args) => {
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

export function makeContext(client: NotionClientPort): NotionEventContext {
  const refs = new Map<string, string>();
  const mistakeStates = new Map<string, { eventId: string; reviewSuccesses: number; lastReviewEventId?: string }>();
  const mistakesBySession = new Map<string, Set<string>>();
  return {
    client,
    dataSources: sources,
    now: '2026-11-02T00:05:00.000Z',
    call: (operation) => operation(),
    getPageRef: async (kind, key) => refs.get(kind + ':' + key),
    setPageRef: async (kind, key, pageId) => {
      refs.set(kind + ':' + key, pageId);
    },
    getMistakeState: async (key) => mistakeStates.get(key),
    setMistakeState: async (key, state) => {
      mistakeStates.set(key, state);
    },
    getSessionMistakePageIds: async (session) => [...(mistakesBySession.get(session) ?? [])],
    addSessionMistakePageId: async (session, pageId) => {
      const ids = mistakesBySession.get(session) ?? new Set<string>();
      ids.add(pageId);
      mistakesBySession.set(session, ids);
    },
    getSessionPageIds: async (sessionIds) =>
      sessionIds.flatMap((session) => {
        const id = refs.get('session:' + session);
        return id ? [id] : [];
      }),
  };
}

export function rowBySource(pages: Map<string, FakePage>, sourceId: string): FakePage {
  const row = [...pages.values()].find((page) => page.dataSourceId === sourceId);
  if (!row) throw new Error('Missing test page for ' + sourceId);
  return row;
}
