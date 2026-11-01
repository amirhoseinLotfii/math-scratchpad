import { emitLearnEvent, type LearnEventContext, type LearnEventDraft, type LearnEventType } from './events';

export type ActivityScope = {
  id: string;
  parentScopeId?: string;
  openType: LearnEventType;
  closeType?: LearnEventType;
  context?: LearnEventContext;
  fields?: Omit<LearnEventDraft, 'type' | 'ts' | 'endTs' | 'durationMs' | 'activeMs' | 'distractedMs' | 'pausedMs'>;
};

type OpenScope = ActivityScope & {
  startedAt: number;
  startedIso: string;
  activeMs: number;
  distractedMs: number;
  pausedMs: number;
  parentScopeId?: string;
};

type ActivityTrackerOptions = {
  idleMs?: number;
  now?: () => number;
  toIso?: (time: number) => string;
  publish?: (context: LearnEventContext, event: LearnEventDraft) => void;
};

/** Shared visibility, focus, idle and active-time accounting for nested learning scopes. */
export class ActivityTracker {
  private readonly scopes = new Map<string, OpenScope>();
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly toIso: (time: number) => string;
  private readonly publish: (context: LearnEventContext, event: LearnEventDraft) => void;
  private lastSettledAt: number;
  private lastActivityAt: number;
  private hidden = false;
  private focused = true;
  private idle = false;
  private paused = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private focusedStepScopeId: string | null = null;
  private listening = false;
  private documentTarget: Document | undefined;
  private windowTarget: Window | undefined;

  constructor(private baseContext: LearnEventContext, options: ActivityTrackerOptions = {}) {
    this.idleMs = options.idleMs ?? 120_000;
    this.now = options.now ?? (() => performance.now());
    const monotonicOrigin = this.now();
    const wallClockOrigin = Date.now();
    this.toIso = options.toIso ?? (time => new Date(wallClockOrigin + Math.max(0, time - monotonicOrigin)).toISOString());
    this.publish = options.publish ?? emitLearnEvent;
    this.lastSettledAt = monotonicOrigin;
    this.lastActivityAt = this.lastSettledAt;
  }

  setBaseContext(context: LearnEventContext): void {
    this.baseContext = context;
  }

  startScope(scope: ActivityScope): void {
    if (this.scopes.has(scope.id)) this.stopScope(scope.id);
    const now = this.now();
    this.settle(now);
    if (this.idle) {
      this.idle = false;
      this.emitState('idle_end', now);
    }
    this.lastActivityAt = now;
    const open: OpenScope = { ...scope, startedAt: now, startedIso: this.toIso(now), activeMs: 0, distractedMs: 0, pausedMs: 0 };
    this.scopes.set(scope.id, open);
    this.publish(this.scopeContext(open), { ...open.fields, type: open.openType, ts: open.startedIso });
    this.scheduleIdleCheck();
  }

  stopScope(id: string): void {
    const scope = this.scopes.get(id);
    if (!scope) return;
    if (this.focusedStepScopeId === id) this.focusedStepScopeId = null;
    for (const child of [...this.scopes.values()].filter(candidate => candidate.parentScopeId === id)) this.stopScope(child.id);
    const end = this.now();
    this.settle(end);
    this.scopes.delete(id);
    if (scope.closeType) {
      const durationMs = Math.max(0, Math.round(end - scope.startedAt));
      const activeMs = Math.max(0, Math.round(scope.activeMs));
      const distractedMs = Math.max(0, Math.round(scope.distractedMs));
      const pausedMs = Math.max(0, Math.round(scope.pausedMs));
      const candidateEndTs = this.toIso(end);
      const endTs = Date.parse(candidateEndTs) >= Date.parse(scope.startedIso) ? candidateEndTs : scope.startedIso;
      this.publish(this.scopeContext(scope), {
        ...scope.fields,
        type: scope.closeType,
        ts: scope.startedIso,
        endTs,
        durationMs,
        activeMs,
        distractedMs,
        pausedMs,
      });
    }
    if (this.scopes.size === 0) this.cancelIdleCheck();
    else this.scheduleIdleCheck();
  }

