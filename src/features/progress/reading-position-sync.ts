/**
 * Cross-tab sync for reading position.
 *
 * Durable writes go through learning storage (`math-scratchpad-reading-position-v1`),
 * which already mirrors to authenticated server state and notifies other tabs.
 * This module remains as a no-op initializer for backward-compatible boot wiring.
 */

export function initializeReadingPositionSync(): void {
  // Persistence + cross-tab updates are owned by startReadingPositionPersistence().
}

export function cleanupReadingPositionSync(): void {
  // No BroadcastChannel owner remains in this module.
}

export function getTimeSinceLastSync(): number | null {
  return null;
}
