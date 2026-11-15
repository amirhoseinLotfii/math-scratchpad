import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../../src/app/store-provider';
import { initialState, makeStore } from '../../../src/store';
import { LessonPicker } from '../../../src/features/lessons/lesson-picker';
import { displayEducationalHeading, LessonBlockView } from '../../../src/features/lessons/lesson-content';
import { LessonReferenceDialog } from '../../../src/features/lessons/lesson-reference-dialog';
import { sampleBank, mount } from '../../helpers/lesson-screen';
describe('lesson rtl', () => {
  it('keeps Persian lesson prose RTL while unknown-direction content remains automatic', () => {
    const { container, rerender } = render(
      <LessonBlockView
        block={{ type: 'paragraph', lang: 'fa', text: 'متن آزمایشی' }}
        blockKey="rtl"
        revealed={0}
        onReveal={() => undefined}
      />,
    );
    expect(container.querySelector('p')).toHaveAttribute('dir', 'rtl');
    expect(container.querySelector('p')).toHaveAttribute('lang', 'fa');
    rerender(
      <LessonBlockView block={{ type: 'paragraph', text: 'Mixed sample text' }} blockKey="auto" revealed={0} onReveal={() => undefined} />,
    );
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
    render(
      <Provider store={makeStore(initialState())}>
        <LessonReferenceDialog lesson={lesson} bank={bank} onOpenChange={() => undefined} />
      </Provider>,
    );
    expect(screen.getByRole('heading', { name: lesson.title })).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { name: lesson.concepts[0].title })).toHaveAttribute('dir', 'rtl');
    cleanup();
    render(
      <LessonBlockView
        block={{ type: 'example', lang: 'fa', title: 'مثال 1', steps: [] }}
        blockKey="example"
        revealed={0}
        onReveal={() => undefined}
      />,
    );
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
    render(
      <Provider store={makeStore(initialState())}>
        <LessonReferenceDialog lesson={lesson} bank={bank} onOpenChange={() => undefined} />
      </Provider>,
    );
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
    const { container } = render(
      <LessonBlockView block={{ type: 'paragraph', lang: 'fa', text }} blockKey="bidi" revealed={0} onReveal={() => undefined} />,
    );
    const paragraph = container.querySelector('p')!;
    expect(paragraph).toHaveAttribute('dir', 'rtl');
    const englishRuns = [...paragraph.querySelectorAll('bdi[lang="en"][dir="ltr"]')];
    expect(englishRuns.map((run) => run.textContent)).toEqual(['(Functions and Function Notation)', '(domain and range)']);
    expect(paragraph.textContent).toBe(text);
  });

  it('shows Persian educational headings without redundant English translations but keeps mixed formula text intact', () => {
    expect(displayEducationalHeading('توابع و تابع‌نما (Functions and Function Notation)', 'fa')).toBe('توابع و تابع‌نما');
    expect(displayEducationalHeading('رابطهٔ زوج مرتب (x, y)', 'fa')).toBe('رابطهٔ زوج مرتب (x, y)');
    expect(displayEducationalHeading('Functions and Function Notation', 'en')).toBe('Functions and Function Notation');
  });
});