  /** Call for pointer, keyboard, touch, input and scroll activity. */
  activity(): void {
    const now = this.now();
    this.settle(now);
    if (this.idle) {
      this.idle = false;
      this.emitState('idle_end', now);
    }
    this.lastActivityAt = now;
    this.scheduleIdleCheck();
  }

  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    const now = this.now();
    this.settle(now);
    this.hidden = hidden;
    this.emitState(hidden ? 'tab_hidden' : 'tab_visible', now);
    if (!hidden) this.resumeFromDistraction(now);
    this.scheduleIdleCheck();
  }

  setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    const now = this.now();
    this.settle(now);
    this.focused = focused;
    this.emitState(focused ? 'window_focus' : 'window_blur', now);
    if (focused) this.resumeFromDistraction(now);
    this.scheduleIdleCheck();
  }

  /** Manual timer pause is tracked separately from active and distracted time. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    const now = this.now();
    this.settle(now);
    this.paused = paused;
    this.emitState(paused ? 'scope_paused' : 'scope_resumed', now);
    if (!paused) {
      if (this.idle) {
        this.idle = false;
        this.emitState('idle_end', now);
      }
      this.lastActivityAt = now;
    }
    this.scheduleIdleCheck();
  }

  /** Attach native browser listeners once at the app root. */
  listen(documentTarget: Document = document, windowTarget: Window = window): () => void {
    if (this.listening) return () => this.stopListening();
    this.documentTarget = documentTarget;
    this.windowTarget = windowTarget;
    this.listening = true;
    const activity = () => this.activity();
    const visibility = () => this.setHidden(documentTarget.visibilityState === 'hidden');
    const blur = () => this.setFocused(false);
    const focus = () => this.setFocused(true);
    const focusStep = (target: EventTarget | null) => {
      const element = target instanceof Element ? target.closest<HTMLElement>('[data-step-id]') : null;
      const stepId = element?.dataset.stepId;
      const parent = [...this.scopes.values()].reverse().find(scope => scope.openType === 'question_open');
      const nextScopeId = stepId && parent ? `step:${parent.id}:${stepId}` : null;
      if (nextScopeId === this.focusedStepScopeId) return;
      if (this.focusedStepScopeId) this.stopScope(this.focusedStepScopeId);
      this.focusedStepScopeId = null;
      if (!stepId || !parent || !nextScopeId) return;
      this.focusedStepScopeId = nextScopeId;
      this.startScope({
        id: nextScopeId,
        openType: 'step_open',
        closeType: 'step_close',
        context: this.scopeContext(parent),
        parentScopeId: parent.id,
        fields: {
          itemId: stepId,
          itemType: 'step_by_step',
          ...(typeof parent.fields?.questionText === 'string' ? { questionText: parent.fields.questionText } : {}),
        },
      });
    };
    const focusIn = (event: FocusEvent) => focusStep(event.target);
    const focusOut = (event: FocusEvent) => focusStep(event.relatedTarget);
    documentTarget.addEventListener('visibilitychange', visibility);
    documentTarget.addEventListener('pointerdown', activity, { passive: true });
    documentTarget.addEventListener('keydown', activity);
    documentTarget.addEventListener('input', activity);
    documentTarget.addEventListener('touchstart', activity, { passive: true });
    documentTarget.addEventListener('wheel', activity, { passive: true });
    documentTarget.addEventListener('focusin', focusIn);
    documentTarget.addEventListener('focusout', focusOut);
    windowTarget.addEventListener('focus', focus);
    windowTarget.addEventListener('blur', blur);
    this.detach = () => {
      documentTarget.removeEventListener('visibilitychange', visibility);
      documentTarget.removeEventListener('pointerdown', activity);
      documentTarget.removeEventListener('keydown', activity);
      documentTarget.removeEventListener('input', activity);
      documentTarget.removeEventListener('touchstart', activity);
      documentTarget.removeEventListener('wheel', activity);
      documentTarget.removeEventListener('focusin', focusIn);
      documentTarget.removeEventListener('focusout', focusOut);
      windowTarget.removeEventListener('focus', focus);
      windowTarget.removeEventListener('blur', blur);
    };
    this.hidden = documentTarget.visibilityState === 'hidden';
    focusStep(documentTarget.activeElement);
    return () => this.stopListening();
  }

  stopListening(): void {
    this.detach?.();
    this.detach = undefined;
    this.documentTarget = undefined;
    this.windowTarget = undefined;
    this.listening = false;
    this.focusedStepScopeId = null;
  }

  stop(): void {
    for (const id of [...this.scopes.keys()]) this.stopScope(id);
    this.stopListening();
    this.cancelIdleCheck();
  }

  private detach: (() => void) | undefined;

  private scopeContext(scope: ActivityScope): LearnEventContext {
    return { ...this.baseContext, ...scope.context };
  }

  private emitState(type: LearnEventType, at: number): void {
    if (!this.scopes.size) return;
    this.publish(this.baseContext, { type, ts: this.toIso(at) });
  }

  private resumeFromDistraction(now: number): void {
    if (this.hidden || !this.focused) return;
    if (this.idle) {
      this.idle = false;
      this.emitState('idle_end', now);
    }
    this.lastActivityAt = now;
  }

  private settle(until: number): void {
    const now = Math.max(this.lastSettledAt, until);
    if (!this.scopes.size) {
      this.lastSettledAt = now;
      return;
    }
    let cursor = this.lastSettledAt;
    if (!this.hidden && this.focused && !this.idle && !this.paused) {
      const idleAt = this.lastActivityAt + this.idleMs;
      if (idleAt <= now) {
        const activeEnd = Math.max(cursor, idleAt);
        this.addTime(activeEnd - cursor, 'active');
        cursor = activeEnd;
        this.idle = true;
        this.emitState('idle_start', idleAt);
      }
    }
    const mode = this.paused ? 'paused' : !this.hidden && this.focused && !this.idle ? 'active' : 'distracted';
    this.addTime(now - cursor, mode);
    this.lastSettledAt = now;
  }

  private addTime(delta: number, mode: 'active' | 'distracted' | 'paused'): void {
    if (delta <= 0) return;
    for (const scope of this.scopes.values()) {
      if (mode === 'active') scope.activeMs += delta;
      else if (mode === 'paused') scope.pausedMs += delta;
      else scope.distractedMs += delta;
    }
  }

  private scheduleIdleCheck(): void {
    this.cancelIdleCheck();
    if (!this.scopes.size || this.idle || this.paused) return;
    const delay = Math.max(0, this.lastActivityAt + this.idleMs - this.now());
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.settle(this.now());
    }, delay);
  }

  private cancelIdleCheck(): void {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}
