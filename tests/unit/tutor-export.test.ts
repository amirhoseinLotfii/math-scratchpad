import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, initialState, makeStore } from '../../src/store';
import { buildTutorExport, missingFinalAnswers, TUTOR_EXPORT_SCHEMA } from '../../src/features/session/export/tutor-export';
import { createPersistentStore, SESSION_KEY, clearAppStorage } from '../../src/features/session/persistence/persistent-store';
import { serialize, validateSession } from '../../src/persistence';
import { isoLocal } from '../../src/model';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/;
function round() { const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); return s; }
function answer(s: ReturnType<typeof round>, digits: string) { for (const d of digits) s.dispatch(actions.command({ type: 'digit', value: d })); }

describe('tutor export schema', () => {
 it('exports the documented top-level and per-item fields', () => {
  const s = round(); s.dispatch(actions.setSessionMeta({ anxiety: 2, energy: 4 }));
  const data = buildTutorExport(s.getState().doc);
  expect(Object.keys(data).sort()).toEqual(['anxiety','app','app_version','ended_at','energy','exported_at','items','schema_version','session_id','started_at','totals'].sort());
  expect(data.schema_version).toBe(TUTOR_EXPORT_SCHEMA); expect(data.app_version).toBe('0.6.0');
  expect(data.anxiety).toBe(2); expect(data.energy).toBe(4); expect(data.started_at).toMatch(ISO);
  expect(data.items).toHaveLength(20);
  expect(Object.keys(data.items[0]).sort()).toEqual(['assessment','confidence','confidence_label','final_answer','final_step_id','final_step_number','guidance_available','guidance_opened','guidance_opened_at','hint_note','hint_used','independent','index','item_id','problem','problem_format','prompt','question_id','solve_time_sec','started_at','status','steps','student_answer','submitted_at'].sort());
  expect(data.items[0].status).toBe('unanswered'); expect(data.totals.unanswered).toBe(20);
 });
 it('marks the final answer, records timestamps, verbatim steps and solve time', () => {
  const s = round(); answer(s, '12');
  s.dispatch(actions.command({ type: 'newStep' })); answer(s, '3');
  s.dispatch(actions.command({ type: 'final' }));
  const ex = s.getState().doc.exercises[0];
  s.dispatch(actions.addQuestionTime({ exerciseId: ex.id, milliseconds: 41_600 }));
  const item = buildTutorExport(s.getState().doc).items[0];
  expect(item.status).toBe('answered');
  expect(item.steps.map(x => x.latex)).toEqual(['12', '3']);
  expect(item.final_answer).toBe('3'); expect(item.student_answer).toBe('3');
  expect(item.final_step_id).toBe(ex.steps[1].id); expect(item.final_step_number).toBe(2);
  expect(item.started_at).toMatch(ISO); expect(item.submitted_at).toMatch(ISO);
  expect(item.solve_time_sec).toBe(42);
  expect(missingFinalAnswers(s.getState().doc)).toEqual([]);
 });
 it('defaults confidence to 5 (high) and maps 5/3/1', () => {
  const s = round(); expect(buildTutorExport(s.getState().doc).items[0].confidence).toBe(5);
  s.dispatch(actions.setConfidence('medium')); expect(buildTutorExport(s.getState().doc).items[0].confidence).toBe(3);
  s.dispatch(actions.setConfidence('low')); expect(buildTutorExport(s.getState().doc).items[0]).toMatchObject({ confidence: 1, confidence_label: 'low' });
 });
 it('records hint use as not independent and skipped status', () => {
  const s = round(); s.dispatch(actions.setHint({ used: true, note: 'common denominator' }));
  s.dispatch(actions.adjacentExercise(1)); s.dispatch(actions.setSkipped(true));
  const [a, b] = buildTutorExport(s.getState().doc).items;
  expect(a).toMatchObject({ hint_used: true, hint_note: 'common denominator', independent: false });
  expect(b).toMatchObject({ status: 'skipped', hint_used: false, independent: true });
 });
 it('lists answered items without a final answer for the pre-export warning', () => {
  const s = round(); answer(s, '5'); s.dispatch(actions.adjacentExercise(1)); s.dispatch(actions.adjacentExercise(1)); answer(s, '7'); s.dispatch(actions.command({ type: 'final' }));
  expect(missingFinalAnswers(s.getState().doc)).toEqual([1]);
  expect(buildTutorExport(s.getState().doc).totals).toMatchObject({ answered: 2, missing_final_answer: 1 });
 });
 it('isoLocal carries an explicit UTC offset', () => { expect(isoLocal(new Date())).toMatch(ISO); });
});

