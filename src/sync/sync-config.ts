/** Public Worker endpoint used by the authenticated server-first client. */
const PRODUCTION_SYNC_API_ORIGIN = 'https://math-scratchpad-sync.math-scratchpad-redux.workers.dev';
const STAGING_SYNC_API_ORIGIN = 'https://math-scratchpad-sync-staging.math-scratchpad-redux.workers.dev';
const browserWindow = (globalThis as typeof globalThis & { window?: { location?: { search?: string } } }).window;
const useStaging = new URLSearchParams(browserWindow?.location?.search ?? '').get('syncEnv') === 'staging';
const buildTimeOverride = (import.meta as ImportMeta & {
  readonly env?: { readonly VITE_SYNC_API_ORIGIN?: string };
}).env?.VITE_SYNC_API_ORIGIN?.trim();

// The public query switch verifies the isolated staging Worker; local E2E can route directly to its fixture Worker.
export const SYNC_API_ORIGIN = buildTimeOverride || (useStaging ? STAGING_SYNC_API_ORIGIN : PRODUCTION_SYNC_API_ORIGIN);
