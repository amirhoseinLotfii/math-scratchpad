import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../src/app/store-provider';
import { initialState, makeStore } from '../../src/store';
import { validateBank, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import type { LessonProgress } from '../../src/features/lessons/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function sampleBank(): DriveBank {
  const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as { lessons: Array<{ concepts: Array<{ blocks: unknown[] }> }> };
  raw.lessons[0].concepts[0].blocks.push({ type: 'example', title: 'Worked example', steps: ['Step one of the book solution'] });
  return validateBank(raw);
}
function wide(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches || !query.includes('1100'), media: query, addEventListener() {}, removeEventListener() {} }));
}
function mount() {
  const bank = sampleBank(), lesson = bank.lessons![0];
  const onProgress = vi.fn<(progress: LessonProgress) => void>();
  render(<Provider store={makeStore(initialState())}><LessonScreen bank={bank} lesson={lesson} onBack={vi.fn()} onProgress={onProgress} onStartPractice={vi.fn()} /></Provider>);
  return { onProgress };
}

describe('lesson split view', () => {
  it('docks the lesson beside a work pane on wide screens with a keyboard-resizable separator', async () => {
    wide(true);
    mount();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const separator = screen.getByRole('separator', { name: 'Resize lesson panel' });
    expect(separator).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '70');
    expect(localStorage.getItem('math-scratchpad:lesson-split-ratio')).toBe('70');
    const pane = screen.getByRole('complementary', { name: 'Your work' });
    expect(pane).toBeInTheDocument();
    const select = screen.getByLabelText('What are you working on?') as HTMLSelectElement;
    expect([...select.options].map(option => option.text)[0]).toContain('Worked example');
    // the step editor is composed into the pane for the selected item
    expect(pane.querySelector('.lesson-math-editor')).not.toBeNull();
  });

  it('links a quick check from the lesson column to the work pane without rendering a second editor', async () => {
    wide(true);
    mount();
    const link = screen.getAllByRole('button').find(button => button.textContent?.includes('SAMPLE-1.1-L01'))!;
    await userEvent.click(link);
    const select = screen.getByLabelText('What are you working on?') as HTMLSelectElement;
    expect(select.value).toBe('q:SAMPLE-1.1-L01');
    expect(document.querySelectorAll('[aria-label="Math answer for SAMPLE-1.1-L01"]').length).toBeLessThanOrEqual(1);
  });

  it('hides the book solution of a worked example until an attempt exists', () => {
    wide(true);
    mount();
    expect(screen.queryByRole('button', { name: 'Compare with the lesson solution' })).not.toBeInTheDocument();
    expect(screen.getByText(/Write at least one step first/)).toBeInTheDocument();
    expect(screen.queryByText('Step one of the book solution', { selector: '.lesson-work-solution li *, .lesson-work-solution li' })).not.toBeInTheDocument();
  });

  it('uses Lesson / Your work tabs on narrow screens, keeping the lesson as the default tab', async () => {
    wide(false);
    mount();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Your work' })).not.toBeInTheDocument();
    await userEvent.click(tabs[1]);
    expect(screen.getByRole('complementary', { name: 'Your work' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Practice for this section/ })).not.toBeInTheDocument();
  });
});
