/**
 * Reading Position Types
 * Defines the structure for tracking user's reading/learning progress
 */

/** Unique identifier for content anchors (sections, examples, exercises) */
export type ContentAnchorId = string;

/** Position tracking for a specific reading session */
export interface ReadingPosition {
  /** Unique user identifier */
  userId: string;
  
  /** Current chapter identifier */
  chapterId?: string;
  
  /** Current lesson identifier */
  lessonId?: string;
  
  /** Current section within lesson */
  sectionId?: string;
  
  /** Specific content anchor (e.g., example, exercise) */
  contentAnchorId?: ContentAnchorId;
  
  /** Current exercise identifier */
  exerciseId?: string;
  
  /** Current step within exercise */
  stepId?: string;
  
  /** Scroll position in the container */
  scrollOffset?: number;
  
  /** Relative offset within content */
  relativeOffset?: number;
  
  /** Version of the content being read */
  contentVersion: string;
  
  /** Type of the last meaningful activity */
  lastActivity: ReadingActivityType;
  
  /** When the position was last updated */
  updatedAt: Date;
  
  /** Device/session metadata */
  deviceMetadata?: {
    viewportWidth: number;
    viewportHeight: number;
    userAgent?: string;
  };
}

/** Types of meaningful learning activities */
export type ReadingActivityType = 
  | 'reading'
  | 'exercise_started'
  | 'exercise_completed'
  | 'example_viewed'
  | 'step_added'
  | 'step_edited'
  | 'answer_submitted';

/** Minimal position data for quick restoration */
export interface MinimalReadingPosition {
  chapterId?: string;
  lessonId?: string;
  sectionId?: string;
  exerciseId?: string;
  stepId?: string;
  scrollOffset?: number;
}

/** Configuration for reading position tracking */
export interface ReadingPositionConfig {
  /** Enable automatic position tracking */
  enabled: boolean;
  
  /** Debounce time for position updates (ms) */
  debounceTime: number;
  
  /** Enable cross-device sync */
  syncEnabled: boolean;
  
  /** Prefix for storage keys */
  storagePrefix: string;
}

/** Default configuration */
export const DEFAULT_POSITION_CONFIG: ReadingPositionConfig = {
  enabled: true,
  debounceTime: 1000,
  syncEnabled: true,
  storagePrefix: 'math-scratchpad_position',
};

/** Legacy local-only key (superseded by learning-storage / server state). */
export const READING_POSITION_KEY = 'lastReadingPosition';

/** Storage key for the current session */
export const SESSION_KEY = 'currentSession';
