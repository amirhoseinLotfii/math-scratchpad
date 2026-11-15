import { type LearnEventContext, type LearnEventDraft, type LearnEventType } from './events';

export type ActivityScope = {
  id: string;
  parentScopeId?: string;
  openType: LearnEventType;
  closeType?: LearnEventType;
  context?: LearnEventContext;
  fields?: Omit<LearnEventDraft, 'type' | 'ts' | 'endTs' | 'durationMs' | 'activeMs' | 'distractedMs' | 'pausedMs'>;
};

export type OpenScope = ActivityScope & {
  startedAt: number;
  startedIso: string;
  activeMs: number;
  distractedMs: number;
  pausedMs: number;
  parentScopeId?: string;
};

export type ActivityTrackerOptions = {
  idleMs?: number;
  now?: () => number;
  toIso?: (time: number) => string;
  publish?: (context: LearnEventContext, event: LearnEventDraft) => void;
};

/** Shared visibility, focus, idle and active-time accounting for nested learning scopes. */
