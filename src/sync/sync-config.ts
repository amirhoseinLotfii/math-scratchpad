/** Public Worker endpoint used by the authenticated server-first client. */
const PRODUCTION_SYNC_API_ORIGIN = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';
const STAGING_SYNC_API_ORIGIN = 'https://math-scratchpad-sync-staging.math-scratchpad-redux.workers.dev';
const browserWindow = (globalThis as typeof globalThis & { window?: { location?: { search?: string } } }).window;
const useStaging = new URLSearchParams(browserWindow?.location?.search ?? '').get('syncEnv') === 'staging';

// The public query switch allows the published Pages app to verify the isolated staging Worker.
// A build-time override is available for private/local integration runs.
export const SYNC_API_ORIGIN = useStaging ? STAGING_SYNC_API_ORIGIN : PRODUCTION_SYNC_API_ORIGIN;
