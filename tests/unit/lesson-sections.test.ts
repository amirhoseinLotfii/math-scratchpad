import { describe, expect, it } from 'vitest';
import { BANK_SCHEMA, validateBank } from '../../src/features/drive-bank/drive-bank';
import { buildLessonSections } from '../../src/features/lessons/lesson-sections';
import { getPracticeQuestionConceptId, getPracticeQuestionOrigin, getPracticeQuestions, getSectionLearnChecks, getSectionPracticeQuestions } from '../../src/features/lessons/selectors';
import type { Lesson } from '../../src/features/lessons/types';

describe('page-sized lesson sections', () => {
  it('groups source blocks into ordered sections of at most two pages', () => {
    const lesson: Lesson = {
      id: 'L1', book: 'Sample', section: '1.1', title: 'درس', pages: '17-22',
      concepts: [
        { id: 'C1', title: 'مفهوم یک', pages: '17-20', checkQuestionIds: [], blocks: [
          { type: 'paragraph', page: 17, text: 'صفحه ۱۷' },
          { type: 'paragraph', page: 18, text: 'صفحه ۱۸' },
          { type: 'paragraph', page: 19, text: 'صفحه ۱۹' },
          { type: 'paragraph', page: 20, text: 'صفحه ۲۰' },
        ] },
        { id: 'C2', title: 'مفهوم دو', pages: '20-22', checkQuestionIds: [], blocks: [
          { type: 'image', page: 20, src: '/figure.webp', alt: 'نمودار' },
          { type: 'paragraph', page: 21, text: 'صفحه ۲۱' },
          { type: 'paragraph', page: 22, text: 'صفحه ۲۲' },
        ] },
      ],
    };
    const sections = buildLessonSections(lesson);
    expect(sections.map(section => [section.startPage, section.endPage])).toEqual([[17, 18], [19, 20], [21, 22]]);
    expect(sections.map(section => section.concepts.flatMap(entry => entry.blocks.map(block => block.type === 'image' ? block.alt : 'text' in block ? block.text : '')))).toEqual([
      ['صفحه ۱۷', 'صفحه ۱۸'],
      ['صفحه ۱۹', 'صفحه ۲۰', 'نمودار'],
      ['صفحه ۲۱', 'صفحه ۲۲'],
    ]);
  });

  it('keeps legacy lesson blocks intact when they do not contain page metadata', () => {
    const lesson: Lesson = { id: 'L1', book: 'Sample', section: '1.1', title: 'درس', concepts: [
      { id: 'C1', title: 'مفهوم یک', pages: '17-20', checkQuestionIds: [], blocks: [{ type: 'paragraph', text: 'متن یک‌پارچه' }] },
    ] };
    expect(buildLessonSections(lesson)).toHaveLength(1);
    expect(buildLessonSections(lesson)[0].concepts[0].blocks).toEqual(lesson.concepts[0].blocks);
  });

  it('keeps unpaged blocks in a separate section when other blocks have page metadata', () => {
    const lesson: Lesson = { id: 'L1', book: 'Sample', section: '1.1', title: 'درس', pages: '17-20', concepts: [
      { id: 'C1', title: 'مفهوم یک', pages: '17-18', checkQuestionIds: [], blocks: [
        { type: 'paragraph', page: 17, text: 'صفحه ۱۷' },
        { type: 'paragraph', text: 'بدون شمارهٔ صفحه' },
      ] },
      { id: 'C2', title: 'مفهوم دو', pages: '19-20', checkQuestionIds: [], blocks: [
        { type: 'paragraph', page: 19, text: 'صفحه ۱۹' },
      ] },
    ] };
    const sections = buildLessonSections(lesson);
    expect(sections.map(section => [section.startPage, section.endPage])).toEqual([[17, 18], [19, 20], [undefined, undefined]]);
    expect(sections[0].concepts.flatMap(entry => entry.blocks.map(block => 'text' in block ? block.text : ''))).toEqual(['صفحه ۱۷']);
    expect(sections[2].concepts.flatMap(entry => entry.blocks.map(block => 'text' in block ? block.text : ''))).toEqual(['بدون شمارهٔ صفحه']);
  });

  it('uses explicit lesson section metadata and keeps the referenced textbook questions in each page step', () => {
    const raw = {
      schema_version: BANK_SCHEMA,
      bank_id: 'EXPLICIT',
      version: 'v2',
      questions: [
        { id: 'BOOK-1', mode: 'math', source: String.raw`f(x)=\frac{1}{x}`, lessonId: 'L1', conceptId: 'C1', stage: 'practice', origin: 'textbook', sectionId: 'L1-P17-18' },
        { id: 'CHECK-1', mode: 'text', source: 'تابع است؟', lessonId: 'L1', conceptId: 'C1', stage: 'learn', sectionId: 'L1-P17-18' },
        { id: 'EXTRA-1', mode: 'math', source: 'x+1', lessonId: 'L1', conceptId: 'C1', stage: 'practice', origin: 'generated', sectionId: 'L1-P19-20' },
      ],
      lessons: [{
        id: 'L1', book: 'Sample', section: '1.1', title: 'درس', pages: '17-20', concepts: [{
          id: 'C1', title: 'تابع', pages: '17-20', checkQuestionIds: ['CHECK-1'],
          blocks: [17, 18, 19, 20].map(page => ({ type: 'paragraph', page, text: `صفحه ${page}` })),
        }],
        sections: [
          { id: 'L1-P17-18', title: 'بخش نخست', pages: '17-18', conceptIds: ['C1'], learnQuestionIds: ['CHECK-1'], practiceQuestionIds: ['BOOK-1'] },
          { id: 'L1-P19-20', title: 'بخش دوم', pages: '19-20', conceptIds: ['C1'], learnQuestionIds: [], practiceQuestionIds: ['EXTRA-1'] },
        ],
      }],
    };
    const bank = validateBank(raw);
    const lesson = bank.lessons![0], sections = buildLessonSections(lesson);
    expect(sections.map(section => [section.id, section.title, section.concepts.flatMap(entry => entry.blocks.map(block => 'text' in block ? block.text : ''))])).toEqual([
      ['L1-P17-18', 'بخش نخست', ['صفحه 17', 'صفحه 18']],
      ['L1-P19-20', 'بخش دوم', ['صفحه 19', 'صفحه 20']],
    ]);
    expect(getSectionLearnChecks(bank, lesson, sections, 0).map(question => question.id)).toEqual(['CHECK-1']);
    expect(getSectionPracticeQuestions(bank, lesson, sections, 0).map(question => question.id)).toEqual(['BOOK-1']);
    expect(getSectionPracticeQuestions(bank, lesson, sections, 1).map(question => question.id)).toEqual(['EXTRA-1']);
    expect(bank.questions.every(question => question.sectionId)).toBe(true);
  });

  it('routes book exercises and generated practice to their section, keeping book exercises first', () => {
    const question = (id: string, fields: Record<string, unknown> = {}) => ({ id, mode: 'text', source: 'x+1', ...fields });
    const raw = {
      schema_version: BANK_SCHEMA,
      bank_id: 'S002-GUIDED-20261028',
      version: 'v13',
      questions: [
        question('PC-1.1-01', { prompt: 'تمرین تکمیلی', lessonId: 'PC-1.1', conceptId: 'PC-1.1-C02', stage: 'practice' }),
        question('PC-1.1-X01', { prompt: 'تمرین بخش ۱٫۱، سؤال 1', lessonId: 'PC-1.1', stage: 'practice' }),
        question('PC-1.1-X06', { prompt: 'تمرین بخش ۱٫۱، سؤال 6', lessonId: 'PC-1.1', stage: 'practice' }),
        question('PC-1.1-X60', { prompt: 'تمرین بخش ۱٫۱، سؤال 60', lessonId: 'PC-1.1', stage: 'practice' }),
        question('PC-1.1-L01', { prompt: 'بررسی', lessonId: 'PC-1.1', conceptId: 'PC-1.1-C02', stage: 'learn' }),
        question('PC-1.1-L02', { prompt: 'بررسی', lessonId: 'PC-1.1', conceptId: 'PC-1.1-C02', stage: 'learn' }),
      ],
      lessons: [{
        id: 'PC-1.1', book: 'OpenStax Precalculus 2e', section: '1.1', title: 'توابع', pages: '17-20', concepts: [{
          id: 'PC-1.1-C02', title: 'رابطه و تابع', pages: '18-20', checkQuestionIds: ['PC-1.1-L01', 'PC-1.1-L02'],
          blocks: [18, 19, 20].map(page => ({ type: 'paragraph', lang: 'fa', page, text: `متن ${page}` })),
        }],
      }],
    };
    const bank = validateBank(raw);
    const lesson = bank.lessons![0];
    const sections = buildLessonSections(lesson);
    expect(getPracticeQuestionOrigin(bank.questions[1], lesson.id)).toBe('textbook');
    expect(getPracticeQuestionOrigin(bank.questions[0], lesson.id)).toBe('generated');
    expect(getPracticeQuestionConceptId(bank.questions[1], lesson.id)).toBe('PC-1.1-C02');
    expect(getPracticeQuestions(bank, lesson.id).map(item => item.id)).toEqual(['PC-1.1-X01', 'PC-1.1-X06', 'PC-1.1-X60', 'PC-1.1-01']);
    expect(getSectionLearnChecks(bank, lesson, sections, 0).map(item => item.id)).toEqual(['PC-1.1-L01']);
    expect(getSectionLearnChecks(bank, lesson, sections, 1).map(item => item.id)).toEqual(['PC-1.1-L02']);
    expect(getSectionPracticeQuestions(bank, lesson, sections, 0).map(item => item.id)).toEqual(['PC-1.1-X01', 'PC-1.1-X06', 'PC-1.1-01']);
    expect(getSectionPracticeQuestions(bank, lesson, sections, 1).map(item => item.id)).toEqual(['PC-1.1-X60']);
  });
});
