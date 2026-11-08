import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  server: {
    allowedHosts: ['terminal.local', 'localhost', '127.0.0.1'],
    port: 5173,
  },
  plugins: [tailwindcss()],
  build: { sourcemap: true },
});
