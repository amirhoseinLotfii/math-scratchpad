import type { WorkerEnv } from './env';

export function configuredOwner(env: Pick<WorkerEnv, 'OWNER_EMAIL'>): string {
  return env.OWNER_EMAIL?.trim().toLowerCase() ?? '';
}
