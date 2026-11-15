import { describe, expect, it } from 'vitest';
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
} from '../../src/notion-projection';
import { makeEvent, textValue } from '../helpers/notion-mirror';
describe('Notion event mapping', () => {
  it('counts nested activity scopes once using the session-end total', () => {
    const attempt = makeEvent(50, { durationMs: 90_000, activeMs: 60_000, distractedMs: 5_000 });
    const chunk = makeEvent(51, {
      type: 'chunk_read',
      itemId: 'concept-chunk',
      durationMs: 240_000,
      activeMs: 180_000,
      distractedMs: 10_000,
    });
    const end = makeEvent(52, {
      type: 'session_end',
      itemId: undefined,
      questionText: undefined,
      durationMs: 420_000,
      activeMs: 300_000,
      distractedMs: 60_000,
    });

    const session = [attempt, chunk, end].reduce<Parameters<typeof applySessionEvent>[0]>(
      (state, event) => applySessionEvent(state, event),
      undefined,
    );
    const daily = [attempt, chunk, end].reduce<Parameters<typeof applyDailyEvent>[0]>(
      (state, event) => applyDailyEvent(state, event),
      undefined,
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
    expect(
      buildAttemptProperties({ ...event, type: 'exercise_attempt', itemId: 'extra-domain-01' }, 'session-page', event.ts)['Item source'],
    ).toEqual({ select: { name: 'extra' } });
  });

  it('uses Tehran calendar boundaries and filters test events from reports and concepts', () => {
    expect(tehranDayKey('2026-11-02T20:29:00.000Z')).toBe('2026-11-02');
    expect(tehranDayKey('2026-11-02T20:30:00.000Z')).toBe('2026-11-03');
    expect(tehranDateTime('2026-11-02T00:00:00.000Z')).toBe('2026-11-02T03:30:00.000+03:30');

    const live = makeEvent(2, { verdict: 'incorrect', verdictSource: 'checker', confidence: 2 });
    const test = makeEvent(3, { isTest: true, verdict: 'incorrect', verdictSource: 'checker' });
    const daily = buildDailyReportProperties(
      {
        date: '2026-11-02',
        sessions: ['S001'],
        items: 1,
        correct: 0,
        graded: 1,
        activeMs: 60_000,
        wallMs: 90_000,
        distractedMs: 10_000,
        gatesPassed: 0,
        gatesFailed: 0,
        newMistakes: 1,
        reviewsDone: 0,
        reviewsDue: 0,
      },
      ['session-page'],
    );
    expect(daily['Accuracy %']).toEqual({ number: 0 });
    expect(daily['Data Mode']).toEqual({ select: { name: 'Live' } });
    expect(daily.Sessions).toEqual({ relation: [{ id: 'session-page' }] });
    expect(buildAttemptProperties(test, 'test-session-page', test.ts)).toMatchObject({
      'Data Mode': { select: { name: 'Test' } },
      isTest: { checkbox: true },
    });

    const concept: ConceptProjection = {
      conceptId: live.concept,
      chapter: 1,
      lesson: '1.1',
      attempts: 2,
      correct: 1,
      graded: 2,
      activeMs: 90_000,
      masteryLevel: 'learning',
      lastPracticedAt: live.ts,
      gatePassed: false,
      errorCounts: { sign: 1 },
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
