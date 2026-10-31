import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from '../../src/parser';
import { blankStep } from '../../src/model';
import { snapshotVersion, validateBank, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { emptyLessonProgressState, lessonExportDataFromState, lessonProgressStorageKey, readLessonExportData, readLessonProgress, saveLessonProgress } from '../../src/features/lessons/lesson-progress-store';
import type { LessonProgress } from '../../src/features/lessons/types';

const VERSION = 'sample-v1-abc';
const NOW = '2026-10-30T12:00:00.000Z';
function bank(): DriveBank {
  const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as Record<string, unknown>;
  const lessons = raw.lessons as Array<{ concepts: Array<{ blocks: unknown[] }> }>;
  lessons[0].concepts[0].blocks.push({ type: 'example', title: 'Temporary test example', steps: ['Temporary test step 1', 'Temporary test step 2'] });
  return validateBank(raw);
}
function twoLessonBank(): DriveBank {
  const base = bank();
  const first = base.lessons![0];
  const second = {
    ...first,
    id: 'SAMPLE-1.2',
    section: '1.2',
    title: 'Second temporary test lesson',
    concepts: first.concepts.map((concept, index) => ({ ...concept, id: `SAMPLE-1.2-C${index + 1}`, checkQuestionIds: [] })),
  };
  return { ...base, lessons: [...base.lessons!, second] };
}
function progress(lessonId = 'SAMPLE-1.1'): LessonProgress {
  const step = blankStep();
  step.expression = parse('8+1');
  return {
    lessonId,
    status: 'learning',
    currentConceptIndex: 1,
    currentSectionIndex: 1,
    completedSectionIds: [],
    completedConceptIds: ['SAMPLE-1.1-C1'],
    answeredCheckIds: ['SAMPLE-1.1-L01', 'SAMPLE-1.1-L02'],
    summaryOpen: false,
    skippedChecks: [],
    checkAnswers: {
      'SAMPLE-1.1-L01': { type: 'choice', value: 'Option B' },
      'SAMPLE-1.1-L02': { type: 'math', steps: [step] },
    },
    confidenceByCheckId: { 'SAMPLE-1.1-L01': 4 },
    learnSkipped: { at: NOW },
    learnStartedAt: NOW,
    revealedSteps: { 'SAMPLE-1.1-C1:3': 1 },
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('namespaced Learn progress storage', () => {
  it('round-trips progress, choice and math responses, confidence, current concept, and revealed steps', () => {
    const source = bank(), initial = emptyLessonProgressState(source.bank_id, VERSION);
    initial.progressById['SAMPLE-1.1'] = { ...progress(), completedPracticeQuestionIds: ['SAMPLE-1.1-P02'], activePracticeQuestionIds: ['SAMPLE-1.1-P01'] };
    expect(saveLessonProgress(source, VERSION, initial)).toEqual({ saved: true, message: '' });
    const restored = readLessonProgress(source, VERSION, localStorage, NOW);
    expect(restored.warning).toBe('');
    expect(restored.progressById['SAMPLE-1.1']).toEqual(initial.progressById['SAMPLE-1.1']);
    expect(restored.progressById['SAMPLE-1.1'].checkAnswers?.['SAMPLE-1.1-L01']).toEqual({ type: 'choice', value: 'Option B' });
    expect(restored.progressById['SAMPLE-1.1'].checkAnswers?.['SAMPLE-1.1-L02']?.type).toBe('math');
    expect(restored.progressById['SAMPLE-1.1']).toMatchObject({ completedPracticeQuestionIds: ['SAMPLE-1.1-P02'], activePracticeQuestionIds: ['SAMPLE-1.1-P01'] });
  });

  it('keeps lesson records separated by lesson ID and bank version', () => {
    const source = twoLessonBank(), saved = emptyLessonProgressState(source.bank_id, VERSION);
    saved.progressById['SAMPLE-1.1'] = progress();
    saved.progressById['SAMPLE-1.2'] = { ...progress('SAMPLE-1.2'), currentConceptIndex: 0, answeredCheckIds: [], checkAnswers: undefined, completedConceptIds: [], skippedChecks: [], confidenceByCheckId: undefined, revealedSteps: {} };
    saveLessonProgress(source, VERSION, saved);
    const restored = readLessonProgress(source, VERSION, localStorage, NOW);
    expect(Object.keys(restored.progressById).sort()).toEqual(['SAMPLE-1.1', 'SAMPLE-1.2']);
    expect(readLessonProgress(source, 'sample-v1-other', localStorage, NOW).progressById).toEqual({});
    expect(readLessonProgress({ ...source, bank_id: 'another-sample-lessons' }, VERSION, localStorage, NOW).progressById).toEqual({});
    expect(lessonProgressStorageKey(source.bank_id, VERSION)).not.toBe(lessonProgressStorageKey(source.bank_id, 'sample-v1-other'));
  });

  it('migrates stable progress to a revised bank version and retains the previous record', async () => {
    const source = bank();
    const oldVersion = await snapshotVersion(source);
    const saved = emptyLessonProgressState(source.bank_id, oldVersion);
    saved.progressById['SAMPLE-1.1'] = progress();
    expect(saveLessonProgress(source, oldVersion, saved).saved).toBe(true);
    const oldKey = lessonProgressStorageKey(source.bank_id, oldVersion);
    const before = localStorage.getItem(oldKey);
    const revised = structuredClone(source);
    revised.version = 'sample-v2';
    revised.lessons![0].concepts[0].blocks.push({ type: 'image-description', lang: 'fa', text: 'توضیح آزمایشی' });
    const newVersion = await snapshotVersion(revised);
    expect(newVersion).not.toBe(oldVersion);
    const migrated = readLessonProgress(revised, newVersion, localStorage, NOW);
    expect(migrated.progressById['SAMPLE-1.1']).toMatchObject({ currentConceptIndex: 1, answeredCheckIds: ['SAMPLE-1.1-L01', 'SAMPLE-1.1-L02'] });
    expect(localStorage.getItem(lessonProgressStorageKey(source.bank_id, newVersion))).not.toBeNull();
    expect(localStorage.getItem(oldKey)).toBe(before);
    expect(readLessonProgress(source, oldVersion, localStorage, NOW).progressById['SAMPLE-1.1']).toEqual(saved.progressById['SAMPLE-1.1']);
  });

  it('preserves Learning, skip-to-practice, Practising, and Done states with their timestamps', () => {
    const source = bank(), saved = emptyLessonProgressState(source.bank_id, VERSION), item = progress();
    saved.progressById[item.lessonId] = item;
    expect(saveLessonProgress(source, VERSION, saved).saved).toBe(true);
    expect(readLessonProgress(source, VERSION).progressById[item.lessonId].status).toBe('learning');
    const practising = { ...item, status: 'practising' as const, practiceStartedAt: NOW, learnSkipped: { at: NOW }, summaryOpen: false };
    saved.progressById[item.lessonId] = practising;
    expect(saveLessonProgress(source, VERSION, saved).saved).toBe(true);
    expect(readLessonProgress(source, VERSION).progressById[item.lessonId]).toMatchObject({ status: 'practising', learnSkipped: { at: NOW }, practiceStartedAt: NOW });
    saved.progressById[item.lessonId] = { ...practising, status: 'done', summaryOpen: true };
    expect(saveLessonProgress(source, VERSION, saved).saved).toBe(true);
    expect(readLessonProgress(source, VERSION).progressById[item.lessonId]).toMatchObject({ status: 'done', summaryOpen: true });
  });

  it('ignores stale progress after a lesson is removed and protects that saved record from overwrite', () => {
    const source = bank(), saved = emptyLessonProgressState(source.bank_id, VERSION);
    saved.progressById['SAMPLE-1.1'] = progress();
    saveLessonProgress(source, VERSION, saved);
    const before = localStorage.getItem(lessonProgressStorageKey(source.bank_id, VERSION));
    const withoutLesson = { ...source, lessons: [] };
    const restored = readLessonProgress(withoutLesson, VERSION, localStorage, NOW);
    expect(restored.progressById).toEqual({});
    expect(restored.warning).toMatch(/stale or invalid/i);
    expect(saveLessonProgress(withoutLesson, VERSION, restored).saved).toBe(false);
    expect(localStorage.getItem(lessonProgressStorageKey(source.bank_id, VERSION))).toBe(before);
  });

  it('leaves malformed and incompatible records untouched and starts fresh in memory', () => {
    const source = bank(), key = lessonProgressStorageKey(source.bank_id, VERSION);
    for (const raw of ['{', JSON.stringify({ schemaVersion: 999, bankId: source.bank_id, bankVersion: VERSION, lessons: {}, lessonPanelEvents: [] })]) {
      localStorage.setItem(key, raw);
      const restored = readLessonProgress(source, VERSION, localStorage, NOW);
      expect(restored.progressById).toEqual({});
      expect(restored.persistenceBlocked).toBe(true);
      expect(saveLessonProgress(source, VERSION, restored).saved).toBe(false);
      expect(localStorage.getItem(key)).toBe(raw);
    }
    const saved = emptyLessonProgressState(source.bank_id, VERSION);
    saved.progressById['SAMPLE-1.1'] = progress();
    saveLessonProgress(source, VERSION, saved);
    const stale = JSON.parse(localStorage.getItem(key)!);
    stale.lessons['SAMPLE-1.1'].answeredCheckIds.push('REMOVED-CHECK');
    const rawStale = JSON.stringify(stale);
    localStorage.setItem(key, rawStale);
    const staleRead = readLessonProgress(source, VERSION, localStorage, NOW);
    expect(staleRead.progressById).toEqual({});
    expect(staleRead.persistenceBlocked).toBe(true);
    expect(localStorage.getItem(key)).toBe(rawStale);
  });

  it('preserves in-memory work when storage is unavailable or a write fails', () => {
    const source = bank(), state = emptyLessonProgressState(source.bank_id, VERSION);
    state.progressById['SAMPLE-1.1'] = progress();
    const unavailable = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    const read = readLessonProgress(source, VERSION, unavailable, NOW);
    expect(read.persistenceBlocked).toBe(true);
    expect(read.warning).toMatch(/could not be read/i);
    const write = saveLessonProgress(source, VERSION, state, unavailable);
    expect(write.saved).toBe(false);
    expect(write.message).toMatch(/could not be saved/i);
    expect(state.progressById['SAMPLE-1.1'].checkAnswers?.['SAMPLE-1.1-L01']).toEqual({ type: 'choice', value: 'Option B' });
  });

  it('closes an interrupted reference-panel event after reload and exports only safe progress metadata', () => {
    const source = bank(), state = emptyLessonProgressState(source.bank_id, VERSION);
    const before = progress();
    before.answeredCheckIds = ['SAMPLE-1.1-L01'];
    before.skippedChecks = [{ questionId: 'SAMPLE-1.1-L02', at: NOW }];
    state.progressById['SAMPLE-1.1'] = before;
    state.activePanelEvent = { questionId: 'SAMPLE-1.1-P01', openedAt: NOW };
    expect(saveLessonProgress(source, VERSION, state)).toMatchObject({ saved: true });
    const restored = readLessonProgress(source, VERSION, localStorage, '2026-10-30T12:03:00.000Z');
    expect(restored.activePanelEvent).toBeUndefined();
    expect(restored.lessonPanelEvents).toEqual([{ questionId: 'SAMPLE-1.1-P01', openedAt: NOW, closedAt: '2026-10-30T12:03:00.000Z' }]);
    const exported = lessonExportDataFromState(restored);
    expect(exported.lessonProgress[0]).toMatchObject({ lessonId: 'SAMPLE-1.1', status: 'learning', skippedChecks: [{ questionId: 'SAMPLE-1.1-L02', at: NOW }], learnSkipped: { at: NOW } });
    expect(JSON.stringify(exported)).not.toContain('Option B');
    expect(JSON.stringify(exported)).not.toContain('8+1');
    expect(readLessonExportData(source.bank_id, VERSION)).toMatchObject({ found: true, data: exported });
  });
});
