import type { NotionEventContext } from './notion-mirror';
import { buildAppStateMirrorProperties } from './notion-projection';
import { upsertByExternalKey } from './notion-page-repository';

export async function syncNotionAppState(
  context: NotionEventContext,
  input: {
    key: string;
    value: string | null;
    revision: number;
    updatedAt: string;
  },
): Promise<void> {
  const prefix = `state:${encodeURIComponent(input.key)}:`;
  const previousRefs = (await context.getPageRefs?.('app-state', prefix)) ?? [];
  const chunks = input.value === null ? [] : splitCodePoints(input.value, 40_000);
  const syncedAt = new Date().toISOString();
  for (let part = 0; part < chunks.length; part += 1) {
    const externalKey = `${prefix}${part}`;
    await upsertByExternalKey(context, {
      kind: 'app-state',
      key: externalKey,
      dataSourceId: context.dataSources.attempts,
      property: 'Event ID',
      filter: { property: 'Event ID', rich_text: { equals: externalKey } },
      properties: buildAppStateMirrorProperties({
        externalKey,
        key: input.key,
        value: chunks[part]!,
        revision: input.revision,
        part,
        parts: chunks.length,
        updatedAt: input.updatedAt,
        syncedAt,
      }),
    });
  }
  for (const ref of previousRefs) {
    const part = Number(ref.key.slice(prefix.length));
    if (Number.isInteger(part) && part >= 0 && part < chunks.length) continue;
    await context.call(() => context.client.pages.update({ page_id: ref.pageId, archived: true }));
    await context.deletePageRef?.('app-state', ref.key);
  }
}

function splitCodePoints(value: string, maxLength: number): string[] {
  if (value.length === 0) return [''];
  const chars = Array.from(value);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += maxLength) chunks.push(chars.slice(index, index + maxLength).join(''));
  return chunks;
}
