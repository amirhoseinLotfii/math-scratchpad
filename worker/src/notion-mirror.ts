import { upsertByExternalKey } from './notion-page-repository';
export { syncNotionAppState } from './notion-app-state';
import { Client } from '@notionhq/client';
import type { LearnEvent } from '../../shared/contracts/learn-event';
import {
  buildAttemptProperties,
  buildChapterSnapshotProperties,
  buildConceptProperties,
  buildDailyReportProperties,
  buildMistakeProperties,
  buildSessionProperties,
  confidenceNumber,
  isAttemptLikeEvent,
  isLowConfidence,
  isMistakeLikeEvent,
  tehranDateTime,
  type ConceptProjection,
  type DailyProjection,
  type SessionProjection,
} from './notion-projection';
import type { WorkerEnv } from './env';

export type NotionErrorCode =
  | 'token_invalid'
  | 'database_not_shared'
  | 'schema_mismatch'
  | 'rate_limited'
  | 'remote_error'
  | 'subrequest_budget_exceeded'
  | 'network_error';

export type NotionMirrorStatus = {
  status: 'not_configured' | 'pending' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
  pendingCount: number;
  quarantinedCount: number | null;
  lastError: NotionErrorCode | null;
};

export type NotionDataSources = {
  attempts: string;
  sessions: string;
  mistakes: string;
  concepts: string;
  dailyReports: string;
};

export type NotionPage = { id: string };
export type NotionQueryResult = { results: NotionPage[] };
export type NotionPageRef = { key: string; pageId: string };

