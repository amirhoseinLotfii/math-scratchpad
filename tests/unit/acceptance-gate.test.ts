// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { requiredManualChecks, validateManualAcceptance } from '../../scripts/lib/acceptance-policy.mjs';
function valid() { return {
 device: 'Android fixture', osVersion: '15', browser: 'Chrome', browserVersion: 'fixture',
 assistiveTechnology: 'TalkBack fixture', reviewedBy: 'test reviewer', reviewedAt: '2026-10-26T12:00:00Z',
 checks: requiredManualChecks.map(id => ({ id, status: 'passed', evidence: `evidence/${id}.md` })),
}; }
describe('GATE: manual approval cannot be inferred from automated passes', () => {
 it('accepts a complete evidence-bearing record', () => { expect(validateManualAcceptance(valid())).toEqual([]); });
 it.each([undefined, null, 'passed', true])('rejects invalid record %s', value => { expect(validateManualAcceptance(value).length).toBeGreaterThan(0); });
 it('blocks a pending check', () => { const record = valid(); record.checks[0].status = 'pending'; expect(validateManualAcceptance(record)).toContain(`${record.checks[0].id} is not passed.`); });
 it('blocks a failed check', () => { const record = valid(); record.checks[0].status = 'failed'; expect(validateManualAcceptance(record).length).toBeGreaterThan(0); });
 it('blocks missing evidence even if every result says passed', () => { const record = valid(); record.checks[0].evidence = ''; expect(validateManualAcceptance(record).length).toBeGreaterThan(0); });
 it('blocks incomplete check lists', () => { const record = valid(); record.checks.pop(); expect(validateManualAcceptance(record).length).toBeGreaterThan(0); });
 it('blocks duplicate check IDs rather than treating them as full coverage', () => { const record = valid(); record.checks[1] = record.checks[0]; expect(validateManualAcceptance(record).some(x => x.includes('Duplicate'))).toBe(true); });
 it('blocks missing reviewer and invalid review timestamp', () => { const record = valid(); record.reviewedBy = ''; record.reviewedAt = 'not a date'; expect(validateManualAcceptance(record)).toContain('Invalid reviewedAt.'); expect(validateManualAcceptance(record)).toContain('Missing reviewedBy.'); });
 it('blocks unknown checks and a non-array checklist', () => {
  const record = valid(); record.checks.push({ id: 'unknown', status: 'passed', evidence: 'yes' });
  expect(validateManualAcceptance(record)).toContain('Unknown manual check.');
  expect(validateManualAcceptance({ ...record, checks: {} })).toContain('Missing checks array.');
 });
});
