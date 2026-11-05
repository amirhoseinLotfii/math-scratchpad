#!/usr/bin/env node
// Verify vendored upstream UI/UX Pro Max files against their original Git blob hashes.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'docs/ui-ux-pro-max-source-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let errors = [];
for (const file of manifest.files) {
  const target = resolve(root, manifest.targetDirectory, file.path);
  if (!existsSync(target)) { errors.push('MISSING ' + file.path); continue; }
  const body = readFileSync(target);
  const hash = createHash('sha1').update('blob ' + body.length + '\0').update(body).digest('hex');
  if (hash !== file.sha) errors.push('HASH_MISMATCH ' + file.path + ' expected ' + file.sha + ' got ' + hash);
  if (body.length !== file.size) errors.push('SIZE_MISMATCH ' + file.path);
}
if (errors.length) {
  console.error('UI/UX Pro Max integrity check failed: ' + errors.length + ' issue(s)');
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('UI/UX Pro Max: verified ' + manifest.files.length + ' upstream files from ' + manifest.sourceCommit);
}
