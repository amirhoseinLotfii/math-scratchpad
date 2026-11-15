import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../../src/app/store-provider';
import { initialState, makeStore } from '../../../src/store';
import { bankDocument, validateBank, type BankQuestion } from '../../../src/features/drive-bank/drive-bank';
import { App } from '../../../src/app/app';
import { LessonScreen } from '../../../src/features/lessons/lesson-screen';
import { LessonPicker } from '../../../src/features/lessons/lesson-picker';
import {
  isMathQuestionSource,
  LessonBlockView,
  LessonSourceAttribution,
  QuestionChoice,
  QuestionSource,
} from '../../../src/features/lessons/lesson-content';
import { MathDisplay } from '../../../src/features/math-editor/components/math-display';
import type { LessonProgress } from '../../../src/features/lessons/types';
import { sampleBank } from '../../helpers/lesson-screen';
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

  it('offers a resume shortcut for an unfinished lesson without changing completed lessons', async () => {
    const lesson = sampleBank().lessons![0];
    const choose = vi.fn();
    const progress: LessonProgress = {
      lessonId: lesson.id,
      status: 'learning',
      currentConceptIndex: 0,
      currentSectionIndex: 0,
      completedConceptIds: [],
      answeredCheckIds: [],
      skippedChecks: [],
      revealedSteps: {},
      learnStartedAt: '2026-11-05T09:00:00.000Z',
    };
    render(
      <LessonPicker
        open
        lessons={[lesson]}
        progressByLesson={{ [lesson.id]: progress }}
        onOpenChange={() => undefined}
        onChoose={choose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Resume unfinished lesson/ }));
    expect(choose).toHaveBeenCalledWith(lesson);
  });

  it('offers the image description when a lesson image fails', async () => {
    render(
      <LessonBlockView
        block={{ type: 'image', src: '/missing-lesson-image.png', alt: 'Diagram showing a triangle' }}
        blockKey="broken-image"
        revealed={0}
        onReveal={() => undefined}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Diagram showing a triangle' }));
    expect(screen.getByRole('status')).toHaveTextContent('Image unavailable.');
    await userEvent.click(screen.getByText('Show image description'));
    expect(screen.getByText('Diagram showing a triangle')).toBeVisible();
  });

  it('renders a translated figure caption and links the OpenStax source and license', () => {
    render(
      <>
        <LessonBlockView
          block={{ type: 'image', lang: 'fa', src: 'https://openstax.org/figure.webp', alt: 'نمودار تابع', caption: 'شکل ۱: نمودار تابع' }}
          blockKey="figure"
          revealed={0}
          onReveal={() => undefined}
        />
        <LessonSourceAttribution book="OpenStax Precalculus 2e" section="1.1" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'نمودار تابع' })).toHaveAttribute('src', 'https://openstax.org/figure.webp');
    expect(screen.getByText('شکل ۱: نمودار تابع')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('link', { name: /OpenStax/ })).toHaveAttribute(
      'href',
      'https://openstax.org/books/precalculus-2e/pages/1-1-functions-and-function-notation',
    );
    expect(screen.getByText(/مثال‌های «آموزشی تکمیلی» برای روشن‌کردن گام‌های کوتاه طراحی شده‌اند/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    );
  });

  it('shows the OpenStax attribution on a linked practice question', () => {
    const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as {
      lessons: Array<{ book: string }>;
      questions: BankQuestion[];
    };
    raw.lessons[0].book = 'OpenStax Precalculus 2e';
    const bank = validateBank(raw),
      question = bank.questions.find((item) => item.stage === 'practice')!;
    const version = 'openstax-practice-v1',
      state = initialState();
    state.doc = bankDocument(bank, version, [question]);
    render(
      <Provider store={makeStore(state)}>
        <App initialBank={{ bank, version }} />
      </Provider>,
    );
    expect(screen.getByRole('link', { name: /OpenStax/ })).toBeVisible();
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toBeVisible();
  });

  it('shows an unavailable-image description and a math caption without inventing a picture', () => {
    const { rerender } = render(
      <LessonBlockView
        block={{ type: 'image-description', lang: 'fa', text: 'توضیح شکل' }}
        blockKey="description"
        revealed={0}
        onReveal={() => undefined}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Image unavailable.');
    expect(screen.getByText('Show image description')).toBeVisible();
    expect(screen.getByText('توضیح شکل')).not.toBeVisible();
    fireEvent.click(screen.getByText('Show image description'));
    expect(screen.getByText('توضیح شکل')).toHaveAttribute('dir', 'rtl');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(
      <Provider store={makeStore(initialState())}>
        <LessonBlockView
          block={{ type: 'math', lang: 'fa', latex: 'x+1', text: 'جدول نمونه' }}
          blockKey="caption"
          revealed={0}
          onReveal={() => undefined}
        />
      </Provider>,
    );
    expect(screen.getByText('جدول نمونه')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('math')).toBeVisible();
    rerender(
      <LessonBlockView
        block={{ type: 'example', lang: 'fa', text: 'مثال آزمایشی', steps: [] }}
        blockKey="example"
        revealed={0}
        onReveal={() => undefined}
      />,
    );
    expect(screen.getByText('مثال آزمایشی')).toBeVisible();
    expect(screen.queryByText('Try it yourself first')).not.toBeInTheDocument();
  });

  it('renders lesson arrays as accessible tables and preserves other LaTeX for MathLive', () => {
    const { rerender } = render(
      <LessonBlockView
        block={{ type: 'math', latex: String.raw`\begin{array}{|c|c|} \hline Input & Output \\ \hline 1 & 2 \\ \hline \end{array}` }}
        blockKey="table"
        revealed={0}
        onReveal={() => undefined}
      />,
    );
    expect(screen.getByRole('region', { name: 'Lesson table' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('columnheader', { name: 'Input' })).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('cell', { name: '2' })).toBeVisible();
    const anotherTable = String.raw`\begin{array}{cc} \hline x & y \\ \hline \frac{1}{2} & 3 \end{array}`;
    rerender(
      <LessonBlockView block={{ type: 'math', latex: anotherTable }} blockKey="another-table" revealed={0} onReveal={() => undefined} />,
    );
    expect(screen.getByRole('cell', { name: '3' })).toBeVisible();
    expect(screen.getByRole('math', { name: 'Mathematical table entry' })).toBeVisible();
    const unsupported = String.raw`\begin{matrix}x & y\end{matrix}`;
    rerender(
      <LessonBlockView block={{ type: 'math', latex: unsupported }} blockKey="unsupported" revealed={0} onReveal={() => undefined} />,
    );
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

    rerender(
      <QuestionSource
        source="S&P index graph (chapter opener, PDF p17)"
        mode="text"
        textClassName="source-text"
        mathClassName="source-math"
      />,
    );
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
    const { rerender } = render(
      <Provider store={store}>
        <LessonBlockView block={{ type: 'math', latex: input }} blockKey="notation" revealed={0} onReveal={() => undefined} />
      </Provider>,
    );
    expect(document.querySelector('[role="math"]')).toHaveAttribute('aria-label', 'Lesson formula');
    expect(document.querySelector('math-div')).toHaveTextContent(input);
    expect(document.querySelector('math-div')).toHaveAttribute('dir', 'ltr');
    expect(store.getState().doc).toEqual(before);
    const set = String.raw`\{(\text{odd},1),\ (\text{even},2)\}`;
    rerender(
      <Provider store={store}>
        <LessonBlockView block={{ type: 'math', latex: set }} blockKey="set" revealed={0} onReveal={() => undefined} />
      </Provider>,
    );
    expect(document.querySelector('math-div')).toHaveTextContent(set);
    expect(store.getState().doc).toEqual(before);
  });

  it('passes read-only formulas losslessly to the MathLive static renderer', () => {
    const { rerender, container } = render(
      <Provider store={makeStore(initialState())}>
        <MathDisplay latex={String.raw`7^2\cdot\frac{1}{2}+\sqrt{9}`} label="Formula sample" />
      </Provider>,
    );
    const math = screen.getByRole('math', { name: 'Formula sample' });
    expect(math.tagName.toLowerCase()).toBe('math-div');
    expect(math).toHaveAttribute('format', 'latex');
    expect(math.textContent).toBe(String.raw`7^2\cdot\frac{1}{2}+\sqrt{9}`);
    expect(container.querySelector('math-field')).toBeNull();
    rerender(
      <Provider store={makeStore(initialState())}>
        <MathDisplay latex={String.raw`\begin{matrix}x&y\end{matrix}`} />
      </Provider>,
    );
    expect(screen.getByText(String.raw`\begin{matrix}x&y\end{matrix}`)).toBeVisible();
  });
});
