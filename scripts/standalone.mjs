import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
// IIFE output has no import.meta; replace every environment value read by the app.
const result = await build({
  entryPoints: [process.argv[2] ?? 'src/main.tsx'],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.hot': 'undefined',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.VITE_SYNC_API_ORIGIN': 'undefined',
  },
  loader: { '.css': 'empty' },
});
async function expandStylesheet(path) {
  let css = await readFile(path, 'utf8');
  for (const [rule, relative] of css.matchAll(/@import ['"]([.][^'"]+)['"];?/g)) {
    css = css.replace(rule, await expandStylesheet(join(dirname(path), relative)));
  }
  return inlineFonts(css, dirname(path));
}

async function inlineFonts(css, directory) {
  for (const [source, quoted, unquoted] of css.matchAll(/url\((?:['"]([^'"]+)['"]|([^)]+))\)/g)) {
    const relative = quoted ?? unquoted;
    const extension = extname(relative);
    if (extension !== '.woff' && extension !== '.woff2') continue;
    const font = await readFile(join(directory, relative));
    css = css.replace(source, `url(data:font/${extension.slice(1)};base64,${font.toString('base64')})`);
  }
  return css;
}

const appCss = (await Promise.all(['src/styles/tokens.css', 'src/fonts.css', 'src/styles.css'].map(expandStylesheet))).join('\n');
const mathDirectory = 'node_modules/mathlive';
const mathCss = (
  await Promise.all(['mathlive-fonts.css', 'mathlive-static.css'].map((file) => expandStylesheet(join(mathDirectory, file))))
).join('\n');
const css = `${appCss}\n${mathCss}`;
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const fragment = `<div id="math-scratchpad-redux"></div>\n<style>\n${css}\n</style>\n<script>\n(()=>{${js}})();\n</script>\n`;
if (Buffer.byteLength(fragment) >= 3000000) throw Error('Inline bundle is too large.');
await mkdir('dist', { recursive: true });
await writeFile('dist/inline-fragment.html', fragment);
await writeFile(
  'dist/standalone.html',
  '<!doctype html>\n<html lang="en" dir="ltr"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="color-scheme" content="light dark"><title>Math Scratchpad</title></head>' +
    `<body>${fragment}</body></html>`,
);
console.log(`Self-contained bundle: ${Buffer.byteLength(fragment)} bytes (all editor fonts embedded for offline use).`);
