import type { NotionErrorCode } from './notion-mirror';

const RETRY_LIMIT = 2;

export function notionErrorCode(error: unknown): NotionErrorCode {
  const value = error as { code?: string; status?: number; headers?: Headers | Record<string, string> } | null;
  const code = value?.code?.toLowerCase() ?? '';
  const status = Number(value?.status ?? 0);
  if (code === 'subrequest_budget_exceeded' || (error instanceof Error && error.message === 'subrequest_budget_exceeded'))
    return 'subrequest_budget_exceeded';
  if (status === 401 || code.includes('unauthorized')) return 'token_invalid';
  if (status === 404 || code.includes('object_not_found')) return 'database_not_shared';
  if (status === 400 || code.includes('validation')) return 'schema_mismatch';
  if (status === 429 || code.includes('rate_limited')) return 'rate_limited';
  if (status >= 500 || code.includes('internal')) return 'remote_error';
  return 'network_error';
}

export function retryDelayMs(error: unknown, attempt: number): number | null {
  const value = error as { code?: string; status?: number; headers?: Headers | Record<string, string> } | null;
  const status = Number(value?.status ?? 0);
  const code = value?.code?.toLowerCase() ?? '';
  if (!(status === 429 || status >= 500 || code.includes('rate_limited'))) return null;
  const headers = value?.headers;
  const retryHeader =
    headers instanceof Headers
      ? headers.get('retry-after')
      : headers && Object.entries(headers).find(([key]) => key.toLowerCase() === 'retry-after')?.[1];
  const parsed = Number(retryHeader);
  const waitMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1_000 : 500 * 2 ** attempt;
  return Math.min(waitMs, 10_000);
}

export const NOTION_RETRY_LIMIT = RETRY_LIMIT;

export class NotionRequestQueue {
  private chain: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(
    private readonly minimumIntervalMs = 350,
    private readonly wait: (milliseconds: number) => Promise<void> = sleep,
  ) {}

  run<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.chain.then(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const remaining = this.minimumIntervalMs - (Date.now() - this.lastStartedAt);
        if (remaining > 0) await this.wait(remaining);
        this.lastStartedAt = Date.now();
        try {
          return await operation();
        } catch (error) {
          const retryDelay = retryDelayMs(error, attempt);
          if (retryDelay === null || attempt >= NOTION_RETRY_LIMIT) throw error;
          await this.wait(retryDelay);
        }
      }
    });
    this.chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
