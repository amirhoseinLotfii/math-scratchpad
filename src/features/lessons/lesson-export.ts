import { stepLatex } from '../../model';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import { getLearnChecks, getPracticeQuestionConceptId, getPracticeQuestionOrigin, getPracticeQuestions } from './selectors';
import type { Concept, Lesson, LessonBlock, LessonPracticeResult, LessonProgress } from './types';

export type LessonExportFormat = 'md' | 'json';
type ExportQuestion = {
  id: string;
  prompt: string;
  source: string;
  mode: BankQuestion['mode'];
  origin?: BankQuestion['origin'];
  tags?: BankQuestion['tags'];
  interactionType?: BankQuestion['interactionType'];
  stage: 'learn' | 'practice';
  status: string;
  studentAnswer?: string;
  studentExplanation?: string;
  workSteps: { latex: string; final: boolean }[];
  attemptedAt?: string;
  updatedAt?: string;
  submittedAt?: string;
  correctness: 'correct' | 'incorrect' | 'unknown';
};
type ConceptActivitySummary = { total: number; attempted: number; correct: number; incorrect: number; correctnessUnknown: number; skipped: number; open: number };
export type LessonExportBundle = {
  schemaVersion: 'math-scratchpad.lesson-export/1.0' | 'math-scratchpad.chapter-export/1.0';
  exportedAt: string;
  bank: { id: string; version: string; chapter?: DriveBank['chapter'] };
  lesson?: Pick<Lesson, 'id' | 'title' | 'book' | 'section' | 'pages'> & { status?: LessonProgress['status']; progress: LessonProgress | null };
  lessons: Array<{
    id: string; title: string; book: string; section: string; pages?: string;
    status?: LessonProgress['status']; progress: LessonProgress | null;
    concepts: Array<{
      id: string; title: string; pages?: string;
      chunks: Array<{ id: string; title: string; pages?: string; content: LessonBlock[]; questions: ExportQuestion[] }>;
      unassignedChecks: ExportQuestion[];
      examples: Array<{ blockIndex: number; prompt: { title?: string; text?: string; latex?: string }; studentWork: { latex: string; final: boolean }[]; attemptedAt?: string; comparedAt?: string; status: 'attempted' | 'not_attempted'; correctness: 'unknown' }>;
      exercises: ExportQuestion[];
      activitySummary: ConceptActivitySummary;
    }>;
    mixedReviews: Array<{ id: string; mode: 'lesson' | 'chapter'; startedAt: string; updatedAt: string; finishedAt?: string; attempted: number; skipped: number; open: number; items: ExportQuestion[] }>;
  }>;
};

function chapterForLesson(bank: DriveBank, lessonId: string | undefined) {
  if (!lessonId) return bank.chapter ?? bank.chapters?.[0];
  return bank.chapters?.find(chapter => chapter.lessonIds.includes(lessonId))
    ?? (bank.chapter?.lessonIds.includes(lessonId) ? bank.chapter : undefined)
    ?? bank.chapter;
}

function safeBlock(block: LessonBlock): LessonBlock {
  if (block.type === 'example') {
    const { steps: _bookSolution, ...promptOnly } = block;
    return promptOnly as LessonBlock;
  }
  return { ...block };
}

function studentSteps(progress: LessonProgress | null | undefined, key: string) {
  return (progress?.workAnswers?.[key]?.steps ?? []).map(step => ({ latex: stepLatex(step), final: step.final }));
}

function questionPrompt(question: BankQuestion) {
  return question.prompt || question.source;
}

