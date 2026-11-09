import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../src/app/store-provider';
import { initialState, makeStore } from '../../src/store';
import { validateBank, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { LessonScreen, type LessonRestoreTarget } from '../../src/features/lessons/lesson-screen';
import { buildLessonSections } from '../../src/features/lessons/lesson-sections';
import { ContinueLearningButton } from '../../src/features/progress/reading-position-context';
import { sectionAnchorId } from '../../src/features/progress/reading-position-anchors';
import type { LessonProgress } from '../../src/features/lessons/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

function sampleBank(): DriveBank {
  const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as { lessons: Array<{ concepts: Array<{ blocks: unknown[] }> }> };
  raw.lessons[0].concepts[0].blocks.push({ type: 'example', title: 'Worked example', steps: ['Step one of the book solution'] });
  return validateBank(raw);
}

/** Split view matching; the sample bank has no page tags, so each concept is its own section. */
function wide(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches || !query.includes('1100'), media: query, addEventListener() {}, removeEventListener() {} }));
}

function mount(options: { restore?: LessonRestoreTarget } = {}) {
  const bank = sampleBank(), lesson = bank.lessons![0];
  const onProgress = vi.fn<(progress: LessonProgress) => void>();
  render(<Provider store={makeStore(initialState())}><LessonScreen bank={bank} lesson={lesson} restore={options.restore} onBack={vi.fn()} onProgress={onProgress} onStartPractice={vi.fn()} /></Provider>);
  return { bank, lesson, onProgress };
}

function sectionLabelText() {
  return document.querySelector('.lesson-section-label')?.textContent ?? '';
}

describe('lesson continuation and pane accessibility', () => {
  it('keeps a single tab stop and moves between lesson tabs with arrow keys', async () => {
    wide(false);
    mount();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getAllByRole('tab')[1]).toHaveFocus());
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(screen.getAllByRole('tab')[1], { key: 'Home' });
    await waitFor(() => expect(screen.getAllByRole('tab')[0]).toHaveFocus());
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('resizes the lesson pane with buttons instead of a drag', () => {
    wide(true);
    mount();
    const separator = screen.getByRole('separator', { name: 'Resize lesson panel' });
    expect(separator).toHaveAttribute('aria-valuenow', '50');

    fireEvent.click(screen.getByRole('button', { name: 'Wider lesson panel' }));
    expect(separator).toHaveAttribute('aria-valuenow', '55');
    fireEvent.click(screen.getByRole('button', { name: 'Narrower lesson panel' }));
    expect(separator).toHaveAttribute('aria-valuenow', '50');

    for (let step = 0; step < 6; step += 1) fireEvent.click(screen.getByRole('button', { name: 'Wider lesson panel' }));
    expect(separator).toHaveAttribute('aria-valuenow', '70');
    expect(screen.getByRole('button', { name: 'Wider lesson panel' })).toBeDisabled();
  });

  it('opens the requested section and scrolls to its anchor without focusing an editor', async () => {
    wide(true);
    const bank = sampleBank(), lesson = bank.lessons![0];
    const sections = buildLessonSections(lesson);
    expect(sections.length).toBeGreaterThan(1);
    const target = sections[sections.length - 1];
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as typeof Element.prototype.scrollIntoView;

    mount({ restore: { sectionId: target.id, contentAnchorId: sectionAnchorId(target.id) } });

    expect(sectionLabelText()).toBe(`Section ${sections.length} of ${sections.length}`);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(document.activeElement?.tagName).not.toBe('MATH-FIELD');
  });

  it('offers the saved lesson and resumes it on activation', async () => {
    const onResume = vi.fn();
    render(<ContinueLearningButton title="Equivalent fractions" meta={['Chapter 2', 'Section 3 of 6']} onResume={onResume} />);

    expect(screen.getByRole('heading', { name: 'Equivalent fractions' })).toBeInTheDocument();
    expect(screen.getByText('Section 3 of 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume lesson' }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
