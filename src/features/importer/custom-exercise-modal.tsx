import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../shared/ui/dialog';
import { Button } from '../../shared/ui/button';
import { BankItem, BankItemSchema } from '../../domain/entities/bank-chapter.types';

export interface CustomExerciseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (item: BankItem) => void;
  uiLang: 'fa' | 'en';
}

export function CustomExerciseModal({
  open,
  onOpenChange,
  onImport,
  uiLang
}: CustomExerciseModalProps) {
  const fa = uiLang === 'fa';
  const [jsonInput, setJsonInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<BankItem | null>(null);

  const handleValidateAndPreview = () => {
    setErrorMsg(null);
    setPreviewItem(null);

    if (!jsonInput.trim()) {
      setErrorMsg(fa ? 'لطفاً کد JSON را وارد کنید.' : 'Please enter JSON code.');
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      const validated = BankItemSchema.parse({
        ...parsed,
        isCustomImport: true
      });
      setPreviewItem(validated);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setErrorMsg(fa ? 'فرمت JSON نامعتبر است.' : 'Invalid JSON format.');
      } else if (err.errors && Array.isArray(err.errors)) {
        const details = err.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        setErrorMsg(fa ? `خطای اعتبارسنجی: ${details}` : `Validation error: ${details}`);
      } else {
        setErrorMsg(err.message || (fa ? 'فرمت JSON نامعتبر است.' : 'Invalid JSON format.'));
      }
    }
  };

  const handleConfirmImport = () => {
    if (!previewItem) return;
    onImport(previewItem);
    onOpenChange(false);
    setJsonInput('');
    setPreviewItem(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="custom-exercise-dialog" dir={fa ? 'rtl' : 'ltr'}>
        <DialogTitle>{fa ? 'وارد کردن تمرین سفارشی' : 'Import Custom Exercise'}</DialogTitle>
        <DialogDescription>
          {fa
            ? 'می‌توانید ساختار یک سؤال یا تمرین را با فرمت JSON وارد کنید تا در «کار من» قرار گیرد.'
            : 'Paste a question or exercise JSON object to solve it in "Your work".'}
        </DialogDescription>

        <div className="custom-import-body my-4">
          <label className="block text-sm font-medium mb-1" htmlFor="custom-json-input">
            {fa ? 'کد JSON تمرین:' : 'Exercise JSON:'}
          </label>
          <textarea
            id="custom-json-input"
            className="w-full h-32 p-2 border rounded font-mono text-xs"
            dir="ltr"
            placeholder={`{\n  "itemId": "custom-1",\n  "orderIndex": 0,\n  "itemType": "math",\n  "requiredForCompletion": true,\n  "prompt": {\n    "segments": [{ "type": "persian_text", "content": "حل معادله" }]\n  }\n}`}
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
          />

          <div className="flex gap-2 mt-2">
            <Button type="button" onClick={handleValidateAndPreview}>
              {fa ? 'بررسی و پیش‌نمایش' : 'Validate & Preview'}
            </Button>
          </div>

          {errorMsg && (
            <div className="text-red-600 text-xs mt-2 p-2 bg-red-50 border border-red-200 rounded">
              {errorMsg}
            </div>
          )}

          {previewItem && (
            <div className="preview-box mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded text-xs">
              <p className="font-semibold text-emerald-800">
                {fa ? '✓ پیش‌نمایش معتبر:' : '✓ Valid preview:'}
              </p>
              <p>
                <strong>{fa ? 'شناسه:' : 'Item ID:'}</strong> {previewItem.itemId}
              </p>
              <p>
                <strong>{fa ? 'نوع:' : 'Type:'}</strong> {previewItem.itemType}
              </p>
              <p>
                <strong>{fa ? 'متن سؤال:' : 'Prompt:'}</strong>{' '}
                {previewItem.prompt.segments.map(s => s.content).join(' ')}
              </p>
              <Button className="mt-2" onClick={handleConfirmImport}>
                {fa ? 'تأیید و افزودن به کار من' : 'Confirm & Add to Work'}
              </Button>
            </div>
          )}
        </div>

        <div className="dialog-actions flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {fa ? 'انصراف' : 'Cancel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
