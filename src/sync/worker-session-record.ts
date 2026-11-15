const SESSION_PATTERN = /^mss1\.[A-Za-z0-9_-]{43}$/;
export type WorkerSession = { token: string; expiresAt: number };
export function validRecord(value: unknown): WorkerSession | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as { token?: unknown; expiresAt?: unknown };
  if (
    typeof record.token !== 'string' ||
    !SESSION_PATTERN.test(record.token) ||
    typeof record.expiresAt !== 'number' ||
    !Number.isFinite(record.expiresAt)
  )
    return undefined;
  return { token: record.token, expiresAt: record.expiresAt };
}
