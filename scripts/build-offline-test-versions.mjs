import { execFileSync } from 'node:child_process';

const builds = [
  { directory: 'dist-a', sha: 'offline-test-a' },
  { directory: 'dist-b', sha: 'offline-test-b' },
  { directory: 'dist-kill', sha: 'offline-test-kill', kill: true },
];

for (const build of builds) {
  const env = {
    ...process.env,
    VITE_BUILD_SHA: build.sha,
    BUILD_SHA: build.sha,
    KILL: build.kill ? '1' : '0',
  };
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', build.directory, '--emptyOutDir'], {
    env,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['scripts/build-sw.mjs', build.directory], { env, stdio: 'inherit' });
}
