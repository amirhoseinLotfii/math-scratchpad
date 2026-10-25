import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser';
import { diagnosticQuestions, type DiagnosticQuestion } from '../src/diagnostic';
import { gradeDiagnostic } from '../src/assessment';
import { uid, type Exercise } from '../src/model';
function q(answer: string, simplest = false): DiagnosticQuestion {
  return { id: 1, stem: 'آزمون', source: '', expected: answer, skill: 'Regression', simplest };
}
function ex(expression: string): Exercise {
  return { id: uid(), source: 'exercise', mode: 'math',
    steps: [{ id: uid(), final: true, status: 'unchecked', expression: parse(expression) }] };
}
describe('No-hint 30-question bank', () => {
  it('has 30 unique questions with Persian stems and valid LTR math expressions', () => {
    expect(diagnosticQuestions).toHaveLength(30);
    expect(new Set(diagnosticQuestions.map(x => x.id)).size).toBe(30);
    for (const question of diagnosticQuestions) {
      expect(question.stem).toMatch(/[\u0600-\u06ff]/);
      expect(question.source).not.toMatch(/[\u0600-\u06ff]/);
      expect(() => parse(question.source)).not.toThrow();
      expect(question.expected).toMatch(/^-?\d+(?:\/\d+)?$/);
      expect(Object.keys(question)).not.toContain('hint');
    }
  });
});
describe('Diagnostic numerical/form/step grading regressions', () => {
  it('accepts equivalent fractions while separately identifying unsimplified form', () => {
    const r = gradeDiagnostic(ex('\\frac{375}{1000}'), q('3/8', true));
    expect(r.numeric).toBe('correct');
    expect(r.form).toBe('equivalent-unsimplified');
    expect(r.steps).toBe('consistent');
  });
  it('accepts fully simplified answers', () => {
    const r = gradeDiagnostic(ex('\\frac{3}{8}'), q('3/8', true));
    expect(r.numeric).toBe('correct');
    expect(r.form).toBe('simplified');
  });
  it('detects a wrong equality independently from a final answer', () => {
    const r = gradeDiagnostic(ex('\\frac{6}{8}+\\frac{1}{8}=\\frac{2}{8}'), q('2/8'));
    expect(r.numeric).toBe('correct');
    expect(r.steps).toBe('inconsistent');
  });
  it('checks signed subtraction exactly rather than using floating point', () => {
    const r = gradeDiagnostic(ex('-\\frac{7}{12}-\\frac{1}{8}=-\\frac{17}{24}'), q('-17/24'));
    expect(r.numeric).toBe('correct');
    expect(r.steps).toBe('consistent');
  });
  it('recognizes mixed numbers without adding a calculator', () => {
    const r = gradeDiagnostic(ex('1\\frac{3}{4}+2\\frac{5}{6}=\\frac{55}{12}'), q('55/12'));
    expect(r.numeric).toBe('correct');
  });
  it('flags adjacent unconnected fractions for manual review, not a wrong numerical answer', () => {
    const r = gradeDiagnostic(ex('\\frac{6}{8}\\frac{3}{4}'), q('3/4'));
    expect(r.numeric).toBe('unverified');
    expect(r.form).toBe('unverified');
  });
  it('detects missing or invalid denominators without silently changing an answer', () => {
    const r = gradeDiagnostic(ex('\\frac{7}{0}'), q('7/8'));
    expect(r.numeric).toBe('unverified');
  });
  it('distinguishes correct numerical value from a wrong sign', () => {
    expect(gradeDiagnostic(ex('\\frac{1}{3}'), q('-1/3')).numeric).toBe('incorrect');
  });
});

describe('Signed answer form regressions — 0.5.1', () => {
  it('accepts lowest-terms negative fractions', () => {
    const result = gradeDiagnostic(ex('-\\frac{1}{8}'), q('-1/8', true));
    expect(result.numeric).toBe('correct');
    expect(result.form).toBe('simplified');
  });
  it('flags negative equivalent fractions that are not in lowest terms', () => {
    const result = gradeDiagnostic(ex('-\\frac{4}{32}'), q('-1/8', true));
    expect(result.numeric).toBe('correct');
    expect(result.form).toBe('equivalent-unsimplified');
  });
  it('accepts simplified negative integers', () => {
    const result = gradeDiagnostic(ex('-1'), q('-1', true));
    expect(result.numeric).toBe('correct');
    expect(result.form).toBe('simplified');
  });
  it('does not invent a grade for unfinished adjacent math', () => {
    expect(gradeDiagnostic(ex('\\frac{6}{8}\\frac{3}{4}'), q('3/4')).numeric).toBe('unverified');
  });
});
