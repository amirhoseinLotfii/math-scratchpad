import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const commands = [
 ['types', 'npm', ['run','test:typecheck']],
 ['worker-integration', 'npm', ['run','test:worker']],
 ['unit-dom-coverage', 'npm', ['run','test:coverage','--','--reporter=default','--reporter=json','--outputFile.json=test-results/vitest.json']],
 ['browser', 'npx', ['playwright','test','--max-failures=1',`--workers=${process.env.CI ? 1 : 2}`,...(process.env.CI ? ['--retries=1'] : [])]],
 ['sync-cross-browser', 'npm', ['run','test:e2e:p0-3-cross-browser']],
];
const results = [];
mkdirSync('test-results', { recursive: true });
for (const file of ['vitest.json', 'playwright.json']) rmSync(`test-results/${file}`, { force: true });
function record(status) { writeFileSync('test-results/gate.json', JSON.stringify({ status, generatedAt: new Date().toISOString(), results }, null, 2)); }
record('running');
for (const [name, command, args] of commands) {
 console.log(`\nRunning gate: ${name}`);
 const startedAt = Date.now();
 const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
 const stage = { name, status: result.status, signal: result.signal, error: result.error?.message, durationMs: Date.now() - startedAt };
 results.push(stage);
 record('running');
 console.log(`Gate stage ${name}: ${stage.status === 0 && !stage.error ? 'PASS' : 'FAIL'} (${Math.round(stage.durationMs / 1000)}s)`);
 if (stage.status !== 0 || stage.error) break; // Preserve evidence; do not rerun expensive downstream suites on a known failure.
}
mkdirSync('test-results', { recursive: true });
process.exitCode = results.every(x => x.status === 0 && !x.error) ? 0 : 1;
record(process.exitCode ? 'blocked' : 'automated-passed');
if (process.exitCode) {
 for (const failed of results.filter(x => x.status !== 0 || x.error)) {
  console.error(`Gate failure: ${failed.name} (exit=${failed.status}, signal=${failed.signal ?? 'none'}, error=${failed.error ?? 'none'})`);
 }
}
console.log(process.exitCode ? 'Automated gate BLOCKED. Release is not approved.' : 'Automated checks passed. Manual acceptance remains required.');
