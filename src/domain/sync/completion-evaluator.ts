import { ItemProgress, ItemStatus } from '../entities/chapter-progress.types';

export interface ChapterCompletionStats {
  total: number;
  solved: number;
  inProgress: number;
  notStarted: number;
  percent: number;
}

/**
 * An item is considered solved if and only if:
 * 1. item.status === 'solved'
 * 2. item.finalSubmitHlc is present
 */
export function isItemSolved(item: ItemProgress | undefined | null): boolean {
  if (!item) return false;
  return item.status === 'solved' && Boolean(item.finalSubmitHlc);
}

/**
 * Returns the effective visual status for an item in the Picker and UI.
 */
export function getItemDisplayStatus(item: ItemProgress | undefined | null): {
  status: ItemStatus;
  isEditedAfterSubmit: boolean;
  labelFa: string;
  labelEn: string;
} {
  if (!item || item.status === 'not_started') {
    return {
      status: 'not_started',
      isEditedAfterSubmit: false,
      labelFa: 'شروع‌نشده',
      labelEn: 'Not started'
    };
  }

  if (isItemSolved(item)) {
    return {
      status: 'solved',
      isEditedAfterSubmit: Boolean(item.editedAfterSubmit),
      labelFa: item.editedAfterSubmit ? 'حل‌شده (ویرایش‌شده)' : 'حل‌شده',
      labelEn: item.editedAfterSubmit ? 'Solved (edited)' : 'Solved'
    };
  }

  return {
    status: 'in_progress',
    isEditedAfterSubmit: false,
    labelFa: 'در حال حل',
    labelEn: 'In progress'
  };
}

/**
 * Calculates aggregated completion stats for a chapter.
 */
export function evaluateCompletion(
  items: Record<string, ItemProgress> = {},
  requiredItemIds?: string[]
): ChapterCompletionStats {
  const itemIds = requiredItemIds && requiredItemIds.length > 0
    ? requiredItemIds
    : Object.keys(items);

  const total = itemIds.length;
  if (total === 0) {
    return { total: 0, solved: 0, inProgress: 0, notStarted: 0, percent: 100 };
  }

  let solved = 0;
  let inProgress = 0;
  let notStarted = 0;

  for (const id of itemIds) {
    const item = items[id];
    if (isItemSolved(item)) {
      solved++;
    } else if (item && item.status === 'in_progress') {
      inProgress++;
    } else {
      notStarted++;
    }
  }

  const percent = Math.round((solved / total) * 100);

  return {
    total,
    solved,
    inProgress,
    notStarted,
    percent
  };
}
