import { describe, expect, it, vi } from 'vitest';
import type { LearnEvent } from '../../../shared/contracts/learn-event';
import { NotionRequestQueue, syncNotionEvent } from '../../src/notion-mirror';
import { sources, makeEvent, textValue, makeFakeNotion, makeContext, rowBySource } from '../helpers/notion-mirror';
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
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../../src/notion-projection');
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
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.attempts)).toHaveLength(1);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.sessions)).toHaveLength(1);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.mistakes)).toHaveLength(1);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.concepts)).toHaveLength(1);
    expect([...fake.pages.values()].filter((page) => page.dataSourceId === sources.dailyReports)).toHaveLength(1);
  });

  it('stores tagged live-check attempts in Test mode and excludes them from live reports, mastery and mistakes', async () => {
    const fake = makeFakeNotion();
    const context = makeContext(fake.client);
    const event = makeEvent(11, { isTest: true, verdict: 'incorrect', verdictSource: 'checker', confidence: 1 });
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../../src/notion-projection');
    await syncNotionEvent(context, {
      event,
      session: applySessionEvent(undefined, event),
      daily: applyDailyEvent(undefined, event),
      concept: applyConceptEvent(undefined, event),
    });

    expect(rowBySource(fake.pages, sources.attempts).properties).toMatchObject({
      'Data Mode': { select: { name: 'Test' } },
      isTest: { checkbox: true },
    });
    expect(rowBySource(fake.pages, sources.sessions).properties).toMatchObject({
      'Data Mode': { select: { name: 'Test' } },
      isTest: { checkbox: true },
    });
    expect([...fake.pages.values()].some((page) => page.dataSourceId === sources.dailyReports)).toBe(false);
    expect([...fake.pages.values()].some((page) => page.dataSourceId === sources.concepts)).toBe(false);
    expect([...fake.pages.values()].some((page) => page.dataSourceId === sources.mistakes)).toBe(false);
  });

  it('does not write unclassified events to any Notion database', async () => {
    const fake = makeFakeNotion();
    const context = makeContext(fake.client);
    const event = makeEvent(13, { isTest: undefined });
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../../src/notion-projection');
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
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../../src/notion-projection');
    const input = {
      event,
      session: applySessionEvent(undefined, event),
      daily: applyDailyEvent(undefined, event),
      concept: applyConceptEvent(undefined, event),
    };
    await syncNotionEvent(makeContext(fake.client), input);
    const createCount = fake.operations.filter((operation) => operation.kind === 'create').length;
    await syncNotionEvent(makeContext(fake.client), input);

    expect(fake.operations.filter((operation) => operation.kind === 'query').length).toBeGreaterThan(5);
    expect(fake.operations.filter((operation) => operation.kind === 'create')).toHaveLength(createCount);
    expect([...fake.pages.values()]).toHaveLength(4);
  });

  it('resolves a mistake only after two later confident correct attempts and makes each update idempotent', async () => {
    const fake = makeFakeNotion();
    const context = makeContext(fake.client);
    const { applyConceptEvent, applyDailyEvent, applySessionEvent } = await import('../../src/notion-projection');
    const sync = async (event: LearnEvent) =>
      syncNotionEvent(context, {
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
    const queue = new NotionRequestQueue(350, async (milliseconds) => {
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
    const results = await Promise.all([
      queue.run(operation),
      queue.run(async () => {
        starts.push(now);
        return 'next';
      }),
    ]);
    expect(results).toEqual(['ok', 'next']);
    expect(attempts).toBe(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(350);
    expect(waits).toContain(500);
  });
});
