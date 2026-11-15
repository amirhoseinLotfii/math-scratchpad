import { env } from 'cloudflare:test';
import { createApp, type IdTokenVerifier } from '../../src/index';
import type { GoogleIdentity, WorkerEnv } from '../../src/env';

export const OWNER_EMAIL = 'owner@example.test';
export const CLIENT_ID = 'test-google-client.apps.googleusercontent.com';
export const ALLOWED_ORIGIN = 'https://amirhoseinlotfii.github.io';
export const OWNER: GoogleIdentity = { sub: 'google-subject-for-test', email: OWNER_EMAIL, email_verified: true };
export const testEnv = env as unknown as WorkerEnv;

export const validVerifier: IdTokenVerifier = async (token) => {
  if (token !== 'valid-test-token') throw new Error('Invalid test token.');
  return OWNER;
};

export function makeEvent(id = crypto.randomUUID()) {
  return {
    id,
    schema: 1,
    ts: new Date().toISOString(),
    deviceId: crypto.randomUUID(),
    bankVersion: 'v21',
    session: 'test-session',
    chapter: 1,
    lesson: '1.1',
    section: '1.1',
    concept: 'relations',
    type: 'lesson_open',
  };
}

export function call(
  app: ReturnType<typeof createApp>,
  path: string,
  options: { method?: string; token?: string; origin?: string; body?: unknown; extraHeaders?: Record<string, string> } = {},
) {
  const headers = new Headers(options.extraHeaders);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.origin) headers.set('Origin', options.origin);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return app.fetch(
    new Request(`https://worker.test${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    }),
    testEnv,
  );
}