function questionExport(question: BankQuestion, progress: LessonProgress | null | undefined, resultOverride?: LessonPracticeResult): ExportQuestion {
  if (question.stage === 'learn') {
    const chunk = progress?.chunkAnswers?.[question.id];
    const previous = progress?.checkAnswers?.[question.id];
    const skippedAt = progress?.skippedChecks.find(item => item.questionId === question.id)?.at;
    const studentAnswer = chunk?.value ?? (previous?.type === 'text' || previous?.type === 'choice' ? previous.value : undefined);
    return {
      id: question.id, prompt: questionPrompt(question), source: question.source, mode: question.mode,
      ...(question.origin ? { origin: question.origin } : {}), ...(question.tags ? { tags: question.tags } : {}), ...(question.interactionType ? { interactionType: question.interactionType } : {}), stage: 'learn',
      status: skippedAt ? 'skipped' : chunk?.submittedAt || progress?.answeredCheckIds.includes(question.id) ? 'submitted' : studentAnswer?.trim() ? 'draft' : 'not_started',
      ...(studentAnswer !== undefined ? { studentAnswer } : {}), workSteps: [],
      ...(chunk?.explanation ? { studentExplanation: chunk.explanation } : previous?.type === 'choice' && previous.explanation ? { studentExplanation: previous.explanation } : {}),
      ...(skippedAt ? { updatedAt: skippedAt } : chunk?.updatedAt ? { updatedAt: chunk.updatedAt } : {}), ...(chunk?.submittedAt ? { submittedAt: chunk.submittedAt } : {}),
      correctness: 'unknown',
    };
  }
  const result = resultOverride ?? progress?.practiceResults?.[question.id];
  return {
    id: question.id, prompt: questionPrompt(question), source: question.source, mode: question.mode,
    ...(question.origin ? { origin: question.origin } : {}), ...(question.tags ? { tags: question.tags } : {}), ...(question.interactionType ? { interactionType: question.interactionType } : {}), stage: 'practice',
    status: result?.status ?? (progress?.completedPracticeQuestionIds?.includes(question.id) ? 'completed_without_snapshot' : 'not_started'),
    ...(result?.answer !== undefined ? { studentAnswer: result.answer } : {}),
    workSteps: result?.steps ?? [], ...(result?.startedAt ? { attemptedAt: result.startedAt } : {}),
    ...(result?.updatedAt ? { updatedAt: result.updatedAt } : {}), ...(result?.submittedAt ? { submittedAt: result.submittedAt } : {}),
    correctness: result?.correctness ?? 'unknown',
  };
}

function conceptActivitySummary(bank: DriveBank, lesson: Lesson, concept: Concept, progress: LessonProgress | null | undefined): ConceptActivitySummary {
  const checkIds = [...new Set(concept.checkQuestionIds)];
  const checkSkipped = checkIds.filter(id => progress?.skippedChecks.some(item => item.questionId === id)).length;
  const checks = checkIds.filter(id => {
    if (progress?.skippedChecks.some(item => item.questionId === id)) return false;
    const answer = progress?.chunkAnswers?.[id];
    const legacy = progress?.checkAnswers?.[id];
    return !!answer?.value.trim() || !!answer?.explanation?.trim() || !!legacy;
  }).length;
  const exampleCount = concept.blocks.reduce((count, block, index) => count + (block.type === 'example' && !!progress?.exampleAttempts?.[`ex:${concept.id}:${index}`]?.attemptedAt ? 1 : 0), 0);
  const exerciseQuestions = getPracticeQuestions(bank, lesson.id).filter(question => question.tags?.concept === concept.id || getPracticeQuestionConceptId(question, lesson.id) === concept.id);
  const attemptedExercises = exerciseQuestions.filter(question => {
    const result = progress?.practiceResults?.[question.id];
    return (!!result && (result.status === 'draft' || result.status === 'answered')) || !!progress?.completedPracticeQuestionIds?.includes(question.id);
  });
  const skippedExercises = exerciseQuestions.filter(question => progress?.practiceResults?.[question.id]?.status === 'skipped').length;
  const attempted = checks + exampleCount + attemptedExercises.length;
  const correct = attemptedExercises.filter(question => {
    const result = progress?.practiceResults?.[question.id];
    return (result?.status === 'draft' || result?.status === 'answered') && result.correctness === 'correct';
  }).length;
  const incorrect = attemptedExercises.filter(question => {
    const result = progress?.practiceResults?.[question.id];
    return (result?.status === 'draft' || result?.status === 'answered') && result.correctness === 'incorrect';
  }).length;
  const total = checkIds.length + concept.blocks.filter(block => block.type === 'example').length + exerciseQuestions.length;
  const skipped = checkSkipped + skippedExercises;
  return { total, attempted, correct, incorrect, correctnessUnknown: Math.max(0, attempted - correct - incorrect), skipped, open: Math.max(0, total - attempted - skipped) };
}

