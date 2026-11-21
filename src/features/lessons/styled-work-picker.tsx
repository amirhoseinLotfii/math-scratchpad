import React from 'react';
import { CheckCircle2, Clock, CircleDot, AlertCircle } from 'lucide-react';
import type { LessonWorkItem, LessonWorkKind } from './lesson-work-items';
import { localizeLessonDigits } from './lesson-content';
import { ItemStatus } from '../../domain/entities/chapter-progress.types';

export interface StyledWorkPickerProps {
  items: LessonWorkItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  uiLang: 'fa' | 'en';
  getStatus: (key: string) => { status: ItemStatus; isEditedAfterSubmit?: boolean };
}

const KIND_LABEL: Record<LessonWorkKind, { fa: string; en: string }> = {
  example: { fa: 'مثال', en: 'Example' },
  guided: { fa: 'هدایت‌شده', en: 'Guided' },
  check: { fa: 'تمرین کوتاه', en: 'Quick check' },
  exercise: { fa: 'تمرین', en: 'Exercise' }
};

export function StyledWorkPicker({
  items,
  selectedKey,
  onSelect,
  uiLang,
  getStatus
}: StyledWorkPickerProps) {
  const fa = uiLang === 'fa';

  return (
    <div className="styled-work-picker" role="radiogroup" aria-label={fa ? 'انتخاب مورد کار' : 'Select work item'}>
      <div className="styled-work-picker-track">
        {items.map((item, index) => {
          const isSelected = item.key === selectedKey;
          const { status, isEditedAfterSubmit } = getStatus(item.key);

          let statusIcon = <CircleDot className="status-icon not-started" aria-hidden="true" />;
          let statusText = fa ? 'شروع‌نشده' : 'Not started';
          let chipClass = 'status-chip not-started';

          if (status === 'solved') {
            statusIcon = <CheckCircle2 className="status-icon solved" aria-hidden="true" />;
            statusText = isEditedAfterSubmit
              ? (fa ? 'حل‌شده (ویرایش‌شده)' : 'Solved (edited)')
              : (fa ? 'حل‌شده' : 'Solved');
            chipClass = isEditedAfterSubmit ? 'status-chip solved-edited' : 'status-chip solved';
          } else if (status === 'in_progress') {
            statusIcon = <Clock className="status-icon in-progress" aria-hidden="true" />;
            statusText = fa ? 'در حال حل' : 'In progress';
            chipClass = 'status-chip in-progress';
          }

          const kindName = KIND_LABEL[item.kind][uiLang];
          const itemNum = localizeLessonDigits(index + 1, uiLang);

          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`styled-picker-item ${isSelected ? 'selected' : ''}`}
              onClick={() => {
                onSelect(item.key);
                // Also trigger scroll to corresponding question in lesson pane per AC-P2
                const targetId =
                  item.kind === 'check' || item.kind === 'exercise' ? item.question.id : item.key;
                const targetEl = document.getElementById(`lesson-question-${targetId}`);
                if (targetEl) {
                  targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
              }}
            >
              <div className="picker-item-header">
                <span className="picker-item-num">{itemNum}</span>
                <span className={`picker-kind-badge kind-${item.kind}`}>{kindName}</span>
              </div>
              <div className="picker-item-title" title={item.title}>
                {item.title.replace(/\s+/g, ' ').slice(0, 45)}
              </div>
              <div className={chipClass} title={statusText}>
                {statusIcon}
                <span className="chip-text">{statusText}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
