import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK_SCHEMA, parseBankText, validateBank } from '../../src/features/drive-bank/drive-bank';
import { getLearnChecks, getLesson, getPracticeQuestions, getQuestionStage } from '../../src/features/lessons/selectors';

const question = (id: string, fields: Record<string, unknown> = {}) => ({ id, mode: 'math', source: 'x+1', ...fields });
const concept = (id = 'C1', fields: Record<string, unknown> = {}) => ({ id, title: `Concept ${id}`, blocks: [], checkQuestionIds: [], ...fields });
const lesson = (id = 'L1', concepts: unknown[] = [concept()]) => ({ id, book: 'Sample book', section: '1.1', title: 'Sample lesson', concepts });
const rawBank = (questions: unknown[] = [question('Q1')], lessons?: unknown[]) => ({ schema_version: BANK_SCHEMA, bank_id: 'TEST', version: 'v7', questions, ...(lessons !== undefined ? { lessons } : {}) });

afterEach(() => vi.restoreAllMocks());

describe('lesson-aware bank parser', () => {
  it('keeps a legacy v7 bank result unchanged and defaults missing stages through a selector', () => {
    const raw = rawBank([question('Q1')]);
    const parsed = validateBank(raw);
    expect(parsed).toEqual(raw);
    expect(parsed).not.toHaveProperty('lessons');
    expect(parsed).not.toHaveProperty('parseWarnings');
    expect(getQuestionStage(parsed.questions[0])).toBe('practice');
  });

  it('validates the sample bank with zero warnings and exposes the selectors', () => {
    const fixture = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as unknown;
    const parsed = validateBank(fixture);
    expect(parsed.parseWarnings).toBeUndefined();
    expect(getLesson(parsed, 'SAMPLE-1.1')?.title).toBe('Sample lesson');
    expect(getLearnChecks(parsed, 'SAMPLE-1.1-C1').map(q => q.id)).toEqual(['SAMPLE-1.1-L01']);
    expect(getLearnChecks(parsed, 'SAMPLE-1.1-C2').map(q => q.id)).toEqual(['SAMPLE-1.1-L02']);
    expect(getPracticeQuestions(parsed, 'SAMPLE-1.1').map(q => q.id)).toEqual(['SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03']);
  });

  it('sorts valid difficulty ascending, missing or invalid last, and preserves ties', () => {
    const raw = rawBank([
      question('D3', { lessonId: 'L1', difficulty: 3 }),
      question('M1', { lessonId: 'L1' }),
      question('D1-A', { lessonId: 'L1', difficulty: 1 }),
      question('D1-B', { lessonId: 'L1', difficulty: 1 }),
      question('BAD', { lessonId: 'L1', difficulty: 0 }),
    ], [lesson('L1', [])]);
    const parsed = validateBank(raw);
    expect(getPracticeQuestions(parsed, 'L1').map(q => q.id)).toEqual(['D1-A', 'D1-B', 'D3', 'M1', 'BAD']);
    expect(parsed.parseWarnings?.join(' ')).toContain('invalid difficulty');
  });

  it('turns unknown and incomplete lesson blocks into unsupported notices and warns', () => {
    const parsed = validateBank(rawBank([question('Q1')], [lesson('L1', [concept('C1', { blocks: [
      { type: 'future-widget', text: 'not supported' },
      { type: 'math' },
      { type: 'image', src: '/image.png' },
      { type: 'math', latex: '\\frac{' },
    ] })])]));
    const blocks = parsed.lessons?.[0].concepts[0].blocks;
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'unsupported', originalType: 'future-widget', source: expect.stringContaining('not supported') }),
      expect.objectContaining({ type: 'unsupported', originalType: 'math', source: expect.stringContaining('"type": "math"') }),
      expect.objectContaining({ type: 'unsupported', originalType: 'image', source: expect.stringContaining('"src": "/image.png"') }),
      { type: 'math', latex: '\\frac{' },
    ]);
    expect(parsed.parseWarnings).toHaveLength(3);
    expect(parsed.parseWarnings?.[0]).toContain('unsupported block type: future-widget');
    expect(parsed.parseWarnings?.[1]).toContain('math block requires non-empty latex');
    expect(parsed.parseWarnings?.[2]).toContain('image block requires non-empty alt text');
  });

  it('retains description-only images, captions and examples without reveal steps', () => {
    const parsed = validateBank(rawBank([question('Q1')], [lesson('L1', [concept('C1', { blocks: [
      { type: 'image', lang: 'fa', text: 'توضیح تصویر' },
      { type: 'math', lang: 'fa', latex: 'x+1', text: 'جدول نمونه' },
      { type: 'example', lang: 'fa', text: 'متن مثال' },
    ] })])]));
    expect(parsed.lessons?.[0].concepts[0].blocks).toEqual([
      { type: 'image-description', lang: 'fa', text: 'توضیح تصویر' },
      { type: 'math', lang: 'fa', latex: 'x+1', text: 'جدول نمونه' },
      { type: 'example', lang: 'fa', text: 'متن مثال', steps: [] },
    ]);
    expect(parsed.parseWarnings?.join(' ')).toContain('image source is missing');
  });

  it('drops missing check references and exposes valid learn checks only', () => {
    const parsed = validateBank(rawBank([
      question('CHECK', { lessonId: 'L1', conceptId: 'C1', stage: 'learn' }),
    ], [lesson('L1', [concept('C1', { checkQuestionIds: ['CHECK', 'MISSING'] })])]));
    expect(parsed.lessons?.[0].concepts[0].checkQuestionIds).toEqual(['CHECK']);
    expect(getLearnChecks(parsed, 'C1').map(q => q.id)).toEqual(['CHECK']);
    expect(parsed.parseWarnings?.join(' ')).toContain('MISSING');
  });

  it('downgrades a learn question whose concept is outside its lesson', () => {
    const parsed = validateBank(rawBank([
      question('CHECK', { lessonId: 'L1', conceptId: 'OTHER', stage: 'learn' }),
    ], [lesson('L1', [concept('C1')])]));
    expect(parsed.questions[0]).toMatchObject({ id: 'CHECK', lessonId: 'L1', stage: 'practice' });
    expect(parsed.questions[0]).not.toHaveProperty('conceptId');
    expect(parsed.parseWarnings?.join(' ')).toContain('treated as practice');
  });

  it('ignores a lesson link that points to a missing lesson', () => {
    const parsed = validateBank(rawBank([
      question('Q1', { lessonId: 'MISSING', conceptId: 'C1', stage: 'learn' }),
    ], []));
    expect(getLesson(parsed, 'MISSING')).toBeUndefined();
    expect(parsed.questions[0]).not.toHaveProperty('lessonId');
    expect(parsed.questions[0]).not.toHaveProperty('conceptId');
    expect(getQuestionStage(parsed.questions[0])).toBe('practice');
    expect(parsed.parseWarnings?.join(' ')).toContain('missing lesson');
  });

  it('keeps the first duplicate lesson, concept, and question IDs and warns', () => {
    const parsed = validateBank(rawBank([
      question('Q1', { prompt: 'first' }), question('Q1', { prompt: 'duplicate' }),
    ], [
      lesson('L1', [concept('C1', { title: 'first concept' }), concept('C1', { title: 'duplicate concept' })]),
      { ...lesson('L1', []), title: 'duplicate lesson' },
    ]));
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].prompt).toBe('first');
    expect(parsed.lessons).toHaveLength(1);
    expect(parsed.lessons?.[0].concepts).toHaveLength(1);
    expect(parsed.lessons?.[0].concepts[0].title).toBe('first concept');
    expect(parsed.parseWarnings?.join(' ')).toContain('duplicate question id');
    expect(parsed.parseWarnings?.join(' ')).toContain('duplicate concept id');
    expect(parsed.parseWarnings?.join(' ')).toContain('duplicate lesson id');
  });

  it('supports empty lessons and concepts without inventing checks or practice', () => {
    const parsed = validateBank(rawBank([], [lesson('EMPTY', [])]));
    expect(parsed.lessons?.[0].concepts).toEqual([]);
    expect(getLearnChecks(parsed, 'missing')).toEqual([]);
    expect(getPracticeQuestions(parsed, 'EMPTY')).toEqual([]);
  });

  it('keeps a concept with no checks and warns when choice metadata has no valid options', () => {
    const parsed = validateBank(rawBank([
      question('BAD-CHOICE', { answerType: 'choice', lessonId: 'L1', choices: [''] }),
    ], [lesson('L1', [concept('NO-CHECKS', { checkQuestionIds: [] })])]));
    expect(parsed.lessons?.[0].concepts[0].checkQuestionIds).toEqual([]);
    expect(getLearnChecks(parsed, 'NO-CHECKS')).toEqual([]);
    expect(parsed.questions[0]).not.toHaveProperty('answerType');
    expect(parsed.parseWarnings?.join(' ')).toContain('requires at least two valid options');
  });

  it('strips answer-like keys at every depth and warns without returning their values', () => {
    const parsed = validateBank({ ...rawBank([question('Q1', { answerKey: 'secret', nested: { correct: true } })], [lesson('L1', [concept('C1', { blocks: [{ type: 'paragraph', text: 'Teaching text', solution: 'secret' }] })])]), expected: 'secret' });
    expect(JSON.stringify(parsed)).not.toContain('secret');
    expect(parsed.questions[0]).not.toHaveProperty('answerKey');
    expect(parsed.lessons?.[0].concepts[0].blocks[0]).not.toHaveProperty('solution');
    expect(parsed.parseWarnings?.length).toBeGreaterThanOrEqual(4);
  });

  it('logs parse warnings in development when parsing bank text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parsed = parseBankText(JSON.stringify({ ...rawBank([question('Q1', { answer: 'secret' })]), answers: { Q1: 'secret' } }));
    expect(parsed).not.toBe('EMPTY_BANK');
    if (parsed === 'EMPTY_BANK') throw new Error('Expected a parsed bank.');
    expect(parsed.parseWarnings?.length).toBe(2);
    expect(warn).toHaveBeenCalledWith('[Math Scratchpad] Bank content warnings:', parsed.parseWarnings);
  });
});
