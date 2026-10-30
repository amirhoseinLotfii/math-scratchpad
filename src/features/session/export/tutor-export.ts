import { ascii, elapsedAt, isoLocal, validScale, stepLatex, type Document, type Exercise } from '../../../model';
import { APP_VERSION } from '../../../version';
import { questionStatus } from '../../workspace/model/workspace-layout';
import type { LessonExportData } from '../../lessons/lesson-progress-store';

export const TUTOR_EXPORT_SCHEMA = 'math-scratchpad.session/1.0';
export const CONFIDENCE_SCORE = { high: 5, medium: 3, low: 1 } as const;
export type ItemStatus = 'answered' | 'skipped' | 'unanswered';
export type TutorItem = {
  item_id: string; index: number; question_id: number | string | null; assessment: string | null;
  prompt: string | null; problem: string; problem_format: 'math-or-latex' | 'persian-text';
  status: ItemStatus; student_answer: string | null; final_answer: string | null; final_step_id: string | null; final_step_number: number | null;
  steps: { step_id: string; number: number; latex: string; is_final: boolean }[];
  started_at: string | null; submitted_at: string | null; solve_time_sec: number | null;
  confidence: 5 | 3 | 1; confidence_label: 'high' | 'medium' | 'low';
  hint_used: boolean; hint_note: string | null; guidance_available: boolean; guidance_opened: boolean; guidance_opened_at: string | null; independent: boolean;
  stage?: 'learn' | 'practice'; conceptId?: string;
};
export type TutorExport = {
  schema_version: string; app: 'math-scratchpad'; app_version: string; exported_at: string;
  session_id: string; bank_id?: string; bank_version?: string; anxiety: number | null; energy: number | null; started_at: string; ended_at: string | null;
  totals: { items: number; answered: number; skipped: number; unanswered: number; missing_final_answer: number };
  items: TutorItem[];
  lessonProgress?: LessonExportData['lessonProgress'];
  lessonPanelEvents?: LessonExportData['lessonPanelEvents'];
};
const blankStep = (text: string) => text === '\\square' || text.trim() === '';
export function itemStatus(ex: Exercise): ItemStatus {
  if (ex.skipped) return 'skipped';
  return questionStatus(ex) === 'Not started' ? 'unanswered' : 'answered';
}
/** Help = tutor help checkbox OR in-app guidance opened (opening is permanent). */
export const helped = (ex: Exercise) => ex.hintUsed === true || !!ex.guidanceOpenedAt;
export function exportItem(ex: Exercise, index: number): TutorItem {
  const steps = ex.steps.map((s, i) => ({ step_id: s.id, number: i + 1, latex: stepLatex(s), is_final: s.final }));
  const final = steps.find(s => s.is_final) ?? null;
  const confidence = ex.confidence ?? 'high';
  const status = itemStatus(ex);
  return {
    item_id: ex.id, index: index + 1, question_id: ex.bankQuestionId ?? ex.diagnosticId ?? null, assessment: ex.assessment ?? null,
    prompt: ex.prompt ?? null, problem: ex.mode === 'math' ? ascii(ex.source) : ex.source, problem_format: ex.mode === 'text' ? 'persian-text' : 'math-or-latex',
    status,
    student_answer: final && !blankStep(final.latex) ? final.latex : null,
    final_answer: final && !blankStep(final.latex) ? final.latex : null,
    final_step_id: final?.step_id ?? null, final_step_number: final?.number ?? null,
    steps: status === 'unanswered' ? [] : steps.filter(s => !blankStep(s.latex) || s.is_final),
    started_at: ex.startedAt ?? null, submitted_at: ex.submittedAt ?? null,
    solve_time_sec: Number.isFinite(ex.elapsedMs) || Number.isFinite(ex.timerRunningSince) ? Math.round(elapsedAt(ex) / 1000) : null,
    confidence: CONFIDENCE_SCORE[confidence], confidence_label: confidence,
    hint_used: helped(ex), hint_note: ex.hintNote ?? null, guidance_available: !!ex.guidance, guidance_opened: !!ex.guidanceOpenedAt, guidance_opened_at: ex.guidanceOpenedAt ?? null, independent: !helped(ex),
    ...(ex.stage ? { stage: ex.stage } : {}), ...(ex.conceptId ? { conceptId: ex.conceptId } : {}),
  };
}
/** Items with work (not skipped) that have no marked final answer. */
export function missingFinalAnswers(doc: Document) {
  return doc.exercises.map((ex, i) => ({ ex, i })).filter(({ ex }) => itemStatus(ex) === 'answered' && !exportItem(ex, 0).final_answer).map(({ i }) => i + 1);
}
export function buildTutorExport(doc: Document, now = new Date(), lessonData?: LessonExportData): TutorExport {
  const items = doc.exercises.map(exportItem);
  const meta = doc.session;
  const count = (s: ItemStatus) => items.filter(x => x.status === s).length;
  return {
    schema_version: TUTOR_EXPORT_SCHEMA, app: 'math-scratchpad', app_version: APP_VERSION, exported_at: isoLocal(now),
    session_id: meta?.id ?? 'unknown', ...(meta?.bankId ? { bank_id: meta.bankId } : {}), ...(meta?.bankVersion ? { bank_version: meta.bankVersion } : {}), anxiety: validScale(meta?.anxiety) ?? null, energy: validScale(meta?.energy) ?? null,
    started_at: meta?.startedAt ?? items.map(x => x.started_at).filter(Boolean).sort()[0] ?? isoLocal(now), ended_at: meta?.endedAt ?? null,
    totals: { items: items.length, answered: count('answered'), skipped: count('skipped'), unanswered: count('unanswered'), missing_final_answer: missingFinalAnswers(doc).length },
    items,
    ...(lessonData ? { lessonProgress: lessonData.lessonProgress, lessonPanelEvents: lessonData.lessonPanelEvents } : {}),
  };
}
export function downloadText(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
  } catch { return false; }
}
