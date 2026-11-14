import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPagesReleaseIdentity, writePagesReleaseIdentity } from './write-pages-version.mjs';

const sha = 'e8a4fab1e010531647289152b7768ccf69367252';

test('builds a production identity from the full main commit SHA', () => {
  assert.deepEqual(createPagesReleaseIdentity({ sha, branch: 'main' }), {
    env: 'production',
    sha,
  });
});

test('writes version.json with the exact Pages release identity', async t => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'math-scratchpad-pages-version-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));

  const identity = await writePagesReleaseIdentity({ sha, branch: 'main', outputDir });
  const actual = JSON.parse(await readFile(path.join(outputDir, 'version.json'), 'utf8'));

  assert.deepEqual(actual, identity);
});

test('rejects non-main builds and non-full commit SHAs', () => {
  assert.throws(() => createPagesReleaseIdentity({ sha, branch: 'feature' }), /only be generated from main/);
  assert.throws(() => createPagesReleaseIdentity({ sha: 'abc123', branch: 'main' }), /full 40-character commit SHA/);
});
