import type { LearningEventStore } from './event-store';

export interface WorkerEnv {
  EVENT_STORE: DurableObjectNamespace<LearningEventStore>;
  ALLOWED_ORIGIN: string;
  OWNER_EMAIL: string;
  GOOGLE_CLIENT_ID: string;
  /** Confidential Google OAuth client secret; add with `wrangler secret put`. */
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  /** Owner-only refresh token with the drive.file authorization; identity checked via Drive about.get. */
  GOOGLE_DRIVE_REFRESH_TOKEN?: string;
  /** Optional isolated Drive root for non-production Worker environments. */
  GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;
  GOOGLE_DRIVE_ROOT_FOLDER_NAME?: string;
  /** Internal Notion integration key; set with wrangler secret put NOTION_API_KEY. */
  NOTION_API_KEY?: string;
  /** Temporary owner-issued credential for one coordinated learning-data reset. */
  LEARNING_RESET_TOKEN?: string;
  /** Public Notion data-source identifiers. Never put credentials in these bindings. */
  NOTION_DATA_SOURCE_ATTEMPTS?: string;
  NOTION_DATA_SOURCE_SESSIONS?: string;
  NOTION_DATA_SOURCE_MISTAKES?: string;
  NOTION_DATA_SOURCE_CONCEPTS?: string;
  NOTION_DATA_SOURCE_DAILY_REPORTS?: string;
  /** Public release metadata; supply actual commit SHA at deployment time. */
  RELEASE_ENV?: string;
  RELEASE_SHA?: string;
  EVENT_RATE_LIMIT?: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: true;
}
