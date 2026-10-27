import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ base: './', server: { allowedHosts: ['terminal.local'] }, plugins: [tailwindcss()], build: { sourcemap: true } });