/** Small structural API surface keeps the sync Worker tests independent from Notion. */
export interface NotionClientPort {
  dataSources: {
    query(args: Record<string, unknown>): Promise<NotionQueryResult>;
  };
  pages: {
    create(args: Record<string, unknown>): Promise<NotionPage>;
    retrieve(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<NotionPage>;
  };
}

export type MistakeReviewState = {
  eventId: string;
  reviewSuccesses: number;
  lastReviewEventId?: string;
};

export type NotionEventContext = {
  client: NotionClientPort;
  dataSources: NotionDataSources;
  now: string;
  call<T>(operation: () => Promise<T>): Promise<T>;
  getPageRef(kind: string, key: string): Promise<string | undefined>;
  setPageRef(kind: string, key: string, pageId: string): Promise<void>;
  getPageRefs?(kind: string, prefix: string): Promise<NotionPageRef[]>;
  deletePageRef?(kind: string, key: string): Promise<void>;
  getMistakeState(key: string): Promise<MistakeReviewState | undefined>;
  setMistakeState(key: string, value: MistakeReviewState): Promise<void>;
  getSessionMistakePageIds(sessionId: string): Promise<string[]>;
  addSessionMistakePageId(sessionId: string, pageId: string): Promise<void>;
  getSessionPageIds(sessionIds: string[]): Promise<string[]>;
};

export function notionDataSourcesFromEnv(env: WorkerEnv): NotionDataSources | null {
  const values = [
    env.NOTION_DATA_SOURCE_ATTEMPTS,
    env.NOTION_DATA_SOURCE_SESSIONS,
    env.NOTION_DATA_SOURCE_MISTAKES,
    env.NOTION_DATA_SOURCE_CONCEPTS,
    env.NOTION_DATA_SOURCE_DAILY_REPORTS,
  ];
  if (!env.NOTION_API_KEY || values.some((value) => !value)) return null;
  return {
    attempts: normalizeDataSourceId(values[0]!),
    sessions: normalizeDataSourceId(values[1]!),
    mistakes: normalizeDataSourceId(values[2]!),
    concepts: normalizeDataSourceId(values[3]!),
    dailyReports: normalizeDataSourceId(values[4]!),
  };
}

export function createNotionClient(token: string, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): NotionClientPort {
  const client = new Client({
    auth: token,
    timeoutMs: 15_000,
    fetch: fetcher,
    retry: false,
  });
  return client as unknown as NotionClientPort;
}

export async function syncNotionEvent(
  context: NotionEventContext,
  input: {
    event: LearnEvent;
    session: SessionProjection;
    daily?: DailyProjection;
    concept?: ConceptProjection;
  },
): Promise<void> {
  const { event, session, daily, concept } = input;
  if (typeof event.isTest !== 'boolean') return;
  if (event.type === 'chapter_snapshot') {
    await syncChapterSnapshot(context, event);
    return;
  }
  const editableStateEvent =
    event.type === 'answer_edited' || event.type === 'step_edited' || event.type === 'step_added' || event.type === 'confidence_set';
  const sessionPageId = await upsertByExternalKey(context, {
    kind: 'session',
    key: event.session,
    dataSourceId: context.dataSources.sessions,
    property: 'Name',
    filter: { property: 'Name', title: { equals: event.session } },
    properties: buildSessionProperties({
      ...session,
      mistakePageIds: await context.getSessionMistakePageIds(event.session),
    }),
  });

  let attemptPageId: string | undefined;
  if (isAttemptLikeEvent(event) || editableStateEvent) {
    attemptPageId = await upsertByExternalKey(context, {
      kind: 'attempt',
      key: event.id,
      dataSourceId: context.dataSources.attempts,
      property: 'Event ID',
      filter: { property: 'Event ID', rich_text: { equals: event.id } },
      properties: buildAttemptProperties(event, sessionPageId, context.now),
    });
  }

  if (isMistakeLikeEvent(event) && attemptPageId) {
    await upsertMistake(context, event, sessionPageId, attemptPageId);
  } else if (isAttemptLikeEvent(event) && event.verdict === 'correct' && !isLowConfidence(event.confidence)) {
    await resolvePreviousMistake(context, event);
  }

  if (concept && !event.isTest && (isAttemptLikeEvent(event) || event.type === 'mastery_changed' || event.type === 'gate_passed')) {
    await upsertByExternalKey(context, {
      kind: 'concept',
      key: concept.conceptId,
      dataSourceId: context.dataSources.concepts,
      property: 'Concept ID',
      filter: { property: 'Concept ID', rich_text: { equals: concept.conceptId } },
      properties: buildConceptProperties(concept),
    });
  }

  if (daily && !event.isTest) {
    await upsertByExternalKey(context, {
      kind: 'daily',
      key: daily.date,
      dataSourceId: context.dataSources.dailyReports,
      property: 'Date',
      filter: { property: 'Date', title: { equals: daily.date } },
      properties: buildDailyReportProperties(daily, await context.getSessionPageIds(daily.sessions)),
    });
  }

  const mistakeIds = await context.getSessionMistakePageIds(event.session);
  if (mistakeIds.length > 0) {
    await context.call(() =>
      context.client.pages.update({
        page_id: sessionPageId,
        properties: { Mistakes: { relation: mistakeIds.map((id) => ({ id })) } },
      }),
    );
  }
}

async function syncChapterSnapshot(context: NotionEventContext, event: LearnEvent): Promise<void> {
  if (
    event.type !== 'chapter_snapshot' ||
    !event.snapshotId ||
    !event.snapshotBankId ||
    event.snapshotPart === undefined ||
    event.snapshotParts === undefined ||
    !event.snapshotSha256 ||
    event.snapshotData === undefined
  ) {
    throw new Error('invalid_chapter_snapshot');
  }
  const externalKey = `chapter-snapshot:${event.snapshotId}:${event.snapshotPart}`;
  await upsertByExternalKey(context, {
    kind: 'chapter-snapshot',
    key: externalKey,
    dataSourceId: context.dataSources.attempts,
    property: 'Event ID',
    filter: { property: 'Event ID', rich_text: { equals: externalKey } },
    properties: buildChapterSnapshotProperties({
      externalKey,
      bankId: event.snapshotBankId,
      bankVersion: event.bankVersion,
      chapter: event.chapter,
      snapshotId: event.snapshotId,
      sha256: event.snapshotSha256,
      part: event.snapshotPart,
      parts: event.snapshotParts,
      data: event.snapshotData,
      createdAt: event.ts,
      syncedAt: context.now,
    }),
  });
}

async function upsertMistake(context: NotionEventContext, event: LearnEvent, sessionPageId: string, attemptPageId: string): Promise<void> {
  const itemKey = mistakeKey(event);
  const existingState = await context.getMistakeState(itemKey);
  const sameEvent = existingState?.eventId === event.id;
  const reviewSuccesses = sameEvent ? existingState.reviewSuccesses : 0;
  const status = sameEvent ? (reviewSuccesses >= 2 ? 'resolved' : reviewSuccesses > 0 ? 'reviewing' : 'open') : 'open';
  const pageId = await upsertByExternalKey(context, {
    kind: 'mistake',
    key: event.id,
    dataSourceId: context.dataSources.mistakes,
    property: 'Event ID',
    filter: { property: 'Event ID', rich_text: { equals: event.id } },
    properties: buildMistakeProperties(event, sessionPageId, attemptPageId, reviewSuccesses, status),
  });
  if (!sameEvent) {
    await context.setMistakeState(itemKey, { eventId: event.id, reviewSuccesses: 0 });
  }
  await context.addSessionMistakePageId(event.session, pageId);
}

async function resolvePreviousMistake(context: NotionEventContext, event: LearnEvent): Promise<void> {
  const itemKey = mistakeKey(event);
  const state = await context.getMistakeState(itemKey);
  if (!state || state.lastReviewEventId === event.id) return;
  const pageId = await context.getPageRef('mistake', state.eventId);
  if (!pageId) return;
  const successes = state.reviewSuccesses + 1;
  const status = successes >= 2 ? 'resolved' : 'reviewing';
  const nextReview = status === 'resolved' ? undefined : new Date(Date.parse(event.ts) + 3 * 24 * 60 * 60_000).toISOString();
  const properties: Record<string, unknown> = {
    Status: { select: { name: status } },
    'Review successes': { number: successes },
    'Last attempt at': { date: { start: tehranDateTime(event.ts) } },
  };
  if (nextReview) properties['Next review'] = { date: { start: tehranDateTime(nextReview) } };
  await context.call(() => context.client.pages.update({ page_id: pageId, properties }));
  await context.setMistakeState(itemKey, { eventId: state.eventId, reviewSuccesses: successes, lastReviewEventId: event.id });
}

function normalizeDataSourceId(value: string): string {
  return value.replace(/^collection:\/\//, '').replace(/[{}]/g, '');
}

function mistakeKey(event: LearnEvent): string {
  return [event.chapter, event.lesson, event.concept, event.itemId ?? ''].join(':');
}

export { archiveVerifiedNotionResetPage } from './notion-reset-archive';
export { notionErrorCode, retryDelayMs, NOTION_RETRY_LIMIT, NotionRequestQueue } from './notion-request-queue';
