import type { NotionDataSources, NotionEventContext } from './notion-mirror';

/** Archive only a project page whose source and app-specific row key still match the durable ref. */
export async function archiveVerifiedNotionResetPage(
  context: NotionEventContext,
  input: { kind: string; externalKey: string; pageId: string },
): Promise<'archived' | 'protected' | 'unverified'> {
  if (input.kind === 'session') return 'protected';
  const dataSourceId = dataSourceForResetKind(input.kind, context.dataSources);
  if (!dataSourceId) return 'protected';

  const page = await context.call(() => context.client.pages.retrieve({ page_id: input.pageId }));
  if (page.id !== input.pageId || !isVerifiedProjectNotionPage(page, input, dataSourceId)) return 'unverified';
  await context.call(() => context.client.pages.update({ page_id: input.pageId, archived: true }));
  return 'archived';
}

function dataSourceForResetKind(kind: string, sources: NotionDataSources): string | undefined {
  if (kind === 'attempt' || kind === 'app-state' || kind === 'chapter-snapshot') return sources.attempts;
  if (kind === 'mistake') return sources.mistakes;
  if (kind === 'concept') return sources.concepts;
  if (kind === 'daily') return sources.dailyReports;
  return undefined;
}

function isVerifiedProjectNotionPage(
  page: Record<string, unknown>,
  input: { kind: string; externalKey: string },
  expectedDataSourceId: string,
): boolean {
  const parent = page.parent && typeof page.parent === 'object' ? (page.parent as Record<string, unknown>) : undefined;
  if (parent?.data_source_id !== expectedDataSourceId) return false;
  const properties = page.properties && typeof page.properties === 'object' ? (page.properties as Record<string, unknown>) : undefined;
  if (!properties) return false;

  const markerProperty = input.kind === 'concept' ? 'Concept ID' : input.kind === 'daily' ? 'Date' : 'Event ID';
  if (notionPropertyText(properties[markerProperty]) !== input.externalKey) return false;

  if (input.kind === 'app-state' || input.kind === 'chapter-snapshot') {
    const raw = notionPropertyText(properties['Steps Raw']);
    try {
      const marker = JSON.parse(raw) as { format?: unknown };
      const expected = input.kind === 'app-state' ? 'math-scratchpad.app-state-mirror/v1' : 'math-scratchpad.chapter-snapshot/v1';
      return marker.format === expected;
    } catch {
      return false;
    }
  }

  if (input.kind === 'attempt' || input.kind === 'mistake') {
    const isTest = notionCheckbox(properties.isTest);
    const mode = notionSelectName(properties['Data Mode']);
    return isTest !== undefined && mode === (isTest ? 'Test' : 'Live');
  }
  if (input.kind === 'concept') return notionCheckbox(properties.isTest) === false && notionSelectName(properties['Data Mode']) === 'Live';
  if (input.kind === 'daily') return notionSelectName(properties['Data Mode']) === 'Live';
  return false;
}

function notionPropertyText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const property = value as Record<string, unknown>;
  const segments = Array.isArray(property.rich_text) ? property.rich_text : Array.isArray(property.title) ? property.title : [];
  return segments
    .map((segment) => {
      if (!segment || typeof segment !== 'object' || Array.isArray(segment)) return '';
      const text = (segment as Record<string, unknown>).text;
      return text && typeof text === 'object' && !Array.isArray(text) ? String((text as Record<string, unknown>).content ?? '') : '';
    })
    .join('');
}

function notionCheckbox(value: unknown): boolean | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const checkbox = (value as Record<string, unknown>).checkbox;
  return typeof checkbox === 'boolean' ? checkbox : undefined;
}

function notionSelectName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const select = (value as Record<string, unknown>).select;
  if (!select || typeof select !== 'object' || Array.isArray(select)) return undefined;
  const name = (select as Record<string, unknown>).name;
  return typeof name === 'string' ? name : undefined;
}
