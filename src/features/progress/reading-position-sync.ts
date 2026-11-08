/**
 * Reading Position Synchronization
 * Handles cross-tab and cross-device synchronization of reading positions
 */

import { ReadingPosition } from './reading-position-types';

/** Sync message types */
export type SyncMessageType = 
  | 'position_update'
  | 'position_request'
  | 'position_response'
  | 'position_clear';

/** Message payload for sync */
export interface SyncMessage {
  type: SyncMessageType;
  position?: ReadingPosition | null;
  requestId?: string;
  tabId?: string;
}

/** Broadcast channel for cross-tab communication */
let syncChannel: BroadcastChannel | null = null;

/** Storage key for last sync timestamp */
const LAST_SYNC_KEY = 'lastReadingPositionSync';

/** Get a unique tab identifier */
function getTabId(): string {
  // In a real implementation, use a unique ID for each tab
  return `tab_${Math.random().toString(36).substr(2, 9)}`;
}

/** Initialize synchronization */
export function initializeReadingPositionSync() {
  if (typeof BroadcastChannel === 'undefined') {
    // Browser doesn't support BroadcastChannel (e.g., some older browsers)
    return;
  }

  if (syncChannel) {
    // Already initialized
    return;
  }

  const channelName = 'math-scratchpad_reading_position';
  syncChannel = new BroadcastChannel(channelName);
  const tabId = getTabId();

  syncChannel.onmessage = (event: MessageEvent) => {
    const message: SyncMessage = event.data;
    
    // Ignore messages from this tab
    if (message.tabId === tabId) {
      return;
    }

    handleSyncMessage(message);
  };

  // Send initial sync message
  syncChannel.postMessage({
    type: 'position_request',
    tabId,
  } as SyncMessage);
}

/** Handle incoming sync messages */
function handleSyncMessage(message: SyncMessage) {
  switch (message.type) {
    case 'position_update':
      handlePositionUpdate(message);
      break;
    case 'position_request':
      handlePositionRequest(message);
      break;
    case 'position_response':
      handlePositionResponse(message);
      break;
    case 'position_clear':
      handlePositionClear(message);
      break;
  }
}

/** Handle position update from another tab */
function handlePositionUpdate(message: SyncMessage) {
  if (message.position) {
    // Update local state with the new position
    // In a real implementation, this would update the store
    updateLocalPosition(message.position);
    
    // Acknowledge the update
    if (message.tabId) {
      sendSyncMessage({
        type: 'position_response',
        position: getCurrentPosition(),
        requestId: message.requestId,
        tabId: getTabId(),
      });
    }
  }
}

/** Handle position request from another tab */
function handlePositionRequest(message: SyncMessage) {
  if (message.requestId) {
    sendSyncMessage({
      type: 'position_response',
      position: getCurrentPosition(),
      requestId: message.requestId,
      tabId: getTabId(),
    });
  }
}

/** Handle position response */
function handlePositionResponse(message: SyncMessage) {
  if (message.position && message.requestId) {
    // Update with the latest position
    updateLocalPosition(message.position);
  }
}

/** Handle position clear */
function handlePositionClear(message: SyncMessage) {
  // Clear local position
  clearLocalPosition();
}

/** Send a sync message */
function sendSyncMessage(message: SyncMessage) {
  if (syncChannel) {
    syncChannel.postMessage(message);
  }
}

/** Update local position (mock implementation) */
function updateLocalPosition(position: ReadingPosition) {
  // In a real implementation, this would update the store
  localStorage.setItem('lastReadingPosition', JSON.stringify(position));
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

/** Get current position (mock implementation) */
function getCurrentPosition(): ReadingPosition | null {
  const stored = localStorage.getItem('lastReadingPosition');
  if (stored) {
    try {
      const position = JSON.parse(stored) as ReadingPosition;
      return {
        ...position,
        updatedAt: new Date(position.updatedAt),
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** Clear local position */
function clearLocalPosition() {
  localStorage.removeItem('lastReadingPosition');
}

/** Cleanup synchronization */
export function cleanupReadingPositionSync() {
  if (syncChannel) {
    syncChannel.close();
    syncChannel = null;
  }
}

/** Check if position needs sync */
export function needsSync(lastSync: Date, currentPosition: ReadingPosition): boolean {
  return currentPosition.updatedAt > lastSync;
}

/** Get time since last sync */
export function getTimeSinceLastSync(): number | null {
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  if (lastSync) {
    const lastSyncDate = new Date(lastSync);
    return Date.now() - lastSyncDate.getTime();
  }
  return null;
}
