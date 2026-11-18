import { existsSync, chmodSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// A reproducible Chromium fallback when Playwright CDN downloads are unavailable.
const require = createRequire(import.meta.url);
const configuredExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const windowsCandidates = [
 process.env.PROGRAMFILES && resolve(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
 process.env['PROGRAMFILES(X86)'] && resolve(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
 process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
 process.env.PROGRAMFILES && resolve(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
 process.env['PROGRAMFILES(X86)'] && resolve(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
 process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].filter(Boolean);

if (process.platform === 'win32' && !configuredExecutable) {
 const systemBrowser = windowsCandidates.find(candidate => existsSync(candidate));
 if (!systemBrowser) throw new Error('No Windows Chrome/Edge executable found; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
 console.log(`Browser ready: ${systemBrowser}`);
} else {
 const executable = configuredExecutable || join(tmpdir(), 'math-chromium');
 if (!existsSync(executable)) {
  const entry = require.resolve('@sparticuz/chromium');
  const compressed = resolve(dirname(entry), '../bin/chromium.br');
  await writeFile(executable, brotliDecompressSync(await readFile(compressed)));
  chmodSync(executable, 0o755);
 }
 console.log(`Browser ready: ${executable}`);
}
