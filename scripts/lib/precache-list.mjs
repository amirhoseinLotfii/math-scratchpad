import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const skipped = new Set([
  'standalone.html',
  'inline-fragment.html',
  '404.html',
  'version.json',
  'precache-manifest.json',
  'sw.js',
  '.nojekyll',
  'pwa-control.json',
]);

/** @param {string} directory @param {string} [prefix] @returns {Promise<string[]>} */
export async function buildPrecacheList(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = prefix + entry.name;
      if (entry.isDirectory()) return buildPrecacheList(join(directory, entry.name), path + '/');
      if (entry.isFile() && !skipped.has(path) && !path.endsWith('.map')) return [path];
      return [];
    }),
  );
  return files.flat().sort();
}
