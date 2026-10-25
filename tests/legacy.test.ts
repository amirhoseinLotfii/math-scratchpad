import { describe, expect, it } from 'vitest';
import { migrateChatDiagnosticSession } from '../src/legacyDiagnostic';
import { latex } from '../src/model';
import { validateSession } from '../src/persistence';

function fixture() {
  return { version: 2, ix: 4, items: Array.from({ length: 30 }, () => ({
    steps: [{ id: 1, final: true, tokens: [{ t: 'f', n: '375', d: '1000' }] }],
    confidence: 'high', skip: false
  })) };
}
describe('Legacy 30-question chat import', () => {
  it('converts all original answers into independent exercises with retained question identity', () => {
    const migrated = migrateChatDiagnosticSession(fixture())!;
    expect(migrated.doc.exercises).toHaveLength(30);
    expect(migrated.doc.exercises[0].diagnosticId).toBe(1);
    expect(migrated.doc.exercises[29].diagnosticId).toBe(30);
    expect(migrated.doc.exercises[4].id).toBe(migrated.doc.exerciseId);
    expect(migrated.doc.exercises[0].confidence).toBe('high');
    expect(latex(migrated.doc.exercises[0].steps[0].expression)).toBe('\\frac{375}{1000}');
  });
  it('preserves unsupported free-text fields as migration notes rather than scoring them wrong', () => {
    const original = fixture();
    original.items[3].steps[0].tokens[0].d = '12بزرگتر هستش';
    const migrated = migrateChatDiagnosticSession(original)!;
    expect(migrated.doc.exercises[3].migrationNotes).toContain('12بزرگتر');
    expect(migrated.doc.exercises[3].steps[0].expression.children[0].type).toBe('fraction');
    expect(validateSession({ version: 2, doc: migrated.doc }).doc.exercises[3].migrationNotes).toContain('12بزرگتر');
  });
  it('rejects malformed or excessively long legacy sessions', () => {
    expect(() => migrateChatDiagnosticSession({ version: 2, items: [] })).toThrow();
  });
  it('leaves native repo session formats to the standard validator', () => {
    expect(migrateChatDiagnosticSession({ version: 2, doc: {} })).toBeNull();
  });
});
