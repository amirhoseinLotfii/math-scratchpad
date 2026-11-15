import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOwnerSecret, createWorkerDeployArgs } from './deploy-worker.mjs';

const sha = 'e8a4fab1e010531647289152b7768ccf69367252';

test('targets the top-level production Worker with the exact build SHA', () => {
  assert.deepEqual(createWorkerDeployArgs({ sha, branch: 'main' }), [
    'deploy',
    '--config',
    'worker/wrangler.jsonc',
    '--env=',
    '--var',
    'RELEASE_ENV:production',
    '--var',
    `RELEASE_SHA:${sha}`,
  ]);
});

test('fails closed for non-main branches or invalid SHAs', () => {
  assert.throws(() => createWorkerDeployArgs({ sha, branch: 'feature' }), /only run from main/);
  assert.throws(() => createWorkerDeployArgs({ sha: 'abc123', branch: 'main' }), /full 40-character commit SHA/);
});

test('requires an owner secret before a production deploy', () => {
  assert.doesNotThrow(() => assertOwnerSecret('[{"name":"OWNER_EMAIL","type":"secret_text"}]'));
  assert.throws(() => assertOwnerSecret('[]'), /OWNER_EMAIL must be configured/);
  assert.throws(() => assertOwnerSecret('[{"name":"OWNER_EMAIL","type":"plain_text"}]'), /OWNER_EMAIL must be configured/);
});
