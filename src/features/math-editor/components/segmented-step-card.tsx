import { useCallback, useRef, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { GitBranch, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../../shared/ui/button';
import { stepLatex, type Step } from '../model/model';
import { MathLiveStepInput } from './mathlive-step-input';
import { localizeLessonDigits } from '../../lessons/lesson-content';

export type SegmentedStepCardProps = {
  step: Step;
  stepIndex: number;
  isCurrent: boolean;
  uiLang: 'fa' | 'en';
  onSelectStep: () => void;
  onFocusStep: () => void;
  onUpdateMath: (value: string) => void;
  onUpdateText: (text: string) => void;
  onToggleFinal: () => void;
  onDeleteStep?: () => void;
  onResetStep?: () => void;
  onSplitBranch?: () => void;
  onInsertBetween?: () => void;
  onSingleSlash?: () => void;
  onDoubleSlash?: () => void;
  canDelete?: boolean;
  finalLabel?: string;
  finalAriaLabel?: string;
};

export function hasPmSymbol(latexOrText?: string): boolean {
  if (!latexOrText) return false;
  return /\\pm|\\mp|±|∓/.test(latexOrText);
}

export function SegmentedStepCard({
  step,
  stepIndex,
  isCurrent,
  uiLang,
  onSelectStep,
  onFocusStep,
  onUpdateMath,
  onUpdateText,
  onToggleFinal,
  onDeleteStep,
  onResetStep,
  onSplitBranch,
  onInsertBetween,
  onSingleSlash,
  onDoubleSlash,
  canDelete = true,
  finalLabel,
  finalAriaLabel,
}: SegmentedStepCardProps) {
  const fa = uiLang === 'fa';
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resolvedFinalLabel = finalLabel ?? (fa ? 'پاسخ نهایی' : 'Final');
  const resolvedFinalAriaLabel = finalAriaLabel ?? (fa ? `پاسخ نهایی، گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Mark Step ${stepIndex + 1} as final`);

  const persianSegment = step.segments?.find(s => s.type === 'persian_text');
  const textValue = persianSegment?.content ?? '';
  const currentMath = stepLatex(step);
  const showBranchSplit = hasPmSymbol(currentMath) || hasPmSymbol(step.mathLatex);

  const handleTextChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateText(e.target.value);
  }, [onUpdateText]);

  const handleTextKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter in Persian text segment inserts a newline without triggering newStep (AC-T3)
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Native textarea newlines on Enter; ensure parent handlers do not intercept
        e.stopPropagation();
      } else {
        // Plain enter: prevent submitting or adding steps from inside note
        e.stopPropagation();
      }
    }
  }, []);

  const branchBadge: ReactNode = step.branchSign && step.branchSign !== 'main' ? (
    <span className={`branch-badge branch-sign-${step.branchSign}`} aria-label={fa ? `شاخهٔ ${step.branchSign}` : `Branch ${step.branchSign}`}>
      <GitBranch className="branch-icon" aria-hidden="true" style={{ width: 14, height: 14 }} />
      {step.branchSign === 'plus' ? (fa ? '+ شاخهٔ مثبت' : '+ Plus branch') :
       step.branchSign === 'minus' ? (fa ? '− شاخهٔ منفی' : '− Minus branch') :
       (fa ? 'شاخه' : 'Branch')}
    </span>
  ) : null;

  return (
    <article
      className={`step lesson-answer-step segmented-step-card ${isCurrent ? 'current-step' : ''} ${step.branchSign && step.branchSign !== 'main' ? 'branch-step' : ''}`}
      data-step-id={step.id}
      data-order-key={step.orderKey}
      onClick={onSelectStep}
    >
      <header className="step-header">
        <Button
          variant="ghost"
          className="step-title lesson-step-title"
          onClick={() => {
            onSelectStep();
            onFocusStep();
          }}
        >
          {fa ? 'گام' : 'Step'} {localizeLessonDigits(stepIndex + 1, uiLang)}
        </Button>

        {branchBadge}

        <span className={`step-state ${step.status === 'needs-review' ? 'needs-review' : step.edited ? 'edited' : ''}`}>
          {step.status === 'needs-review' ? (fa ? 'نیازمند بازبینی' : 'Needs review') : step.edited ? (fa ? 'ویرایش‌شده' : '') : ''}
        </span>

        <div className="step-actions">
          {showBranchSplit && onSplitBranch && (
            <Button
              variant="outline"
              size="sm"
              className="branch-split-button"
              title={fa ? 'انشعاب به دو شاخهٔ مثبت و منفی (±)' : 'Split into ± branches'}
              aria-label={fa ? 'انشعاب به دو شاخهٔ مثبت و منفی (±)' : 'Split into ± branches'}
              onClick={(e) => {
                e.stopPropagation();
                onSplitBranch();
              }}
            >
              <GitBranch className="branch-btn-icon" aria-hidden="true" style={{ width: 14, height: 14 }} />
              {fa ? 'انشعاب ±' : 'Split ±'}
            </Button>
          )}

          <Button
            className={`final-marker ${step.final ? 'is-final' : ''}`}
            aria-pressed={step.final}
            aria-label={resolvedFinalAriaLabel}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFinal();
              onFocusStep();
            }}
          >
            {resolvedFinalLabel}{step.final ? ' ✓' : ''}
          </Button>

          {onResetStep && (
            <Button
              size="icon"
              variant="ghost"
              className="step-action-reset"
              aria-label={fa ? `بازنشانی گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Reset Step ${stepIndex + 1}`}
              title={fa ? `بازنشانی گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Reset Step ${stepIndex + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                onResetStep();
              }}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          )}

          {onDeleteStep && (
            <Button
              size="icon"
              variant="ghost"
              className="lesson-step-delete"
              disabled={!canDelete}
              aria-label={fa ? `حذف گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Delete Step ${stepIndex + 1}`}
              title={!canDelete ? (fa ? 'گام نخست قابل حذف نیست' : 'The first step cannot be deleted') : (fa ? `حذف گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Delete Step ${stepIndex + 1}`)}
              onClick={(e) => {
                e.stopPropagation();
                if (canDelete) onDeleteStep();
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>

      {/* Segmented Bilingual Flow: Native Persian text segment + isolated LTR math island */}
      <div className="step-segments-container">
        {/* Native Persian text segment (AC-T1, AC-T2, AC-T3) */}
        <div className="step-text-segment">
          <textarea
            ref={textareaRef}
            className="step-persian-input"
            dir="auto"
            lang={fa ? 'fa' : 'en'}
            rows={1}
            value={textValue}
            placeholder={fa ? 'توضیح یا یادداشت فارسی گام (اختیاری)...' : 'Step notes / explanation (optional)...'}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            onFocus={onSelectStep}
            tabIndex={0}
            aria-label={fa ? `یادداشت فارسی گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Step ${stepIndex + 1} notes`}
            spellCheck={false}
          />
        </div>

        {/* Isolated LTR Math Island (AC-T2, AC-T4, AC-T5) */}
        <div className="step-math-segment">
          <bdi dir="ltr" style={{ unicodeBidi: 'isolate', display: 'block', width: '100%' }}>
            <div className="expression" data-step-id={step.id}>
              <MathLiveStepInput
                stepId={step.id}
                value={currentMath}
                label={fa ? `عبارت ریاضی گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Step ${stepIndex + 1} expression`}
                onInput={onUpdateMath}
                onFocusStep={() => {
                  onSelectStep();
                  onFocusStep();
                }}
                uiLang={uiLang}
                onDoubleSlash={onDoubleSlash}
                onSingleSlash={onSingleSlash}
              />
            </div>
          </bdi>
        </div>
      </div>

      {/* Insert step between control (AC-F3) */}
      {onInsertBetween && (
        <div className="insert-between-wrapper">
          <button
            type="button"
            className="insert-step-between-btn"
            title={fa ? 'درج گام بین این دو گام' : 'Insert step here'}
            aria-label={fa ? `درج گام پس از گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Insert step after step ${stepIndex + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              onInsertBetween();
            }}
          >
            <span className="insert-plus-icon">+</span>
            <span className="insert-label">{fa ? 'درج گام بین این دو گام' : 'Insert step'}</span>
          </button>
        </div>
      )}
    </article>
  );
}
