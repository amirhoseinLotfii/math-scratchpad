import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function showDirectory(directory, maxDepth, prefix = '') {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && !entry.name.endsWith('-snapshots'))
    .sort((a, b) => a.name.localeCompare(b.name));

  entries.forEach((entry, index) => {
    const last = index === entries.length - 1;
    console.log(`${prefix}${last ? '└── ' : '├── '}${entry.name}${entry.isDirectory() ? '/' : ''}`);
    if (entry.isDirectory() && maxDepth > 1) {
      showDirectory(join(directory, entry.name), maxDepth - 1, prefix + (last ? '    ' : '│   '));
    }
  });
}

const roots = process.argv.slice(2);
for (const directory of roots.length ? roots : ['src', 'shared', 'worker/src']) {
  console.log(directory + '/');
  showDirectory(directory, 2);
}
