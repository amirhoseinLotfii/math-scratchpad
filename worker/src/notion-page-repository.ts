import type { NotionEventContext } from './notion-mirror';

export async function upsertByExternalKey(
  context: NotionEventContext,
  input: {
    kind: string;
    key: string;
    dataSourceId: string;
    property: string;
    filter: Record<string, unknown>;
    properties: Record<string, unknown>;
  },
): Promise<string> {
  const cached = await context.getPageRef(input.kind, input.key);
  if (cached) {
    await context.call(() => context.client.pages.update({ page_id: cached, properties: input.properties }));
    return cached;
  }

  const matches = await context.call(() =>
    context.client.dataSources.query({
      data_source_id: input.dataSourceId,
      filter: input.filter,
      page_size: 1,
    }),
  );
  const existing = matches.results[0]?.id;
  if (existing) {
    await context.setPageRef(input.kind, input.key, existing);
    await context.call(() => context.client.pages.update({ page_id: existing, properties: input.properties }));
    return existing;
  }

  const created = await context.call(() =>
    context.client.pages.create({
      parent: { data_source_id: input.dataSourceId },
      properties: input.properties,
    }),
  );
  await context.setPageRef(input.kind, input.key, created.id);
  return created.id;
}
