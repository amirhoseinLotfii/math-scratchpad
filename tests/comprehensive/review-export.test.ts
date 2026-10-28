import { describe, expect, it } from 'vitest';
import { fingerprint, reviewMessage, reviewPayload } from '../../src/review';
import { buildTutorExport, exportItem, itemStatus, missingFinalAnswers, TUTOR_EXPORT_SCHEMA } from '../../src/features/session/export/tutor-export';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { parse } from '../../src/parser';
import { blankStep, type Document } from '../../src/model';
import { questionStatus } from '../../src/features/workspace/model/workspace-layout';

const bankDoc = (): Document => bankDocument(validateBank({ schema_version: 'math-scratchpad.bank/1.0', bank_id: 'GEN', version: 'v3', questions: [
  { id: 'FU02', mode: 'math', source: '\\frac{3}{8}-\\frac{7}{8}', prompt: 'حاصل؟' }, { id: 'T1', mode: 'text', source: 'متن فارسی' }, { id: 'Q3', mode: 'math', source: '۱+۲' }] }), 'v3-abc');
const work = (doc: Document, i: number, src: string, final = false) => { const s = blankStep(); s.expression = parse(src); s.final = final; doc.exercises[i].steps = [s]; return s; };

describe('Check · Copy for Review payload', () => {
  it('has the exact top-level shape', () => {
    const doc = bankDoc(); const p = reviewPayload(doc);
    expect(Object.keys(p)).toEqual(['type', 'version', 'problem', 'questionId', 'prompt', 'confidence', 'trackedVisibleMs', 'steps', 'reviewThroughStep', 'finalAnswer']);
    expect(p).toMatchObject({ type: 'math-scratchpad-review', version: 1, problem: { format: 'math-or-latex', text: '\\frac{3}{8}-\\frac{7}{8}' }, prompt: 'حاصل؟', confidence: null, trackedVisibleMs: null, finalAnswer: null, reviewThroughStep: 1 });
    expect(p.steps).toEqual([{ number: 1, latex: '\\square', isFinal: false }]);
  });
  it('includes the bank question id (fixed: it used to be null for bank questions)', () => { expect(reviewPayload(bankDoc()).questionId).toBe('FU02'); });
  it('reports the marked final answer and reviewThroughStep follows the cursor', () => {
    const doc = bankDoc(); const a = work(doc, 0, '1+1'); const b = blankStep(); b.expression = parse('2'); b.final = true; doc.exercises[0].steps.push(b);
    doc.cursor.stepId = a.id; const p = reviewPayload(doc);
    expect(p.finalAnswer).toEqual({ step: 2, latex: '2' }); expect(p.reviewThroughStep).toBe(1); expect(p.steps.map(s => s.isFinal)).toEqual([false, true]);
  });
  it('text questions use persian-text format', () => { const doc = bankDoc(); doc.exerciseId = doc.exercises[1].id; expect(reviewPayload(doc).problem).toEqual({ format: 'persian-text', text: 'متن فارسی' }); });
  it('message is valid: embeds parseable JSON last and asks for Persian replies', () => {
    const msg = reviewMessage(bankDoc()); const json = JSON.parse(msg.slice(msg.indexOf('{')));
    expect(json.type).toBe('math-scratchpad-review'); expect(msg).toContain('Reply in Persian');
  });
  it('fingerprint ignores elapsed time but not content', () => {
    const doc = bankDoc(); const a = fingerprint(doc); doc.exercises[0].elapsedMs = 9999; expect(fingerprint(doc)).toBe(a); work(doc, 0, '5'); expect(fingerprint(doc)).not.toBe(a);
  });
  it('never contains answer/key fields', () => { expect(JSON.stringify(reviewPayload(bankDoc()))).not.toMatch(/"(answer|key|solution|expected)"/); });
});

describe('tutor export', () => {
  it('counts answered, skipped, unanswered and missing final answers', () => {
    const doc = bankDoc(); work(doc, 0, '1', true); doc.exercises[0].confidence = 'high'; doc.exercises[1].skipped = true; doc.session = { ...doc.session!, anxiety: 2, energy: 4 };
    const out = buildTutorExport(doc, new Date('2026-10-28T08:00:00Z'));
    expect(out.schema_version).toBe(TUTOR_EXPORT_SCHEMA); expect(out).toMatchObject({ bank_id: 'GEN', bank_version: 'v3-abc', anxiety: 2, energy: 4 });
    expect(out.totals).toEqual({ items: 3, answered: 1, skipped: 1, unanswered: 1, missing_final_answer: 0 });
    expect(out.items.map(i => i.question_id)).toEqual(['FU02', 'T1', 'Q3']); expect(out.items[2].problem).toBe('1+2');
  });
  it('work without a final answer is listed as missing', () => { const doc = bankDoc(); work(doc, 0, '1'); expect(missingFinalAnswers(doc)).toEqual([1]); });
  it('blank final step gives null final_answer', () => { const doc = bankDoc(); doc.exercises[0].steps[0].final = true; expect(exportItem(doc.exercises[0], 0).final_answer).toBeNull(); });
  it('confidence defaults to high=5 and maps medium=3, low=1', () => {
    const doc = bankDoc(); expect(exportItem(doc.exercises[0], 0).confidence).toBe(5); doc.exercises[0].confidence = 'medium'; expect(exportItem(doc.exercises[0], 0).confidence).toBe(3); doc.exercises[0].confidence = 'low'; expect(exportItem(doc.exercises[0], 0).confidence).toBe(1);
  });
  it('solve time rounds ms to seconds; hint flags independence', () => { const doc = bankDoc(); doc.exercises[0].elapsedMs = 1499; doc.exercises[0].hintUsed = true; const it0 = exportItem(doc.exercises[0], 0); expect(it0.solve_time_sec).toBe(1); expect(it0.independent).toBe(false); });
  it('navigator status: Not started / Draft / Answered / Skipped', () => {
    const doc = bankDoc(); expect(questionStatus(doc.exercises[0])).toBe('Not started'); work(doc, 0, '1'); expect(questionStatus(doc.exercises[0])).toBe('Draft');
    doc.exercises[0].confidence = 'low'; expect(questionStatus(doc.exercises[0])).toBe('Answered'); doc.exercises[0].skipped = true; expect(questionStatus(doc.exercises[0])).toBe('Skipped'); expect(itemStatus(doc.exercises[0])).toBe('skipped');
  });
});
