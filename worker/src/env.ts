import type { LearningEventStore } from './event-store';

export interface WorkerEnv {
  EVENT_STORE: DurableObjectNamespace<LearningEventStore>;
  ALLOWED_ORIGIN: string;
  OWNER_EMAIL: string;
  GOOGLE_CLIENT_ID: string;
  EVENT_RATE_LIMIT?: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: true;
}
