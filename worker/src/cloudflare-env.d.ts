import type { WorkerEnv } from './env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

export {};
