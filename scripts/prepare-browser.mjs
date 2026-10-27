import { existsSync, chmodSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
// A reproducible Chromium fallback when Playwright CDN downloads are unavailable.
const require = createRequire(import.meta.url);
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/tmp/math-chromium';
if (!existsSync(executable)) {
 const entry = require.resolve('@sparticuz/chromium');
 const compressed = resolve(dirname(entry), '../bin/chromium.br');
 await writeFile(executable, brotliDecompressSync(await readFile(compressed)));
 chmodSync(executable, 0o755);
}
console.log(`Browser ready: ${executable}`);
