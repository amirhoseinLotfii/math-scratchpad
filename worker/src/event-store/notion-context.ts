import {
  notionDataSourcesFromEnv,
  type MistakeReviewState,
  type NotionClientPort,
  type NotionRequestQueue,
  type NotionEventContext,
} from '../notion-mirror';

export function createNotionContext(
  storage: DurableObjectStorage,
  client: NotionClientPort,
  requests: NotionRequestQueue,
  dataSources: NonNullable<ReturnType<typeof notionDataSourcesFromEnv>>,
  now: string,
): NotionEventContext {
  return {
    client: client,
    dataSources,
    now,
    call: (operation) => requests.run(operation),
    getPageRef: async (kind, key) => {
      const row = storage.sql
        .exec<{ page_id: string }>('SELECT page_id FROM notion_page_refs WHERE kind = ? AND external_key = ?', kind, key)
        .toArray()[0];
      return row?.page_id;
    },
    setPageRef: async (kind, key, pageId) => {
      storage.sql.exec(
        'INSERT INTO notion_page_refs (kind, external_key, page_id) VALUES (?, ?, ?) ON ' +
          'CONFLICT(kind, external_key) DO UPDATE SET page_id = excluded.page_id',
        kind,
        key,
        pageId,
      );
    },
    getPageRefs: async (kind, prefix) =>
      storage.sql
        .exec<{ external_key: string; page_id: string }>(
          'SELECT external_key, page_id FROM notion_page_refs WHERE kind = ? AND substr(external_key, 1, ?) = ? ORDER BY external_key',
          kind,
          prefix.length,
          prefix,
        )
        .toArray()
        .map((row) => ({ key: row.external_key, pageId: row.page_id })),
    deletePageRef: async (kind, key) => {
      storage.sql.exec('DELETE FROM notion_page_refs WHERE kind = ? AND external_key = ?', kind, key);
    },
    getMistakeState: async (key) => {
      const row = storage.sql
        .exec<{
          event_id: string;
          review_successes: number;
          last_review_event_id: string | null;
        }>('SELECT event_id, review_successes, last_review_event_id FROM notion_mistake_reviews WHERE item_key = ?', key)
        .toArray()[0];
      return row
        ? {
            eventId: row.event_id,
            reviewSuccesses: Number(row.review_successes),
            ...(row.last_review_event_id ? { lastReviewEventId: row.last_review_event_id } : {}),
          }
        : undefined;
    },
    setMistakeState: async (key, value: MistakeReviewState) => {
      storage.sql.exec(
        'INSERT INTO notion_mistake_reviews (item_key, event_id, review_successes, ' +
          'last_review_event_id) VALUES (?, ?, ?, ?) ON CONFLICT(item_key) DO UPDATE SET event_id = ' +
          'excluded.event_id, review_successes = excluded.review_successes, last_review_event_id = ' +
          'excluded.last_review_event_id',
        key,
        value.eventId,
        value.reviewSuccesses,
        value.lastReviewEventId ?? null,
      );
    },
    getSessionMistakePageIds: async (sessionId) =>
      storage.sql
        .exec<{ page_id: string }>('SELECT page_id FROM notion_session_mistakes WHERE session_id = ? ORDER BY page_id', sessionId)
        .toArray()
        .map((row) => row.page_id),
    addSessionMistakePageId: async (sessionId, pageId) => {
      storage.sql.exec('INSERT OR IGNORE INTO notion_session_mistakes (session_id, page_id) VALUES (?, ?)', sessionId, pageId);
    },
    getSessionPageIds: async (sessionIds) =>
      sessionIds.flatMap((sessionId) => {
        const row = storage.sql
          .exec<{ page_id: string }>('SELECT page_id FROM notion_page_refs WHERE kind = ? AND external_key = ?', 'session', sessionId)
          .toArray()[0];
        return row ? [row.page_id] : [];
      }),
  };
}
