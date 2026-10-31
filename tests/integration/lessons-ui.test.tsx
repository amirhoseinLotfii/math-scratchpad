import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../src/app/store-provider';
import { initialState, makeStore } from '../../src/store';
import { bankDocument, validateBank, type BankQuestion, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { App } from '../../src/App';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import { LessonPicker } from '../../src/features/lessons/lesson-picker';
import { displayEducationalHeading, isMathQuestionSource, LessonBlockView, LessonSourceAttribution, QuestionChoice, QuestionSource } from '../../src/features/lessons/lesson-content';
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

  it('renders a translated figure caption and links the OpenStax source and license', () => {
    render(<>
      <LessonBlockView block={{ type: 'image', lang: 'fa', src: 'https://openstax.org/figure.webp', alt: 'نمودار تابع', caption: 'شکل ۱: نمودار تابع' }} blockKey="figure" revealed={0} onReveal={() => undefined} />
      <LessonSourceAttribution book="OpenStax Precalculus 2e" section="1.1" />
    </>);
    expect(screen.getByRole('img', { name: 'نمودار تابع' })).toHaveAttribute('src', 'https://openstax.org/figure.webp');
    expect(screen.getByText('شکل ۱: نمودار تابع')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('link', { name: /OpenStax/ })).toHaveAttribute('href', 'https://openstax.org/books/precalculus-2e/pages/1-1-functions-and-function-notation');
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
  });

  it('shows the OpenStax attribution on a linked practice question', () => {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as { lessons: Array<{ book: string }>; questions: BankQuestion[] };
    raw.lessons[0].book = 'OpenStax Precalculus 2e';
    const bank = validateBank(raw), question = bank.questions.find(item => item.stage === 'practice')!;
    const version = 'openstax-practice-v1', state = initialState();
    state.doc = bankDocument(bank, version, [question]);
    render(<Provider store={makeStore(state)}><App initialBank={{ bank, version }} /></Provider>);
    expect(screen.getByRole('link', { name: /OpenStax/ })).toBeVisible();
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toBeVisible();
  });

  it('shows an unavailable-image description and a math caption without inventing a picture', () => {
    const { rerender } = render(<LessonBlockView block={{ type: 'image-description', lang: 'fa', text: 'توضیح شکل' }} blockKey="description" revealed={0} onReveal={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Image unavailable.');
    expect(screen.getByText('Show image description')).toBeVisible();
    expect(screen.getByText('توضیح شکل')).not.toBeVisible();
    fireEvent.click(screen.getByText('Show image description'));
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

  it('renders math embedded in text-mode sources while leaving ordinary source prose as text', () => {
    const table = String.raw`\begin{array}{c|ccc}\text{Input}&1&2&2\\\hline \text{Output}&3&5&7\end{array}`;
    const { rerender } = render(<QuestionSource source={table} mode="text" textClassName="source-text" mathClassName="source-math" />);
    expect(screen.getByRole('region', { name: 'Lesson table' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Input' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '7' })).toBeVisible();

    const set = String.raw`\{(-2,3),\ (0,1),\ (1,3),\ (4,-1)\}`;
    rerender(<QuestionSource source={set} mode="text" textClassName="source-text" mathClassName="source-math" />);
    expect(screen.getByRole('math', { name: 'Question expression' })).toHaveTextContent(set);
    expect(isMathQuestionSource(String.raw`f(x) = x^2 - 1 ; f(x) = 3 ; x = ?`, 'text')).toBe(true);
    expect(isMathQuestionSource('<', 'text')).toBe(false);
    expect(isMathQuestionSource('x<2', 'text')).toBe(true);
    expect(isMathQuestionSource(String.raw`x\leq 2`, 'text')).toBe(true);
    const mixed = 'دامنهٔ \\(f(x)=\\sqrt{x+1}\\) را تعیین کن.';
    expect(isMathQuestionSource(mixed, 'text')).toBe(false);
    rerender(<QuestionSource source={mixed} mode="text" textClassName="source-text" mathClassName="source-math" />);
    expect(screen.getByText(/دامنهٔ/)).toBeVisible();
    expect(document.querySelector('.source-text .lesson-inline-math')).toBeInTheDocument();
    expect(isMathQuestionSource('S&P index graph (chapter opener, PDF p17)', 'text')).toBe(false);

    rerender(<QuestionSource source="S&P index graph (chapter opener, PDF p17)" mode="text" textClassName="source-text" mathClassName="source-math" />);
    expect(screen.getByText('S&P index graph (chapter opener, PDF p17)')).toBeVisible();
    expect(screen.queryByRole('math')).not.toBeInTheDocument();
  });

  it('renders formula answer choices as math and leaves ordinary symbols readable', () => {
    const { rerender } = render(<QuestionChoice choice={String.raw`\frac{1}{2}`} index={0} />);
    expect(screen.getByRole('math', { name: 'Mathematical answer choice 1' })).toBeVisible();
    rerender(<QuestionChoice choice="<" index={0} />);
    expect(screen.queryByRole('math')).not.toBeInTheDocument();
    expect(screen.getByText('<')).toBeVisible();
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

  it('splits end-of-lesson practice into saved textbook-first batches of at most 100 questions', async () => {
    const base = sampleBank();
    const lessonId = 'SAMPLE-1.1';
    const bank = validateBank({
      ...base,
      questions: [...base.questions, ...Array.from({ length: 105 }, (_, index) => ({
        id: `SAMPLE-BATCH-${String(index + 1).padStart(3, '0')}`,
        mode: 'text', source: `Extra practice ${index + 1}`, answerType: 'text', stage: 'practice', origin: 'generated', lessonId,
      }))],
    });
    const lesson = bank.lessons!.find(item => item.id === lessonId)!;
    const initialProgress: LessonProgress = {
      lessonId, status: 'done', currentConceptIndex: 1, currentSectionIndex: 1,
      completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: true, revealedSteps: {},
    };
    const onStartPractice = vi.fn();
    const props = { bank, lesson, initialProgress, onBack: vi.fn(), onProgress: vi.fn(), onStartPractice };
    const { unmount } = render(<LessonScreen {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start practice' }));
    const firstBatch = onStartPractice.mock.lastCall![2] as BankQuestion[];
    const firstProgress = onStartPractice.mock.lastCall![1] as LessonProgress;
    expect(firstBatch).toHaveLength(100);
    expect(firstProgress.activePracticeQuestionIds).toEqual(firstBatch.map(question => question.id));
    expect(firstBatch.slice(0, 3).map(question => question.id)).toEqual(['SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03']);

    unmount();
    const completedProgress: LessonProgress = {
      ...firstProgress,
      status: 'learning', summaryOpen: true, activePracticeQuestionIds: undefined,
      completedPracticeQuestionIds: firstBatch.map(question => question.id),
    };
    render(<LessonScreen {...props} initialProgress={completedProgress} />);
    const continueButton = screen.getByRole('button', { name: /Continue end-of-lesson practice/ });
    await userEvent.click(continueButton);
    const nextBatch = onStartPractice.mock.lastCall![2] as BankQuestion[];
    expect(nextBatch.length).toBeGreaterThan(0);
    expect(nextBatch.length).toBeLessThanOrEqual(100);
    expect(nextBatch.every(question => !firstBatch.some(first => first.id === question.id))).toBe(true);
  });

  it('gates concept navigation on an answer, logs a confirmed skip, then summarizes and starts sorted practice', async () => {
    const user = userEvent.setup();
    const { onProgress, onStartPractice } = mount();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-concept-title');
    const next = screen.getByRole('button', { name: 'Next section →' });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Option B' }).closest('label')).toHaveClass('lesson-choice-selected');
    await user.click(screen.getByRole('radio', { name: 'Confidence 1' }));
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByText('Section 2 of 2')).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('id', 'lesson-concept-title');

    await user.click(screen.getByRole('button', { name: 'Skip check' }));
    const dialog = await screen.findByRole('dialog', { name: 'Skip this check?' });
    expect(within(dialog).getByText('This check will be logged as skipped.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Skip check' }));
    expect(onProgress.mock.lastCall?.[0].skippedChecks).toEqual([
      expect.objectContaining({ questionId: 'SAMPLE-1.1-L02', at: expect.any(String) }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Next section →' }));
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
    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    await user.click(screen.getByRole('button', { name: '← Previous section' }));
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
    expect(screen.getByRole('button', { name: 'Next section →' })).toBeEnabled();
  });

  it('reuses the per-Step MathLive editor and opens the app keyboard on request for a math check', () => {
    const { onProgress } = mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Option A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next section →' }));
    const editor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    expect(within(editor).getByLabelText('Step 1 expression')).toBeInTheDocument();
    expect(within(editor).queryByRole('group', { name: 'Numeric keys' })).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole('button', { name: 'Show Keyboard' }));
    expect(within(editor).getByRole('group', { name: 'Numeric keys' })).toBeInTheDocument();
    fireEvent.keyDown(within(editor).getByLabelText('Step 1 expression'), { key: '8' });
    expect(onProgress.mock.lastCall?.[0].answeredCheckIds).toContain('SAMPLE-1.1-L02');
    fireEvent.click(within(editor).getByRole('button', { name: 'Add step' }));
    const finalAnswer = within(editor).getByRole('button', { name: 'Final answer, Step 2' });
    expect(finalAnswer).toHaveTextContent('Final answer');
    fireEvent.click(finalAnswer);
    expect(within(editor).getByRole('button', { name: 'Final answer, Step 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(editor).getByRole('button', { name: 'Hide Keyboard' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(within(editor).getByLabelText('Step 1 expression'), { key: '9' });
    expect(within(editor).getByText('Needs review')).toBeInTheDocument();
  });

  it('supports Ctrl+Alt concept navigation and ignores the shortcut inside an answer editor', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('radio', { name: 'Option A' }));
    act(() => fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true, altKey: true }));
    expect(screen.getByText('Section 2 of 2')).toBeInTheDocument();
    const editor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    act(() => fireEvent.keyDown(editor, { key: 'ArrowLeft', ctrlKey: true, altKey: true }));
    expect(screen.getByText('Section 2 of 2')).toBeInTheDocument();
  });

  it('allows a zero-check concept through and marks a lesson with no practice as done', async () => {
    const bank = sampleBank();
    bank.lessons![0].concepts[0].checkQuestionIds = [];
    bank.questions = bank.questions.filter(question => question.id === 'SAMPLE-1.1-L01');
    bank.lessons![0].concepts = [bank.lessons![0].concepts[0]];
    const { onProgress } = mount(bank);
    expect(screen.getByRole('button', { name: 'Next section →' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next section →' }));
    expect(screen.getByText('No practice questions yet.')).toBeInTheDocument();
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

  it('renders the desktop reference panel in Persian with source pages, equations and figures', async () => {
    const bank = sampleBank();
    const lesson = bank.lessons![0];
    lesson.book = 'OpenStax Precalculus 2e';
    lesson.title = 'تابع‌ها و نمادگذاری تابع';
    lesson.pages = '17-42';
    const concept = lesson.concepts[0];
    concept.title = 'ورودی تابع';
    concept.pages = '18-20';
    concept.blocks = [
      { type: 'paragraph', lang: 'fa', page: 18, text: 'این تابع f(a+b) را نشان می‌دهد.', latex: 'f(a+b)' },
      { type: 'image', lang: 'fa', page: 18, src: 'https://openstax.org/figure.webp', alt: 'نمودار تابع', caption: 'شکل ۱: نمودار تابع' },
      { type: 'paragraph', lang: 'fa', page: 19, text: 'این بخش در صفحهٔ بعد ادامه دارد.' },
    ];
    render(<Provider store={makeStore(initialState())}><LessonReferenceDialog lesson={lesson} bank={bank} onOpenChange={() => undefined} /></Provider>);
    const dialog = screen.getByRole('dialog', { name: lesson.title });
    expect(dialog).toHaveAttribute('lang', 'fa');
    expect(dialog).toHaveAttribute('dir', 'rtl');
    expect(dialog).toHaveTextContent('منبع: OpenStax Precalculus 2e');
    expect(dialog).toHaveTextContent('صفحه‌ها ۱۷–۴۲');
    expect(dialog).toHaveTextContent('مفهوم ۱ از ۲');
    expect(dialog).toHaveTextContent('صفحه‌های ۱۸–۲۰');
    expect(dialog).toHaveTextContent('صفحهٔ ۱۸');
    expect(dialog).not.toHaveTextContent('صفحهٔ ۱۹');
    expect(within(dialog).getByRole('math', { name: 'فرمول درس' })).toBeVisible();
    expect(within(dialog).getByRole('img', { name: 'نمودار تابع' })).toHaveAttribute('src', 'https://openstax.org/figure.webp');
    expect(within(dialog).getByText('شکل ۱: نمودار تابع')).toHaveAttribute('dir', 'rtl');
    expect(within(dialog).getByText('SAMPLE-1.1-L01')).toBeVisible();
    expect(within(dialog).queryByText('SAMPLE-1.1-L02')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'بخش بعدی ←' }));
    expect(dialog).toHaveTextContent('صفحهٔ ۱۹');
    expect(dialog).toHaveTextContent('این بخش در صفحهٔ بعد ادامه دارد.');
    expect(within(dialog).queryByRole('img', { name: 'نمودار تابع' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'بازگشت به سؤال' })).toBeVisible();
    expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);
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
