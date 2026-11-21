import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  extractSourcesFromText,
  SourcesDisclosure
} from '../../src/features/lessons/sources-disclosure';
import { StyledWorkPicker } from '../../src/features/lessons/styled-work-picker';
import { CustomExerciseModal } from '../../src/features/importer/custom-exercise-modal';
import type { LessonWorkItem } from '../../src/features/lessons/lesson-work-items';

describe('Phase 2 UI Components - AC-P1, AC-P4, AC-I1', () => {
  it('extracts book citations from prompt text cleanly (AC-P4)', () => {
    const rawText = 'معادلهٔ زیر را حل کنید (پیوند با کتاب: ریاضی ۱، صفحهٔ ۴۲، بخش توابع)';
    const { cleanedText, extractedSources } = extractSourcesFromText(rawText);

    expect(cleanedText).toBe('معادلهٔ زیر را حل کنید');
    expect(extractedSources.length).toBe(1);
    expect(extractedSources[0].book).toBe('ریاضی ۱');
    expect(extractedSources[0].page).toBe('۴۲');
    expect(extractedSources[0].section).toBe('توابع');
  });

  it('renders SourcesDisclosure with collapsed details (AC-P4)', () => {
    const { container } = render(
      <SourcesDisclosure
        rawPrompt="سؤال نمونه (پیوند با کتاب: حسابان ۱، صفحهٔ ۱۸)"
        uiLang="fa"
      />
    );

    const details = container.querySelector('details.lesson-sources-disclosure');
    expect(details).toBeDefined();
    expect(screen.getByText('منابع و پیوند با کتاب')).toBeDefined();
    expect(screen.getByText('حسابان ۱')).toBeDefined();
  });

  it('renders StyledWorkPicker with status chips and selection (AC-P1)', () => {
    const dummyItems: LessonWorkItem[] = [
      {
        key: 'item-1',
        kind: 'example',
        title: 'مثال اول: معادله خطی',
        block: { type: 'example', text: 'مثال اول', latex: 'x=1' } as any
      },
      {
        key: 'item-2',
        kind: 'exercise',
        title: 'تمرین دوم',
        question: { id: 'q2', prompt: 'تمرین دوم', source: '2x=4', mode: 'math' } as any,
        workQuestion: { id: 'q2', source: '2x=4', mode: 'math' } as any
      }
    ];

    const onSelect = vi.fn();
    const getStatus = (key: string) => {
      if (key === 'item-1') return { status: 'solved' as const, isEditedAfterSubmit: true };
      return { status: 'not_started' as const };
    };

    render(
      <StyledWorkPicker
        items={dummyItems}
        selectedKey="item-1"
        onSelect={onSelect}
        uiLang="fa"
        getStatus={getStatus}
      />
    );

    // Item 1 is solved (edited)
    expect(screen.getByText('حل‌شده (ویرایش‌شده)')).toBeDefined();
    // Item 2 is not started
    expect(screen.getByText('شروع‌نشده')).toBeDefined();

    // Click item 2
    fireEvent.click(screen.getByText('تمرین دوم'));
    expect(onSelect).toHaveBeenCalledWith('item-2');
  });

  it('validates custom exercise JSON in CustomExerciseModal (AC-I1)', () => {
    const onImport = vi.fn();
    render(
      <CustomExerciseModal
        open={true}
        onOpenChange={vi.fn()}
        onImport={onImport}
        uiLang="fa"
      />
    );

    const textarea = screen.getByLabelText('کد JSON تمرین:');
    const validateBtn = screen.getByText('بررسی و پیش‌نمایش');

    // Invalid JSON
    fireEvent.change(textarea, { target: { value: 'invalid json' } });
    fireEvent.click(validateBtn);
    expect(screen.getByText(/فرمت JSON نامعتبر است/)).toBeDefined();

    // Valid JSON
    const validJson = JSON.stringify({
      itemId: 'custom-q1',
      orderIndex: 0,
      itemType: 'math',
      requiredForCompletion: true,
      prompt: {
        segments: [{ type: 'persian_text', content: 'سؤال جدید' }]
      }
    });

    fireEvent.change(textarea, { target: { value: validJson } });
    fireEvent.click(validateBtn);

    expect(screen.getByText(/پیش‌نمایش معتبر/)).toBeDefined();
    expect(screen.getByText('custom-q1')).toBeDefined();

    // Confirm import
    fireEvent.click(screen.getByText('تأیید و افزودن به کار من'));
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'custom-q1',
        isCustomImport: true
      })
    );
  });
});
