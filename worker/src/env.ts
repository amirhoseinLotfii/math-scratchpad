import type { LearningEventStore } from './event-store';

export interface WorkerEnv {
  EVENT_STORE: DurableObjectNamespace<LearningEventStore>;
  ALLOWED_ORIGIN: string;
  OWNER_EMAIL: string;
  GOOGLE_CLIENT_ID: string;
  /** Confidential Google OAuth client secret; add with `wrangler secret put`. */
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  /** Owner-only refresh token with drive.file and userinfo.email authorization. */
  GOOGLE_DRIVE_REFRESH_TOKEN?: string;
  EVENT_RATE_LIMIT?: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: true;
}
