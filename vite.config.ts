import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';

function appBuildSha(): string {
  const configured = process.env.VITE_BUILD_SHA || process.env.GITHUB_SHA;
  if (configured) return configured;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  server: {
    allowedHosts: ['terminal.local', 'localhost', '127.0.0.1'],
    port: 5173,
  },
  plugins: [tailwindcss()],
  define: { __APP_BUILD_SHA__: JSON.stringify(appBuildSha()) },
  build: { sourcemap: true },
});
