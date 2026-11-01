import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const commands = [
 ['types', 'npm', ['run','test:typecheck']],
 ['unit-dom-coverage', 'npm', ['run','test:coverage','--','--reporter=json','--outputFile=test-results/vitest.json']],
 ['browser', 'npx', ['playwright','test','--max-failures=1',`--workers=${process.env.CI ? 1 : 2}`]],
];
const results = [];
mkdirSync('test-results', { recursive: true });
for (const file of ['vitest.json', 'playwright.json']) rmSync(`test-results/${file}`, { force: true });
function record(status) { writeFileSync('test-results/gate.json', JSON.stringify({ status, generatedAt: new Date().toISOString(), results }, null, 2)); }
record('running');
for (const [name, command, args] of commands) {
 console.log(`\nRunning gate: ${name}`);
 const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
 results.push({ name, status: result.status, signal: result.signal, error: result.error?.message });
 record('running');
}
mkdirSync('test-results', { recursive: true });
process.exitCode = results.every(x => x.status === 0 && !x.error) ? 0 : 1;
record(process.exitCode ? 'blocked' : 'automated-passed');
console.log(process.exitCode ? 'Automated gate BLOCKED. Release is not approved.' : 'Automated checks passed. Manual acceptance remains required.');
