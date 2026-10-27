import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
 environment: 'jsdom',
 include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
 maxWorkers: 2,
 coverage: { provider: 'v8', reportOnFailure: true, reporter: ['text', 'json-summary'], include: ['src/**/*.ts', 'src/**/*.tsx'] }
} });
