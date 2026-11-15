import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { buildPrecacheList } from './lib/precache-list.mjs';

function localSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'dev';
  }
}

const directory = process.argv[2] ?? 'dist';
const release = process.env.BUILD_SHA || process.env.GITHUB_SHA || localSha();
if (!/^[a-z0-9-]{1,80}$/i.test(release)) throw new Error('Invalid service-worker build identifier.');
const paths = await buildPrecacheList(directory);
if (!paths.includes('index.html')) throw new Error('Cannot build an offline shell without index.html.');
await build({
  entryPoints: ['src/pwa/sw.ts'],
  outfile: join(directory, 'sw.js'),
  bundle: true,
  minify: true,
  define: { BUILD_SHA: JSON.stringify(release), PRECACHE_PATHS: JSON.stringify(paths) },
});
await writeFile(join(directory, 'precache-manifest.json'), JSON.stringify({ sha: release, paths }, null, 2));
