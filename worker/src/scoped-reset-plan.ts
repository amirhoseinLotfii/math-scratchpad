import type { LearnEvent } from '../../src/sync/events';

/**
 * A scoped reset must be unambiguous across bank versions and across chapters
 * that may reuse a lesson id. These are intentionally stricter than the UI's
 * loose { type, id } descriptor.
 */
export type ScopedLearningResetScope =
  | { type: 'chapter'; id: string; bankVersion: string }
  | { type: 'lesson'; id: string; chapter: number; bankVersion: string };

export type ScopedResetEventDisposition = 'preserve' | 'remove' | 'rebuild';

/** No mutations are performed by this module. */
export function parseScopedLearningResetScope(input: unknown): ScopedLearningResetScope | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const candidate = input as Record<string, unknown>;
  const bankVersion = candidate.bankVersion;
  if (typeof bankVersion !== 'string' || bankVersion.trim() !== bankVersion
    || bankVersion.length < 1 || bankVersion.length > 50) return undefined;

  if (candidate.type === 'chapter') {
    if (Object.keys(candidate).some(key => !['type', 'id', 'bankVersion'].includes(key))) return undefined;
    const id = candidate.id;
    if (typeof id !== 'string' || !/^(?:0|[1-9][0-9]?)$/.test(id)) return undefined;
    return { type: 'chapter', id, bankVersion };
  }
  if (candidate.type === 'lesson') {
    if (Object.keys(candidate).some(key => !['type', 'id', 'chapter', 'bankVersion'].includes(key))) return undefined;
    const { id, chapter } = candidate;
    if (typeof id !== 'string' || id.trim() !== id || id.length < 1 || id.length > 100
      || !Number.isInteger(chapter) || Number(chapter) < 0 || Number(chapter) > 99) return undefined;
    return { type: 'lesson', id, chapter: Number(chapter), bankVersion };
  }
  return undefined;
}

/**
 * Classification is only an input to a future transactional reset planner,
 * NOT permission to immediately delete the returned 'remove' events.
 *
 * A chapter snapshot, legacy migration payload or shared session event cannot
 * be safely filtered like an ordinary lesson-level event. A planner must parse
 * their aggregate contents and replay the surviving events before committing.
 */
export function classifyScopedLearningEvent(
  event: Pick<LearnEvent, 'bankVersion' | 'chapter' | 'lesson' | 'type'>,
  scope: ScopedLearningResetScope,
): ScopedResetEventDisposition {
  if (event.bankVersion !== scope.bankVersion) return 'preserve';
  const targetChapter = scope.type === 'chapter' ? Number(scope.id) : scope.chapter;
  if (event.chapter !== targetChapter) return 'preserve';

  if (event.type === 'legacy_state_migration') return 'rebuild';
  if (scope.type === 'lesson' && event.type === 'chapter_snapshot') return 'rebuild';
  if (scope.type === 'lesson' && event.lesson !== scope.id) return 'preserve';

  if (event.type === 'session_start' || event.type === 'session_end'
    || event.type === 'session_reset' || event.type === 'report_generated') return 'rebuild';
  return 'remove';
}