function exportConcept(bank: DriveBank, lesson: Lesson, concept: Concept, progress: LessonProgress | null | undefined) {
  const chunkQuestionIds = new Set((concept.learningChunks ?? []).flatMap(chunk => chunk.questionIds));
  const questionById = new Map(bank.questions.map(question => [question.id, question]));
  const learnChecks = getLearnChecks(bank, concept.id);
  const practiceQuestions = getPracticeQuestions(bank, lesson.id).filter(question => getPracticeQuestionConceptId(question, lesson.id) === concept.id);
  const chunks = (concept.learningChunks ?? []).map(chunk => ({
    id: chunk.id,
    title: chunk.title || concept.title,
    ...(chunk.pages ? { pages: chunk.pages } : {}),
    content: chunk.blockIndexes.map(index => concept.blocks[index]).filter((block): block is LessonBlock => !!block).map(safeBlock),
    questions: chunk.questionIds.map(id => questionById.get(id)).filter((question): question is BankQuestion => !!question).map(question => questionExport(question, progress)),
  }));
  const examples = concept.blocks.flatMap((block, blockIndex) => {
    if (block.type !== 'example') return [];
    const key = `ex:${concept.id}:${blockIndex}`;
    const attempt = progress?.exampleAttempts?.[key];
    return [{
      blockIndex,
      prompt: { ...(block.title ? { title: block.title } : {}), ...(block.text ? { text: block.text } : {}), ...(block.latex ? { latex: block.latex } : {}) },
      studentWork: studentSteps(progress, key),
      ...(attempt?.attemptedAt ? { attemptedAt: attempt.attemptedAt } : {}), ...(attempt?.comparedAt ? { comparedAt: attempt.comparedAt } : {}),
      status: attempt?.attemptedAt ? 'attempted' as const : 'not_attempted' as const,
      correctness: 'unknown' as const,
    }];
  });
  return {
    id: concept.id, title: concept.title, ...(concept.pages ? { pages: concept.pages } : {}), chunks,
    unassignedChecks: learnChecks.filter(question => !chunkQuestionIds.has(question.id)).map(question => questionExport(question, progress)),
    examples,
    exercises: practiceQuestions.map(question => questionExport(question, progress)),
    activitySummary: conceptActivitySummary(bank, lesson, concept, progress),
  };
}

function exportLesson(bank: DriveBank, lesson: Lesson, progress: LessonProgress | null | undefined) {
  const questionById = new Map(bank.questions.map(question => [question.id, question]));
  return {
    id: lesson.id, title: lesson.title, book: lesson.book, section: lesson.section,
    ...(lesson.pages ? { pages: lesson.pages } : {}), ...(progress?.status ? { status: progress.status } : {}),
    progress: progress ?? null,
    concepts: lesson.concepts.map(concept => exportConcept(bank, lesson, concept, progress)),
    mixedReviews: (progress?.mixedReviewRuns ?? []).map(run => {
      const items = run.questionIds.flatMap(id => {
        const question = questionById.get(id);
        return question ? [questionExport(question, null, run.results[id])] : [];
      });
      const attempted = items.filter(item => item.status === 'answered' || (item.status === 'draft' && (!!item.studentAnswer?.trim() || item.workSteps.some(step => step.latex.trim())))).length;
      const skipped = items.filter(item => item.status === 'skipped').length;
      return { id: run.id, mode: run.mode, startedAt: run.startedAt, updatedAt: run.updatedAt, ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}), attempted, skipped, open: Math.max(0, items.length - attempted - skipped), items };
    }),
  };
}

export function buildLessonExportBundle(bank: DriveBank, lesson: Lesson, progress: LessonProgress | null = null, exportedAt = new Date().toISOString()): LessonExportBundle {
  const item = exportLesson(bank, lesson, progress);
  return {
    schemaVersion: 'math-scratchpad.lesson-export/1.0', exportedAt,
    bank: { id: bank.bank_id, version: bank.version, ...(chapterForLesson(bank, lesson.id) ? { chapter: chapterForLesson(bank, lesson.id) } : {}) },
    lesson: { id: lesson.id, title: lesson.title, book: lesson.book, section: lesson.section, ...(lesson.pages ? { pages: lesson.pages } : {}), ...(progress?.status ? { status: progress.status } : {}), progress: progress ?? null },
    lessons: [item],
  };
}

