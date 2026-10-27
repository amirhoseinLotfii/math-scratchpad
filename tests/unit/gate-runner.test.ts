// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function run(mode: string) {
 const cwd = mkdtempSync(join(tmpdir(), 'math-test-gate-')); temporary.push(cwd);
 const bin = join(cwd, 'bin'); mkdirSync(bin); mkdirSync(join(cwd, 'test-results'));
 writeFileSync(join(cwd, 'test-results', 'vitest.json'), 'stale success');
 if (mode !== 'missing') {
  const npm = '#!/bin/sh\nif [ "$GATE_TEST_MODE" = "types-fail" ] && [ "$2" = "test:typecheck" ]; then exit 7; fi\nexit 0\n';
  const npx = '#!/bin/sh\nif [ "$GATE_TEST_MODE" = "browser-fail" ]; then exit 127; fi\nexit 0\n';
  for (const [name, body] of [['npm',npm],['npx',npx]]) { writeFileSync(join(bin,name),body); chmodSync(join(bin,name),0o755); }
 }
 const result = spawnSync(process.execPath, [resolve('scripts/test-gate.mjs')], { cwd, env: { ...process.env, PATH: bin, GATE_TEST_MODE: mode }, encoding: 'utf8' });
 return { result, cwd, record: JSON.parse(readFileSync(join(cwd,'test-results','gate.json'),'utf8')) };
}
describe('GATE-RUN: aggregate exit codes and stale evidence', () => {
 it('records automated-pass only when every subprocess actually succeeds', () => {
  const { result, record } = run('success'); expect(result.status).toBe(0); expect(record.status).toBe('automated-passed'); expect(record.results).toHaveLength(3);
  expect(result.stdout).toContain('Manual acceptance remains required');
 });
 it('retains a type-check failure while still collecting the other results', () => {
  const { result, record } = run('types-fail'); expect(result.status).toBe(1); expect(record.status).toBe('blocked');
  expect(record.results.map((r: { status: number }) => r.status)).toEqual([7,0,0]);
 });
 it('treats browser launch failure as blocked rather than a successful skip', () => {
  const { result, record } = run('browser-fail'); expect(result.status).toBe(1); expect(record.status).toBe('blocked'); expect(record.results[2].status).toBe(127);
 });
 it('missing test executables cannot reuse stale successful evidence', () => {
  const { result, record, cwd } = run('missing'); expect(result.status).toBe(1); expect(record.status).toBe('blocked');
  expect(record.results.every((r: { status: number | null; error: string }) => r.status === null && !!r.error)).toBe(true);
  expect(() => readFileSync(join(cwd,'test-results','vitest.json'),'utf8')).toThrow();
 });
});
