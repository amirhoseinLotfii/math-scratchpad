/**
 * Reading Position & Continue Where You Left Off Feature
 * 
 * This module provides functionality for tracking and restoring user's reading position
 * across sessions and devices, enabling users to continue from where they left off.
 */

export {
  ReadingPosition,
  ReadingActivityType,
  MinimalReadingPosition,
  ReadingPositionConfig,
  DEFAULT_POSITION_CONFIG,
  READING_POSITION_KEY,
  SESSION_KEY,
} from './reading-position-types';

export {
  useReadingPositionStore,
  getMinimalPosition,
  startReadingPositionPersistence,
} from './reading-position-store';

export {
  READING_POSITION_STORAGE_KEY,
  serializeReadingPosition,
  deserializeReadingPosition,
} from './reading-position-storage';

export {
  readingPositionFromLearnEvent,
  mergeLatestReadingPosition,
  isLocationLearnEvent,
} from './reading-position-from-event';

export {
  sectionAnchorId,
  conceptAnchorId,
  parseAnchorId,
} from './reading-position-anchors';

export {
  useReadingPosition,
  useLessonPosition,
} from './use-reading-position';

export {
  ReadingPositionProvider,
  useReadingPositionContext,
  useOptionalReadingPositionContext,
  ContinueLearningButton,
} from './reading-position-context';

export {
  initializeReadingPositionSync,
  cleanupReadingPositionSync,
  getTimeSinceLastSync,
} from './reading-position-sync';

export {
  RestorePosition,
  useSemanticScrollRestoration,
} from './restore-position';
