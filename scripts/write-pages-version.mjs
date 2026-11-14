import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createPagesReleaseIdentity({ sha, branch }) {
  if (branch !== 'main') {
    throw new Error('Pages release identity can only be generated from main.');
  }
  if (!/^[a-f0-9]{40}$/i.test(sha ?? '')) {
    throw new Error('GITHUB_SHA must be a full 40-character commit SHA.');
  }
  return { env: 'production', sha: sha.toLowerCase() };
}

export async function writePagesReleaseIdentity({
  sha = process.env.GITHUB_SHA,
  branch = process.env.GITHUB_REF_NAME,
  outputDir = path.join(projectRoot, 'dist'),
} = {}) {
  const identity = createPagesReleaseIdentity({ sha, branch });
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'version.json'), `${JSON.stringify(identity)}\n`, 'utf8');
  return identity;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const identity = await writePagesReleaseIdentity();
    console.log(`Wrote Pages release identity for ${identity.env}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not write Pages release identity.');
    process.exitCode = 1;
  }
}
