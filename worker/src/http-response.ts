import type { AppContext } from './http-types';

export const PAGES_ORIGIN = 'https://amirhoseinlotfii.github.io';

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function finalizeResponse(response: Response, c: AppContext): Response {
  const headers = new Headers(response.headers);
  const origin = c.req.header('Origin');
  const allowedOrigin = c.env.ALLOWED_ORIGIN || PAGES_ORIGIN;
  headers.set('Cache-Control', 'no-store');
  if (origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    const vary = new Set(
      (headers.get('Vary') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    vary.add('Origin');
    headers.set('Vary', [...vary].join(', '));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
