import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function createWorkerDeployArgs({ sha, branch }) {
  if (branch !== 'main') {
    throw new Error('Production Worker deploys can only run from main.');
  }
  if (!/^[a-f0-9]{40}$/i.test(sha ?? '')) {
    throw new Error('WORKERS_CI_COMMIT_SHA must be a full 40-character commit SHA.');
  }
  return [
    'deploy',
    '--config',
    'worker/wrangler.jsonc',
    '--env=',
    '--var',
    'RELEASE_ENV:production',
    '--var',
    `RELEASE_SHA:${sha.toLowerCase()}`,
  ];
}

export function assertOwnerSecret(secretList) {
  const secrets = JSON.parse(secretList);
  if (!Array.isArray(secrets) || !secrets.some((entry) => entry?.name === 'OWNER_EMAIL' && entry.type === 'secret_text')) {
    throw new Error('OWNER_EMAIL must be configured as a Worker secret before deployment.');
  }
}

function main() {
  let args;
  try {
    args = createWorkerDeployArgs({
      sha: process.env.WORKERS_CI_COMMIT_SHA,
      branch: process.env.WORKERS_CI_BRANCH,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid Worker release identity.');
    process.exitCode = 1;
    return;
  }

  const secretList = spawnSync('wrangler', ['secret', 'list', '--config', 'worker/wrangler.jsonc', '--env=', '--format', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  try {
    if (secretList.error || secretList.status !== 0) throw new Error('Unable to verify the production Worker secret.');
    assertOwnerSecret(secretList.stdout);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to verify the production Worker secret.');
    process.exitCode = 1;
    return;
  }

  const result = spawnSync('wrangler', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
