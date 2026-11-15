// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildPrecacheList } from '../../../scripts/lib/precache-list.mjs';

it('includes local fonts and app assets with relative paths and leaves release controls on the network', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scratchpad-precache-'));
  try {
    await mkdir(join(root, 'assets'));
    await mkdir(join(root, 'icons'));
    const included = [
      'assets/editor.js',
      'assets/style.css',
      'assets/Inter.woff',
      'assets/MathLive.woff2',
      'assets/Vazirmatn.woff',
      'icons/maskable.png',
      'index.html',
      'manifest.webmanifest',
      'privacy.html',
      'terms.html',
    ];
    const excluded = [
      'assets/editor.js.map',
      'standalone.html',
      'inline-fragment.html',
      '404.html',
      'version.json',
      'sw.js',
      'precache-manifest.json',
      'pwa-control.json',
      '.nojekyll',
    ];
    await Promise.all([...included, ...excluded].map((file) => writeFile(join(root, file), 'fixture')));
    expect(await buildPrecacheList(root)).toEqual(included.sort());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