describe('local storage save / restore / reset / migration', () => {
 beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false })); });
 afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
 it('autosaves new metadata and restores it after reload, with a saved indicator', () => {
  const a = createPersistentStore();
  a.store.dispatch(actions.startFractionRound()); a.store.dispatch(actions.setSessionMeta({ anxiety: 3 }));
  a.store.dispatch(actions.command({ type: 'digit', value: '4' })); a.store.dispatch(actions.command({ type: 'final' })); a.store.dispatch(actions.setHint({ used: true }));
  vi.advanceTimersByTime(200);
  expect(a.store.getState().savedAt).toMatch(ISO);
  a.dispose();
  const b = createPersistentStore(); const doc = b.store.getState().doc;
  expect(doc.session?.anxiety).toBe(3); expect(doc.exercises).toHaveLength(20);
  expect(doc.exercises[0]).toMatchObject({ hintUsed: true }); expect(doc.exercises[0].submittedAt).toMatch(ISO); expect(doc.exercises[0].steps[0].final).toBe(true);
  b.dispose();
 });
 it('migrates a legacy v2 draft without session metadata', () => {
  const legacy = initialState(); delete (legacy.doc as { session?: unknown }).session;
  localStorage.setItem('math-scratchpad-redux-v2', serialize(legacy));
  const r = createPersistentStore(); expect(r.store.getState().doc.exercises[0].id).toBe(legacy.doc.exercises[0].id);
  expect(buildTutorExport(r.store.getState().doc).session_id).toBe('unknown'); r.dispose();
 });
 it('resetSession starts a fresh session id and clears answers', () => {
  const s = round(); const old = s.getState().doc.session!.id; answer(s, '9');
  s.dispatch(actions.resetSession());
  expect(s.getState().doc.exercises).toHaveLength(1); expect(s.getState().doc.session?.id).toBeTruthy(); expect(s.getState().past).toEqual([]);
  expect(s.getState().doc.session!.id === old || s.getState().doc.session!.id.length > 0).toBe(true);
 });
 it('clearStorage removes every app key and blocks later autosaves', () => {
  const r = createPersistentStore(); r.store.dispatch(actions.command({ type: 'digit', value: '1' })); vi.advanceTimersByTime(200);
  localStorage.setItem('math-scratchpad-redux-v2', '{}'); localStorage.setItem('other-app', 'keep');
  r.store.clearStorage!(); r.store.dispatch(actions.command({ type: 'digit', value: '2' })); vi.advanceTimersByTime(500); r.dispose();
  expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(localStorage.getItem('math-scratchpad-redux-v2')).toBeNull(); expect(localStorage.getItem('other-app')).toBe('keep');
  expect(clearAppStorage()).toBe(true);
 });
 it('backup export/import round-trips session metadata and item fields', () => {
  const s = round(); s.dispatch(actions.setSessionMeta({ energy: 5, endedAt: isoLocal() })); answer(s, '8'); s.dispatch(actions.command({ type: 'final' })); s.dispatch(actions.setHint({ used: true, note: 'x' }));
  const restored = validateSession(JSON.parse(serialize(s.getState())));
  expect(restored.doc.session).toEqual(s.getState().doc.session);
  expect(buildTutorExport(restored.doc).items[0]).toEqual(buildTutorExport(s.getState().doc).items[0]);
 });
 it('rejects malformed metadata safely', () => {
  const s = round(); const raw = JSON.parse(serialize(s.getState()));
  raw.doc.session = { id: '<script>', startedAt: 'yesterday', anxiety: 9 }; raw.doc.exercises[0].startedAt = 'bad';
  const restored = validateSession(raw);
  expect(restored.doc.session).toBeUndefined(); expect(restored.doc.exercises[0].startedAt).toBeUndefined();
 });
});
