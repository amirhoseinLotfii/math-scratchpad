import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], { encoding: 'utf8' }));
const packages = new Map();
function walk(node) { for (const [name, info] of Object.entries(node.dependencies ?? {})) { packages.set(name, info.version); walk(info); } }
walk(tree);
let text = '# Third-party notices\n\nRuntime dependencies bundled with the application. Source packages retain their licenses.\n';
for (const [name, version] of [...packages].sort()) {
  const root = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  let notice = '';
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'LICENSE-MIT', 'LICENSE-MIT.txt']) { try { notice = await readFile(`${root}/${file}`, 'utf8'); break; } catch {} }
  if (!notice) throw Error(`Missing license text for ${name}`);
  text += `\n## ${name} ${version} (${pkg.license})\n\n${notice.trim()}\n`;
}
await writeFile('THIRD_PARTY_NOTICES.md', text);
console.log(`Notices for ${packages.size} runtime packages`);
