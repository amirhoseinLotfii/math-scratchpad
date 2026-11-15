export const MAX_BODY_BYTES = 250_000;
export const MAX_STATE_BODY_BYTES = 2_100_000;
export const MAX_BATCH_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const NOTION_RESET_RECONCILIATION_PER_CALL = 10;
export const RATE_WINDOW_MS = 60_000;

export const DRIVE_STATE_KEY = 'drive-mirror-state-v1';
export const DRIVE_DEBOUNCE_MS = 1_000;
export const DRIVE_RETRY_MS = 60_000;
export const WEEKLY_BACKUP_RETRY_MS = 60_000;
export const DRIVE_MIRROR_PAGE_SIZE = 500;
export const NOTION_PROJECTION_PAGE_SIZE = 1_000;
export const NOTION_EVENTS_PER_RUN = 20;
export const NOTION_STATE_KEYS_PER_RUN = 10;
export const NOTION_DEBOUNCE_MS = 250;
export const NOTION_RETRY_MS = 60_000;
export const MAX_MIRROR_SUBREQUESTS = 40;
export const NOTION_MIRROR_STATE_KEY = 'notion-mirror-state-v1';
export const LEARNING_RESET_TABLE = 'learning_reset_control';
export const SCOPED_RESET_OPERATIONS_TABLE = 'scoped_reset_operations';
export const MAX_SCOPED_RESET_BODY_BYTES = 16_384;
export const MAX_SCOPED_RESET_REBUILD_EVENTS = 5_000;
export const SCOPED_RESET_REVIEW_CONFIRMATION = 'I_REVIEWED_SCOPED_RESET_PREVIEW';
export const SCOPED_RESET_DELETE_CONFIRMATION = 'I_CONFIRM_SCOPED_LEARNING_DATA_DELETION';
/**
 * Each trashed mirror costs two Drive subrequests (verify + batch trash). Keep one reset call
 * well under the Workers Free per-invocation subrequest cap (50) and resume on retry.
 */
export const LEARNING_RESET_TRASH_PER_CALL = 12;
