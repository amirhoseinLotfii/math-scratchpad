import { RATE_WINDOW_MS } from './limits';
import { json } from './response';

export function parseRateLimit(raw: string | undefined): number {
  const value = Number(raw ?? 120);
  return Number.isInteger(value) && value > 0 && value <= 10_000 ? value : 120;
}

export function consumeRateLimit(storage: DurableObjectStorage, rateLimit: number): Response | null {
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const count = storage.transactionSync(() => {
    storage.sql.exec('DELETE FROM rate_windows WHERE window_start < ?', windowStart - RATE_WINDOW_MS);
    storage.sql.exec(
      `INSERT INTO rate_windows (window_start, request_count) VALUES (?, 1)
       ON CONFLICT(window_start) DO UPDATE SET request_count = request_count + 1`,
      windowStart,
    );
    return Number(
      storage.sql.exec<{ request_count: number }>('SELECT request_count FROM rate_windows WHERE window_start = ?', windowStart).one()
        .request_count,
    );
  });

  if (count <= rateLimit) return null;
  const retryAfter = Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1_000));
  return json({ error: 'rate_limited', retryAfterSeconds: retryAfter }, 429, { 'Retry-After': String(retryAfter) });
}
