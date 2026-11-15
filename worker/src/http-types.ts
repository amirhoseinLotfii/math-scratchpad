import type { Context } from 'hono';
import type { GoogleIdentity, WorkerEnv } from './env';
export type AuthKind = 'google' | 'session';
export type AppEnv = { Bindings: WorkerEnv; Variables: { identity: GoogleIdentity; authKind: AuthKind; sessionHash?: string } };
export type AppContext = Context<AppEnv>;
