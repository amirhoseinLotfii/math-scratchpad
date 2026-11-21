import { ChapterProgress, ItemProgress, StepRecord } from '../entities/chapter-progress.types';
import { compareHlc } from './hlc';

/**
 * Field-level Last-Write-Wins (LWW) 3-way/2-way merge based on HLC timestamps.
 * Commutative: merge(A, B) === merge(B, A)
 * Associative: merge(merge(A, B), C) === merge(A, merge(B, C))
 * Idempotent: merge(A, A) === A
 */
export function mergeChapterProgress(
  local: ChapterProgress,
  remote: ChapterProgress
): ChapterProgress {
  if (local === remote) return local;

  const hlcComparison = compareHlc(local.updatedHlc, remote.updatedHlc);
  const updatedHlc = hlcComparison >= 0 ? local.updatedHlc : remote.updatedHlc;

  // Merge items
  const allItemIds = Array.from(
    new Set([...Object.keys(local.items || {}), ...Object.keys(remote.items || {})])
  ).sort();

  const mergedItems: Record<string, ItemProgress> = {};
  for (const itemId of allItemIds) {
    const localItem = local.items?.[itemId];
    const remoteItem = remote.items?.[itemId];

    if (localItem && !remoteItem) {
      mergedItems[itemId] = { ...localItem };
    } else if (!localItem && remoteItem) {
      mergedItems[itemId] = { ...remoteItem };
    } else if (localItem && remoteItem) {
      mergedItems[itemId] = mergeItemProgress(localItem, remoteItem);
    }
  }

  // Merge resumeState based on top-level HLC winner
  const resumeState = hlcComparison >= 0 ? local.resumeState : remote.resumeState;

  // Merge orphanedItems
  const orphanedItems = {
    ...(local.orphanedItems || {}),
    ...(remote.orphanedItems || {})
  };

  return {
    schemaVersion: local.schemaVersion || remote.schemaVersion || '1.0.0',
    kind: 'chapter_progress',
    chapterId: local.chapterId || remote.chapterId,
    bankVersion: local.bankVersion || remote.bankVersion,
    updatedHlc,
    items: mergedItems,
    resumeState,
    orphanedItems: Object.keys(orphanedItems).length > 0 ? orphanedItems : undefined
  };
}

export function mergeItemProgress(
  local: ItemProgress,
  remote: ItemProgress
): ItemProgress {
  const statusCmp = compareHlc(local.statusHlc, remote.statusHlc);
  const statusWinner = statusCmp >= 0 ? local : remote;
  const statusHlc = statusCmp >= 0 ? local.statusHlc : remote.statusHlc;

  // Steps merge by stepId
  const allStepIds = Array.from(
    new Set([...Object.keys(local.steps || {}), ...Object.keys(remote.steps || {})])
  ).sort();

  const mergedSteps: Record<string, StepRecord> = {};
  for (const stepId of allStepIds) {
    const lStep = local.steps?.[stepId];
    const rStep = remote.steps?.[stepId];

    if (lStep && !rStep) {
      mergedSteps[stepId] = { ...lStep };
    } else if (!lStep && rStep) {
      mergedSteps[stepId] = { ...rStep };
    } else if (lStep && rStep) {
      const stepCmp = compareHlc(lStep.updatedHlc, rStep.updatedHlc);
      mergedSteps[stepId] = stepCmp >= 0 ? { ...lStep } : { ...rStep };
    }
  }

  // Final submit merge
  const localSubmitHlc = local.finalSubmitHlc || '0000000000000:0000:none';
  const remoteSubmitHlc = remote.finalSubmitHlc || '0000000000000:0000:none';
  const submitCmp = compareHlc(localSubmitHlc, remoteSubmitHlc);
  const submitWinner = submitCmp >= 0 ? local : remote;

  return {
    status: statusWinner.status,
    statusHlc,
    attemptCount: Math.max(local.attemptCount || 0, remote.attemptCount || 0),
    steps: mergedSteps,
    finalAnswer: submitWinner.finalAnswer,
    finalSubmittedAt: submitWinner.finalSubmittedAt,
    finalSubmitHlc: submitWinner.finalSubmitHlc,
    editedAfterSubmit: Boolean(local.editedAfterSubmit || remote.editedAfterSubmit)
  };
}
