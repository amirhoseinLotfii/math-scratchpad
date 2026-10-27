import { readFileSync } from 'node:fs';
import { validateManualAcceptance } from './lib/acceptance-policy.mjs';
try {
 const errors = validateManualAcceptance(JSON.parse(readFileSync(new URL('../docs/testing/manual-acceptance.json', import.meta.url), 'utf8')));
 if (errors.length) { console.error('Manual acceptance BLOCKED:\n' + errors.join('\n')); process.exitCode = 1; }
 else console.log('Manual acceptance evidence complete. No publishing action performed.');
} catch (error) { console.error('Manual acceptance unavailable:', error.message); process.exitCode = 1; }