export function buildChapterExportBundle(bank: DriveBank, progressByLesson: Record<string, LessonProgress>, exportedAt = new Date().toISOString(), lessonId?: string): LessonExportBundle {
  const chapter = chapterForLesson(bank, lessonId);
  const lessonIds = chapter?.lessonIds ?? bank.lessons?.map(lesson => lesson.id) ?? [];
  const lessonById = new Map((bank.lessons ?? []).map(lesson => [lesson.id, lesson]));
  const lessons = lessonIds.flatMap(id => {
    const lesson = lessonById.get(id);
    return lesson ? [exportLesson(bank, lesson, progressByLesson[id] ?? null)] : [];
  });
  return {
    schemaVersion: 'math-scratchpad.chapter-export/1.0', exportedAt,
    bank: { id: bank.bank_id, version: bank.version, ...(chapter ? { chapter } : {}) },
    lessons,
  };
}

function markdownBlock(block: LessonBlock): string {
  if (block.type === 'heading') return `### ${block.text}`;
  if (block.type === 'paragraph') return block.text;
  if (block.type === 'definition') return `**تعریف**\n\n${block.text}${block.latex ? `\n\n\\(${block.latex}\\)` : ''}`;
  if (block.type === 'note') return `> ${block.text.replace(/\n/g, '\n> ')}${block.latex ? `\n> \\(${block.latex}\\)` : ''}`;
  if (block.type === 'math') return `${block.text ? `${block.text}\n\n` : ''}\\(${block.latex}\\)`;
  if (block.type === 'image') return `![${block.alt}](${block.src})${block.caption ? `\n\n_${block.caption}_` : ''}`;
  if (block.type === 'image-description') return `> ${block.text}`;
  if (block.type === 'example') return `${block.source === 'extra' || block.title?.includes('مثال آموزشی تکمیلی') ? '⭐ غیرکتابی (هم‌سطح کتاب) · ' : ''}**${block.title || 'مثال'}**${block.text ? `\n\n${block.text}` : ''}${block.latex ? `\n\n\\(${block.latex}\\)` : ''}${block.modeledOn ? `\n\nمدل‌شده از مورد کتاب: \`${block.modeledOn}\`` : ''}\n\n_حل کامل در خروجی قرار نگرفته است._`;
  if (block.type === 'unsupported') return block.source ? `> محتوای پشتیبانی‌نشدهٔ منبع: ${block.source}` : '';
  return '';
}

function markdownQuestion(question: ExportQuestion): string {
  const extraBadge = question.tags?.source === 'extra' ? ' · ⭐ غیرکتابی (هم‌سطح کتاب)' : '';
  const lines = [`### \`${question.id}\` · ${question.stage === 'learn' ? 'پرسش نوشتاری' : 'تمرین کتاب/درس'}${extraBadge}`, question.prompt];
  if (question.source && question.source !== question.prompt) lines.push(`صورت/عبارت: ${question.mode === 'math' ? `\\(${question.source}\\)` : question.source}`);
  if (question.interactionType) lines.push(`نوع پاسخ: ${question.interactionType}`);
  if (question.tags) lines.push(`برچسب‌ها: ${Object.entries(question.tags).map(([key, value]) => `\`${key}=${value}\``).join(' · ')}`);
  lines.push(`وضعیت: ${question.status}`);
  if (question.studentAnswer) lines.push(`پاسخ دانش‌آموز:\n\n> ${question.studentAnswer.replace(/\n/g, '\n> ')}`);
  if (question.studentExplanation) lines.push(`دلیل/توضیح دانش‌آموز:\n\n> ${question.studentExplanation.replace(/\n/g, '\n> ')}`);
  if (question.workSteps.length) lines.push(`مراحل کار:\n\n${question.workSteps.map((step, index) => `${index + 1}. ${step.final ? '**پاسخ نهایی:** ' : ''}\\(${step.latex}\\)`).join('\n')}`);
  lines.push(`زمان تلاش/ذخیره: ${question.attemptedAt ?? question.updatedAt ?? 'ثبت نشده'}`);
  if (question.status !== 'not_started') lines.push(`درستی پاسخ: ${question.correctness === 'unknown' ? 'بدون کلید؛ برای بررسی خروجی را بفرست' : question.correctness}`);
  return lines.join('\n\n');
}

function markdownLesson(lesson: LessonExportBundle['lessons'][number]): string {
  const lines = [`# ${lesson.title}`, `منبع: ${lesson.book} · بخش ${lesson.section}${lesson.pages ? ` · صفحه‌های ${lesson.pages}` : ''}`, `شناسه: \`${lesson.id}\` · وضعیت: ${lesson.status ?? 'شروع نشده'}`];
  for (const concept of lesson.concepts) {
    lines.push(`\n## ${concept.title}`, `شناسه: \`${concept.id}\`${concept.pages ? ` · صفحه‌های ${concept.pages}` : ''}`);
    lines.push(`موارد: ${concept.activitySummary.total} · تلاش‌شده: ${concept.activitySummary.attempted} · ردشده: ${concept.activitySummary.skipped} · درستِ تأییدشده: ${concept.activitySummary.correct} · نادرستِ تأییدشده: ${concept.activitySummary.incorrect} · باز: ${concept.activitySummary.open} · بی‌کلید/نامشخص: ${concept.activitySummary.correctnessUnknown}`);
    for (const chunk of concept.chunks) {
      lines.push(`\n### ${chunk.title}`, `شناسهٔ گام: ${chunk.id}${chunk.pages ? ` · صفحه‌های ${chunk.pages}` : ''}`, ...chunk.content.map(markdownBlock).filter(Boolean));
      lines.push(...chunk.questions.map(markdownQuestion));
    }
    if (concept.examples.length) {
      lines.push('\n### مثال‌ها');
      for (const example of concept.examples) {
        lines.push(`#### ${example.prompt.title || 'مثال'}`, example.prompt.text ?? '', ...(example.prompt.latex ? [`\\(${example.prompt.latex}\\)`] : []), `وضعیت تلاش: ${example.status} · زمان: ${example.attemptedAt ?? 'ثبت نشده'}`);
        if (example.studentWork.length) lines.push(`کار دانش‌آموز:\n\n${example.studentWork.map((step, index) => `${index + 1}. ${step.final ? '**پاسخ نهایی:** ' : ''}\\(${step.latex}\\)`).join('\n')}`);
        lines.push('درستی: بدون کلید خودکار؛ با حل درس‌نامه مقایسه کن.');
      }
    }
    if (concept.unassignedChecks.length) lines.push('\n### پرسش‌های باقی‌ماندهٔ درس‌نامه', ...concept.unassignedChecks.map(markdownQuestion));
    lines.push('\n### تمرین‌های کتاب و تمرین‌های بخش', ...concept.exercises.map(markdownQuestion));
  }
  for (const run of lesson.mixedReviews) {
    lines.push(`\n## ${run.mode === 'chapter' ? 'آزمون ترکیبی فصل' : 'مرور ترکیبی'}`, `شناسهٔ اجرا: ${run.id} · شروع: ${run.startedAt} · پایان: ${run.finishedAt ?? 'در حال اجرا'}`, `تلاش‌شده: ${run.attempted} · ردشده: ${run.skipped} · باز: ${run.open}`);
    lines.push(...run.items.map(markdownQuestion));
  }
  return lines.join('\n\n');
}

export function lessonExportMarkdown(bundle: LessonExportBundle): string {
  const chapter = bundle.bank.chapter;
  const title = bundle.lesson?.title ?? chapter?.title ?? 'خروجی فصل';
  return [
    '<div dir="rtl" lang="fa">',
    `# ${bundle.schemaVersion.includes('chapter') ? 'خروجی کامل فصل' : 'خروجی کامل درس'} · ${title}`,
    `منبع: ${chapter?.source ?? bundle.lessons[0]?.book ?? ''}${chapter?.pdfPages ? ` · صفحه‌های PDF ${chapter.pdfPages}` : ''}`,
    `نسخهٔ بانک: ${bundle.bank.version} · زمان خروجی: ${bundle.exportedAt}`,
    ...bundle.lessons.map(markdownLesson),
    '</div>',
    '',
  ].join('\n\n');
}

export function downloadLessonFile(filename: string, content: string, format: LessonExportFormat): boolean {
  let objectUrl: string | undefined;
  try {
    const mime = format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8';
    objectUrl = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = filename; anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, 1000);
    return true;
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    return false;
  }
}
