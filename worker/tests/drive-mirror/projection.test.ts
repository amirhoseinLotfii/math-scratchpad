import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { learnEventSchema } from '../../../shared/contracts/learn-event';
import {
  buildProgressProjection,
  buildSyncManifest,
  formatTehran,
  groupEventsByUtcMonth,
  mergeJsonlEventContent,
  mergeUniqueEvents,
  serializeJsonlEvents,
  sha256Hex,
  type SequencedLearnEvent,
} from '../../src/drive-projection';
import { makeEvent, sequenced } from '../helpers/drive-mirror';
describe('Drive event mapping and projections', () => {
  it('groups by UTC month in sequence order and writes each complete event as one JSONL line', () => {
    const previousMonth = sequenced(
      2,
      makeEvent(2, { ts: '2026-10-31T23:59:59.000Z', userAnswer: 'x = 4', steps: ['subtract 2', 'divide by 3'] }),
    );
    const currentMonth = sequenced(
      1,
      makeEvent(1, { ts: '2026-11-01T00:00:00.000Z', questionText: 'Find the domain.', verdict: 'submitted', verdictSource: 'none' }),
    );
    const groups = groupEventsByUtcMonth([previousMonth, currentMonth]);
    expect([...groups.keys()]).toEqual(['2026-11', '2026-10']);
    expect(serializeJsonlEvents(groups.get('2026-10')!)).toBe(`${JSON.stringify(previousMonth.event)}\n`);
    expect(JSON.parse(serializeJsonlEvents(groups.get('2026-11')!))).toMatchObject({
      id: currentMonth.event.id,
      questionText: 'Find the domain.',
      verdictSource: 'none',
    });
  });

  it('merges event JSONL idempotently and rejects reused IDs with changed answers', () => {
    const first = makeEvent(1, { userAnswer: '2', verdict: 'correct', verdictSource: 'checker' });
    const second = makeEvent(2, { userAnswer: '3', verdict: 'submitted', verdictSource: 'none' });
    const remote = serializeJsonlEvents([sequenced(1, first)]);
    const desired = serializeJsonlEvents([sequenced(1, first), sequenced(2, second)]);
    const merged = mergeJsonlEventContent(remote, desired);
    expect(
      merged
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([first, second]);
    expect(mergeJsonlEventContent(merged, desired)).toBe(merged);
    const staleUnclassified = serializeJsonlEvents([sequenced(3, makeEvent(3, { isTest: undefined }))]);
    expect(mergeJsonlEventContent(staleUnclassified, desired)).toBe(merged);
    expect(() => mergeJsonlEventContent(remote, serializeJsonlEvents([sequenced(1, { ...first, userAnswer: 'wrong' })]))).toThrow(
      'event_id_conflict',
    );
  });

  it('deduplication is commutative and idempotent across generated event sets', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 30 }), { maxLength: 50 }), (indexes) => {
        const events = indexes.map((index) => makeEvent(index));
        const forward = mergeUniqueEvents(events);
        const reverse = mergeUniqueEvents([...events].reverse());
        expect(forward).toEqual(reverse);
        expect(mergeUniqueEvents(forward, events)).toEqual(forward);
      }),
      { numRuns: 100 },
    );
  });

  it('projects the latest learner position, gate result, completion, and bank version', () => {
    const events = [
      sequenced(1, makeEvent(1, { type: 'chunk_open', itemId: 'concept-1' })),
      sequenced(2, makeEvent(2, { type: 'gate_attempt' })),
      sequenced(3, makeEvent(3, { type: 'gate_failed' })),
      sequenced(4, makeEvent(4, { type: 'gate_passed' })),
      sequenced(5, makeEvent(5, { type: 'section_complete' })),
      sequenced(6, makeEvent(6, { type: 'lesson_complete' })),
    ];
    const projection = buildProgressProjection(events, new Date('2026-11-02T00:00:00.000Z'));
    expect(projection).toMatchObject({
      currentPosition: { chapter: 1, lesson: '1.1', section: '1.1', chunkId: 'concept-1' },
      gateStatusBySection: { '1:1.1:1.1': 'passed' },
      completedSections: ['1:1.1:1.1'],
      completedLessons: ['1:1.1'],
      unlockedSections: ['1:1.1:1.1'],
      bankVersion: 'v21',
      lastEventId: events[5].event.id,
      lastSeq: 6,
      updatedAtUtc: '2026-11-02T00:00:00.000Z',
      updatedAtTehran: '2026-11-02T03:30:00+03:30',
    });
  });

  it('stores tagged test events but excludes test and unclassified events from learner progress', () => {
    const realEvent = makeEvent(1, { type: 'chunk_open', itemId: 'concept-1' });
    const testEvent = learnEventSchema.parse(
      makeEvent(2, {
        isTest: true,
        type: 'section_complete',
        section: '99.99',
        lesson: '99.99',
        itemId: 'live-check',
      }),
    );
    const unclassifiedEvent = learnEventSchema.parse(
      makeEvent(3, {
        isTest: undefined,
        type: 'chunk_open',
        itemId: 'unclassified-preview',
      }),
    );
    const projection = buildProgressProjection([sequenced(1, realEvent), sequenced(2, testEvent), sequenced(3, unclassifiedEvent)]);
    expect(projection).toMatchObject({
      currentPosition: { chapter: 1, lesson: '1.1', section: '1.1', chunkId: 'concept-1' },
      completedSections: [],
      lastEventId: realEvent.id,
      lastSeq: 1,
    });
    expect(serializeJsonlEvents([sequenced(1, realEvent), sequenced(2, testEvent)])).toContain('"isTest":true');
  });

  it('uses Tehran local timestamps and hashes exactly the exported file contents', async () => {
    expect(formatTehran(new Date('2026-06-01T00:00:00.000Z'))).toBe('2026-06-01T03:30:00+03:30');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const event = sequenced(1);
    const progressContent = '{"lastSeq":1}\n';
    const eventContent = serializeJsonlEvents([event]);
    const manifest = await buildSyncManifest({
      events: [event],
      eventFiles: [{ path: 'events/events_2026-11.jsonl', content: eventContent }],
      progressContent,
      now: new Date('2026-11-02T00:00:00.000Z'),
    });
    expect(manifest).toMatchObject({ lastSeq: 1, lastEventId: event.event.id, lastSuccessAtTehran: '2026-11-02T03:30:00+03:30' });
    expect(manifest.files).toEqual([
      { path: 'events/events_2026-11.jsonl', sha256: await sha256Hex(eventContent) },
      { path: 'state/progress.json', sha256: await sha256Hex(progressContent) },
    ]);
  });

  it('keeps and serializes a 50,000-event month without dropping or duplicating events', () => {
    const events: SequencedLearnEvent[] = Array.from({ length: 50_000 }, (_, index) => {
      const event = makeEvent(index + 1, { ts: '2026-11-02T00:00:00.000Z' });
      return { seq: index + 1, event };
    });
    const started = performance.now();
    const groups = groupEventsByUtcMonth(events);
    const content = serializeJsonlEvents(groups.get('2026-11')!);
    const projection = buildProgressProjection(events);
    const elapsedMs = performance.now() - started;
    expect(content.split('\n').filter(Boolean)).toHaveLength(50_000);
    expect(projection.lastSeq).toBe(50_000);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 15_000);
});
