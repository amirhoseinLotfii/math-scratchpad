import type { Hono } from 'hono';
import type { WorkerEnv } from '../env';
import type { AppContext, AppEnv } from '../http-types';
import { finalizeResponse, jsonError } from '../http-response';
import { readBoundedBody } from '../body';

function constantTimeSecretEqual(candidate: string, expected: string): boolean {
  const left = new TextEncoder().encode(candidate);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export function registerAdminResetRoutes(
  app: Hono<AppEnv>,
  ownerStub: (env: WorkerEnv) => DurableObjectStub,
  bearer: (context: AppContext) => string | undefined,
  internalJson: (path: string, body: unknown, env: WorkerEnv) => Promise<Response>,
) {
  app.post('/admin/learning-reset', async (c) => {
    const token = bearer(c);
    const expected = c.env.LEARNING_RESET_TOKEN;
    if (!expected || !token || !constantTimeSecretEqual(token, expected)) {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    const declaredLength = Number(c.req.header('Content-Length') ?? 0);
    if (declaredLength > 4_096) return finalizeResponse(jsonError('payload_too_large', 413), c);
    const body = await readBoundedBody(c.req.raw, 4_096);
    if (!body) return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    let input: { confirm?: unknown; resetId?: unknown; takeover?: unknown };
    try {
      input = JSON.parse(new TextDecoder().decode(body)) ?? {};
    } catch {
      return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    }
    if (
      input.confirm !== 'DELETE_ALL_LEARNING_DATA' ||
      typeof input.resetId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(input.resetId) ||
      (input.takeover !== undefined && input.takeover !== 'TAKEOVER_STUCK_LEARNING_RESET')
    ) {
      return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    }
    const takeover = input.takeover === 'TAKEOVER_STUCK_LEARNING_RESET';
    const response = await internalJson('/internal/learning-reset', { resetId: input.resetId, takeover }, c.env);
    return finalizeResponse(response, c);
  });

  app.get('/admin/learning-reset/status', async (c) => {
    const token = bearer(c);
    const expected = c.env.LEARNING_RESET_TOKEN;
    if (!expected || !token || !constantTimeSecretEqual(token, expected)) {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    const response = await ownerStub(c.env).fetch('https://event-store.internal/internal/learning-reset/status');
    return finalizeResponse(response, c);
  });

  app.post('/admin/learning-reset/release', async (c) => {
    const token = bearer(c);
    const expected = c.env.LEARNING_RESET_TOKEN;
    if (!expected || !token || !constantTimeSecretEqual(token, expected)) {
      return finalizeResponse(jsonError('unauthorized', 401), c);
    }
    const declaredLength = Number(c.req.header('Content-Length') ?? 0);
    if (declaredLength > 4_096) return finalizeResponse(jsonError('payload_too_large', 413), c);
    const body = await readBoundedBody(c.req.raw, 4_096);
    if (!body) return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    let input: { confirm?: unknown; resetId?: unknown };
    try {
      input = JSON.parse(new TextDecoder().decode(body)) ?? {};
    } catch {
      return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    }
    if (input.confirm !== 'RELEASE_LEARNING_SYNC' || typeof input.resetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.resetId)) {
      return finalizeResponse(jsonError('invalid_reset_request', 400), c);
    }
    const response = await internalJson('/internal/learning-reset/release', { resetId: input.resetId }, c.env);
    return finalizeResponse(response, c);
  });

  // pagehide uses sendBeacon with a safelisted text/plain body so a CORS preflight
  // cannot prevent the browser from queueing the request during document teardown.
}
