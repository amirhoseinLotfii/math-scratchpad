import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../src/app/store-provider';
import { initialState, makeStore } from '../../src/store';
import { validateBank, type BankQuestion, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import { LessonPicker } from '../../src/features/lessons/lesson-picker';
import { displayEducationalHeading, LessonBlockView } from '../../src/features/lessons/lesson-content';
import { LessonReferenceDialog } from '../../src/features/lessons/lesson-reference-dialog';
import { MathDisplay } from '../../src/MathDisplay';
import type { LessonProgress } from '../../src/features/lessons/types';

afterEach(cleanup);

function sampleBank(): DriveBank {
  return validateBank(JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as unknown);
}

function mount(bank = sampleBank(), lessonId = 'SAMPLE-1.1', initialProgress?: LessonProgress) {
  const lesson = bank.lessons!.find(item => item.id === lessonId)!;
  const onProgress = vi.fn<(progress: LessonProgress) => void>();
  const onStartPractice = vi.fn();
  const onBack = vi.fn();
  const store = makeStore(initialState());
  render(<Provider store={store}><LessonScreen bank={bank} lesson={lesson} initialProgress={initialProgress} onBack={onBack} onProgress={onProgress} onStartPractice={onStartPractice} /></Provider>);
  return { bank, lesson, onProgress, onStartPractice, onBack, store };
}

describe('lesson learning screen', () => {
  it('provides announced loading and recoverable unavailable states', async () => {
    const onBack = vi.fn();
    const onProgress = vi.fn();
    const onStartPractice = vi.fn();
    const props = { bank: null, lesson: null, onBack, onProgress, onStartPractice };
    const { rerender } = render(<LessonScreen {...props} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading lesson…');
    expect(screen.getByRole('region', { name: 'Loading lesson…' })).toHaveAttribute('aria-busy', 'true');

    rerender(<LessonScreen {...props} />);
    expect(screen.getByRole('heading', { name: 'Lesson unavailable' })).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('You can continue with the questions.');
    await userEvent.click(screen.getByRole('button', { name: 'Back to question' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('explains the empty lesson list when the picker is opened directly', () => {
    render(<LessonPicker open lessons={[]} progressByLesson={{}} onOpenChange={() => undefined} onChoose={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('This bank has no lessons yet');
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  it('offers the image description when a lesson image fails', async () => {
    render(<LessonBlockView block={{ type: 'image', src: '/missing-lesson-image.png', alt: 'Diagram showing a triangle' }} blockKey="broken-image" revealed={0} onReveal={() => undefined} />);
    fireEvent.error(screen.getByRole('img', { name: 'Diagram showing a triangle' }));
    expect(screen.getByRole('status')).toHaveTextContent('Image unavailable.');
    await userEvent.click(screen.getByText('Show image description'));
    expect(screen.getByText('Diagram showing a triangle')).toBeVisible();
  });

  it('shows an unavailable-image description and a math caption without inventing a picture', () => {
    const { rerender } = render(<LessonBlockView block={{ type: 'image-description', lang: 'fa', text: 'توضیح شکل' }} blockKey="description" revealed={0} onReveal={() => undefined} />);
    expect(screen.getByText('Image description')).toBeVisible();
    expect(screen.getByText('توضیح شکل')).toHaveAttribute('dir', 'rtl');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<Provider store={makeStore(initialState())}><LessonBlockView block={{ type: 'math', lang: 'fa', latex: 'x+1', text: 'جدول نمونه' }} blockKey="caption" revealed={0} onReveal={() => undefined} /></Provider>);
    expect(screen.getByText('جدول نمونه')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('math')).toBeVisible();
    rerender(<LessonBlockView block={{ type: 'example', lang: 'fa', text: 'مثال آزمایشی', steps: [] }} blockKey="example" revealed={0} onReveal={() => undefined} />);
    expect(screen.getByText('مثال آزمایشی')).toBeVisible();
    expect(screen.queryByText('Try it yourself first')).not.toBeInTheDocument();
  });

  it('renders lesson arrays as accessible tables and preserves other LaTeX for MathLive', () => {
    const { rerender } = render(<LessonBlockView block={{ type: 'math', latex: String.raw`\begin{array}{|c|c|} \hline Input & Output \\ \hline 1 & 2 \\ \hline \end{array}` }} blockKey="table" revealed={0} onReveal={() => undefined} />);
    expect(screen.getByRole('region', { name: 'Lesson table' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('columnheader', { name: 'Input' })).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('cell', { name: '2' })).toBeVisible();
    const anotherTable = String.raw`\begin{array}{cc} \hline x & y \\ \hline \frac{1}{2} & 3 \end{array}`;
    rerender(<LessonBlockView block={{ type: 'math', latex: anotherTable }} blockKey="another-table" revealed={0} onReveal={() => undefined} />);
    expect(screen.getByRole('cell', { name: '3' })).toBeVisible();
    expect(screen.getByRole('math', { name: 'Mathematical table entry' })).toBeVisible();
    const unsupported = String.raw`\begin{matrix}x & y\end{matrix}`;
    rerender(<LessonBlockView block={{ type: 'math', latex: unsupported }} blockKey="unsupported" revealed={0} onReveal={() => undefined} />);
    expect(screen.getByText(unsupported)).toBeVisible();
    expect(screen.getByRole('math', { name: 'Lesson formula' })).toHaveAttribute('format', 'latex');
    expect(screen.queryByText(/Formula preview unavailable|Unsupported block/)).not.toBeInTheDocument();
  });

  it('renders escaped sets, indexed roots and equation fragments without changing the editor', () => {
    const store = makeStore(initialState());
    const input = String.raw`f(x)=x^2;\quad \text{(a) } \sqrt[3]{x}`;
    const before = structuredClone(store.getState().doc);
    const { rerender } = render(<Provider store={store}><LessonBlockView block={{ type: 'math', latex: input }} blockKey="notation" revealed={0} onReveal={() => undefined} /></Provider>);
    expect(document.querySelector('[role="math"]')).toHaveAttribute('aria-label', 'Lesson formula');
    expect(document.querySelector('math-div')).toHaveTextContent(input);
    expect(document.querySelector('math-div')).toHaveAttribute('dir', 'ltr');
    expect(store.getState().doc).toEqual(before);
    const set = String.raw`\{(\text{odd},1),\ (\text{even},2)\}`;
    rerender(<Provider store={store}><LessonBlockView block={{ type: 'math', latex: set }} blockKey="set" revealed={0} onReveal={() => undefined} /></Provider>);
    expect(document.querySelector('math-div')).toHaveTextContent(set);
    expect(store.getState().doc).toEqual(before);
  });

  it('passes read-only formulas losslessly to the MathLive static renderer', () => {
    const { rerender, container } = render(<Provider store={makeStore(initialState())}><MathDisplay latex={String.raw`7^2\cdot\frac{1}{2}+\sqrt{9}`} label="Formula sample" /></Provider>);
    const math = screen.getByRole('math', { name: 'Formula sample' });
    expect(math.tagName.toLowerCase()).toBe('math-div');
    expect(math).toHaveAttribute('format', 'latex');
    expect(math.textContent).toBe(String.raw`7^2\cdot\frac{1}{2}+\sqrt{9}`);
    expect(container.querySelector('math-field')).toBeNull();
    rerender(<Provider store={makeStore(initialState())}><MathDisplay latex={String.raw`\begin{matrix}x&y\end{matrix}`} /></Provider>);
    expect(screen.getByText(String.raw`\begin{matrix}x&y\end{matrix}`)).toBeVisible();
  });

  it('keeps a completed lesson summary reachable and offers Review lesson', async () => {
    const bank = sampleBank();
    mount(bank, 'SAMPLE-1.1', {
      lessonId: 'SAMPLE-1.1', status: 'done', currentConceptIndex: 1, completedConceptIds: ['SAMPLE-1.1-C1', 'SAMPLE-1.1-C2'],
      answeredCheckIds: ['SAMPLE-1.1-L01', 'SAMPLE-1.1-L02'], skippedChecks: [], summaryOpen: true, revealedSteps: {},
    });
    expect(screen.getByRole('heading', { name: 'Lesson summary' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeVisible();
    const review = screen.getByRole('button', { name: 'Review lesson' });
    await userEvent.click(review);
    expect(screen.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
  });

  it('gates concept navigation on an answer, logs a confirmed skip, then summarizes and starts sorted practice', async () => {
    const user = userEvent.setup();
    const { onProgress, onStartPractice } = mount();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-concept-title');
    const next = screen.getByRole('button', { name: 'Next concept →' });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Option B' }).closest('label')).toHaveClass('lesson-choice-selected');
    await user.click(screen.getByRole('radio', { name: 'Confidence 1' }));
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByText('Concept 2 of 2')).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-concept-title');

    await user.click(screen.getByRole('button', { name: 'Skip check' }));
    const dialog = await screen.findByRole('dialog', { name: 'Skip this check?' });
    expect(within(dialog).getByText('Skip this check? It will be logged.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Skip check' }));
    expect(onProgress.mock.lastCall?.[0].skippedChecks).toEqual([
      expect.objectContaining({ questionId: 'SAMPLE-1.1-L02', at: expect.any(String) }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Next concept →' }));
    expect(screen.getByRole('heading', { name: 'Lesson summary' })).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-summary-title');
    expect(screen.getByRole('region', { name: 'Checks to review' })).toHaveTextContent('SAMPLE-1.1-L01');
    expect(screen.getByRole('region', { name: 'Skipped checks' })).toHaveTextContent('SAMPLE-1.1-L02');
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    expect(onStartPractice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'SAMPLE-1.1' }),
      expect.objectContaining({ status: 'practising', practiceStartedAt: expect.any(String) }),
      expect.arrayContaining([
        expect.objectContaining({ id: 'SAMPLE-1.1-P01' }),
        expect.objectContaining({ id: 'SAMPLE-1.1-P02' }),
        expect.objectContaining({ id: 'SAMPLE-1.1-P03' }),
      ]),
    );
  });

  it('reveals example steps progressively and retains the revealed count across concept navigation', async () => {
    const user = userEvent.setup();
    const bank = sampleBank();
    bank.lessons![0].concepts[0].blocks.push({
      type: 'example', title: 'Sample worked example', text: 'Try this sample expression.', steps: ['First sample teaching step.', 'Second sample teaching step.', 'Third sample teaching step.'],
    });
    const { bank: mountedBank } = mount(bank);
    const reveal = screen.getByRole('button', { name: 'Show next step' });
    expect(screen.queryByText('First sample teaching step.')).not.toBeInTheDocument();
    expect(screen.getByText('Try it yourself first')).toBeInTheDocument();
    await user.click(reveal);
    expect(screen.getByText('First sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 steps shown')).toBeInTheDocument();
    expect(screen.getByText('First sample teaching step.').closest('.lesson-example-step')).toHaveAttribute('aria-current', 'step');
    expect(reveal).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Show next step' }));
    expect(screen.getByText('Second sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('Second sample teaching step.').closest('.lesson-example-step')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByRole('button', { name: 'Show all steps' }));
    expect(screen.getByText('Third sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('All 3 steps shown')).toBeInTheDocument();
    expect(screen.getByText('Third sample teaching step.').closest('.lesson-example-step')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByRole('radio', { name: 'Option A' }));
    await user.click(screen.getByRole('button', { name: 'Next concept →' }));
    await user.click(screen.getByRole('button', { name: '← Previous concept' }));
    expect(screen.getByText('First sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('Second sample teaching step.')).toBeInTheDocument();
    expect(screen.getByText('Third sample teaching step.')).toBeInTheDocument();
    expect(mountedBank.lessons![0].concepts[0].blocks.at(-1)?.type).toBe('example');
  });

  it('uses a text response without rendering math-only instructions or tools', async () => {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as { questions: Array<Record<string, unknown>> };
    raw.questions[0] = { ...raw.questions[0], mode: 'text', answerType: 'text', source: 'Short response prompt' };
    const bank = validateBank(raw);
    const user = userEvent.setup();
    mount(bank);
    expect(screen.getByLabelText('Answer for check SAMPLE-1.1-L01')).toBeInTheDocument();
    expect(screen.queryByText('Write each step')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Numeric keys')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Answer for check SAMPLE-1.1-L01'), 'A temporary practice response');
    expect(screen.getByRole('button', { name: 'Next concept →' })).toBeEnabled();
  });

  it('reuses the per-Step MathLive editor and opens the app keyboard on request for a math check', () => {
    const { onProgress } = mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Option A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next concept →' }));
    const editor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    expect(within(editor).getByLabelText('Step 1 expression')).toBeInTheDocument();
    expect(within(editor).queryByRole('group', { name: 'Numeric keys' })).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole('button', { name: 'Show Keyboard' }));
    expect(within(editor).getByRole('group', { name: 'Numeric keys' })).toBeInTheDocument();
    fireEvent.keyDown(within(editor).getByLabelText('Step 1 expression'), { key: '8' });
    expect(onProgress.mock.lastCall?.[0].answeredCheckIds).toContain('SAMPLE-1.1-L02');
    fireEvent.click(within(editor).getByRole('button', { name: 'Add step' }));
    fireEvent.click(within(editor).getByRole('button', { name: 'Mark Step 2 as final' }));
    expect(within(editor).getByRole('button', { name: 'Mark Step 2 as final' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(editor).getByRole('button', { name: 'Hide Keyboard' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(within(editor).getByLabelText('Step 1 expression'), { key: '9' });
    expect(within(editor).getByText('Needs review')).toBeInTheDocument();
  });

  it('supports Ctrl+Alt concept navigation and ignores the shortcut inside an answer editor', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('radio', { name: 'Option A' }));
    act(() => fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true, altKey: true }));
    expect(screen.getByText('Concept 2 of 2')).toBeInTheDocument();
    const editor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    act(() => fireEvent.keyDown(editor, { key: 'ArrowLeft', ctrlKey: true, altKey: true }));
    expect(screen.getByText('Concept 2 of 2')).toBeInTheDocument();
  });

  it('allows a zero-check concept through and marks a lesson with no practice as done', async () => {
    const bank = sampleBank();
    bank.lessons![0].concepts[0].checkQuestionIds = [];
    bank.questions = bank.questions.filter(question => question.id === 'SAMPLE-1.1-L01');
    bank.lessons![0].concepts = [bank.lessons![0].concepts[0]];
    const { onProgress } = mount(bank);
    expect(screen.getByRole('button', { name: 'Next concept →' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next concept →' }));
    expect(screen.getByText('No practice questions yet')).toBeInTheDocument();
    expect(onProgress.mock.lastCall?.[0]).toMatchObject({ status: 'done', completedConceptIds: ['SAMPLE-1.1-C1'] });
  });

  it('routes a zero-concept lesson directly to its practice set only once', async () => {
    const bank = sampleBank();
    bank.lessons![0].concepts = [];
    const { onStartPractice } = mount(bank);
    await vi.waitFor(() => expect(onStartPractice).toHaveBeenCalledTimes(1));
    expect(onStartPractice.mock.lastCall?.[2].map((question: BankQuestion) => question.id)).toEqual(['SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03']);
  });

  it('requires confirmation and records Skip to practice in lesson progress', async () => {
    const user = userEvent.setup();
    const { onProgress, onStartPractice } = mount();
    await user.click(screen.getByRole('button', { name: 'Skip to practice' }));
    const dialog = screen.getByRole('dialog', { name: 'Skip to practice?' });
    expect(onStartPractice).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onProgress.mock.lastCall?.[0].learnSkipped).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Skip to practice' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Skip to practice?' })).getByRole('button', { name: 'Skip to practice' }));
    expect(onProgress.mock.lastCall?.[0]).toMatchObject({ status: 'practising', learnSkipped: { at: expect.any(String) }, practiceStartedAt: expect.any(String) });
    expect(onStartPractice.mock.lastCall?.[2].map((question: BankQuestion) => question.id)).toEqual(['SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03']);
  });

  it('keeps Persian lesson prose RTL while unknown-direction content remains automatic', () => {
    const { container, rerender } = render(<LessonBlockView block={{ type: 'paragraph', lang: 'fa', text: 'متن آزمایشی' }} blockKey="rtl" revealed={0} onReveal={() => undefined} />);
    expect(container.querySelector('p')).toHaveAttribute('dir', 'rtl');
    expect(container.querySelector('p')).toHaveAttribute('lang', 'fa');
    rerender(<LessonBlockView block={{ type: 'paragraph', text: 'Mixed sample text' }} blockKey="auto" revealed={0} onReveal={() => undefined} />);
    expect(container.querySelector('p')).toHaveAttribute('dir', 'ltr');
  });

  it('sets direction for Persian lesson, concept, picker and example titles', () => {
    const bank = sampleBank();
    const lesson = bank.lessons![0];
    lesson.title = 'تابع‌ها و نمادگذاری';
    lesson.concepts[0].title = 'مفهوم تابع';
    mount(bank);
    expect(screen.getByRole('heading', { name: lesson.title })).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { name: lesson.title })).toHaveAttribute('lang', 'fa');
    expect(screen.getByRole('heading', { name: lesson.concepts[0].title })).toHaveAttribute('dir', 'rtl');
    cleanup();
    render(<LessonPicker open lessons={[lesson]} progressByLesson={{}} onOpenChange={() => undefined} onChoose={() => undefined} />);
    expect(screen.getByText(lesson.title)).toHaveAttribute('dir', 'rtl');
    cleanup();
    render(<Provider store={makeStore(initialState())}><LessonReferenceDialog lesson={lesson} bank={bank} onOpenChange={() => undefined} /></Provider>);
    expect(screen.getByRole('heading', { name: lesson.title })).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { name: lesson.concepts[0].title })).toHaveAttribute('dir', 'rtl');
    cleanup();
    render(<LessonBlockView block={{ type: 'example', lang: 'fa', title: 'مثال 1', steps: [] }} blockKey="example" revealed={0} onReveal={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'مثال 1' })).toHaveAttribute('dir', 'rtl');
  });

  it('keeps complete Latin phrases together inside Persian lesson prose', () => {
    const text = 'در این بخش، (Functions and Function Notation) و (domain and range) آمده است.';
    const { container } = render(<LessonBlockView block={{ type: 'paragraph', lang: 'fa', text }} blockKey="bidi" revealed={0} onReveal={() => undefined} />);
    const paragraph = container.querySelector('p')!;
    expect(paragraph).toHaveAttribute('dir', 'rtl');
    const englishRuns = [...paragraph.querySelectorAll('bdi[lang="en"][dir="ltr"]')];
    expect(englishRuns.map(run => run.textContent)).toEqual(['(Functions and Function Notation)', '(domain and range)']);
    expect(paragraph.textContent).toBe(text);
  });

  it('shows Persian educational headings without redundant English translations but keeps mixed formula text intact', () => {
    expect(displayEducationalHeading('توابع و تابع‌نما (Functions and Function Notation)', 'fa')).toBe('توابع و تابع‌نما');
    expect(displayEducationalHeading('رابطهٔ زوج مرتب (x, y)', 'fa')).toBe('رابطهٔ زوج مرتب (x, y)');
    expect(displayEducationalHeading('Functions and Function Notation', 'en')).toBe('Functions and Function Notation');
  });
});
