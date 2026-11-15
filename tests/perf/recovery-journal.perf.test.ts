import 'fake-indexeddb/auto';
import { performance } from 'node:perf_hooks';
import { afterEach, expect, it } from 'vitest';
import { actions } from '../../src/store';
import { createPersistentStore } from '../../src/features/session/persistence/persistent-store';
import { getLearningStorage, resetLearningDbForTests } from '../../src/sync/browser-db';
import { makeSizedSession } from '../helpers/large-session';

afterEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetLearningDbForTests();
});

it.each([50_000, 250_000, 900_000])('measures 200 synchronous recovery-journal edits near %i bytes', async (target) => {
  const fixture = makeSizedSession(target);
  const result = createPersistentStore();
  try {
    result.store.dispatch(actions.load({ doc: fixture.doc, prefs: fixture.prefs }));
    await result.flush();
    const key = Object.keys(localStorage).find((key) => key.startsWith('math-scratchpad-pending-draft-v1:'));
    const persisted = getLearningStorage().getItem('math-scratchpad-session-v3');
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      const started = performance.now();
      result.store.dispatch(actions.mathLiveInput({ stepId: fixture.doc.cursor.stepId, value: String(1000 + i) }));
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const journalKey = key ?? Object.keys(localStorage).find((name) => name.startsWith('math-scratchpad-pending-draft-v1:'));
    expect(journalKey).toBeTruthy();
    expect(localStorage.getItem(journalKey!)).toContain('1199');
    const bytes = Buffer.byteLength(persisted ?? '');
    expect(bytes).toBeGreaterThan(target * 0.85);
    expect(bytes).toBeLessThan(target * 1.12);
    console.info(JSON.stringify({ bytes, medianMs: samples[99], p95Ms: samples[189] }));
    await result.flush();
  } finally {
    result.dispose();
  }
});
