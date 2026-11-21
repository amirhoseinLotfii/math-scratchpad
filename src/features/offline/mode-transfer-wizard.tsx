import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../shared/ui/dialog';
import { Button } from '../../shared/ui/button';
import { StorageMode, setStorageMode } from '../../sync/mode-gate';
import { ArrowLeftRight, CloudUpload, Download, CheckCircle2 } from 'lucide-react';

export type TransferStrategy = 'move_local_to_drive' | 'overwrite_local_from_drive' | 'switch_only';

export interface ModeTransferWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetMode: StorageMode;
  uiLang: 'fa' | 'en';
  onExecuteTransfer: (strategy: TransferStrategy) => Promise<void>;
}

export function ModeTransferWizard({
  open,
  onOpenChange,
  targetMode,
  uiLang,
  onExecuteTransfer
}: ModeTransferWizardProps) {
  const fa = uiLang === 'fa';
  const [selectedStrategy, setSelectedStrategy] = useState<TransferStrategy>('move_local_to_drive');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onExecuteTransfer(selectedStrategy);
      await setStorageMode(targetMode);
      onOpenChange(false);
    } catch (err) {
      console.error('[ModeTransferWizard] Transfer failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mode-transfer-dialog" dir={fa ? 'rtl' : 'ltr'}>
        <DialogTitle className="flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-primary" />
          {fa ? 'تغییر حالت ذخیره‌سازی' : 'Change Storage Mode'}
        </DialogTitle>
        <DialogDescription>
          {fa
            ? `در حال تغییر وضعیت به «${targetMode === 'online' ? 'آنلاین (Google Drive)' : 'آفلاین (حافظه دستگاه)'}» هستید. نحوه انتقال داده‌های خود را انتخاب کنید:`
            : `Switching to ${targetMode === 'online' ? 'Online (Google Drive)' : 'Offline (Local device)'}. Select your data transfer preference:`}
        </DialogDescription>

        <div className="transfer-options grid gap-3 my-4">
          <label
            className={`transfer-option flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
              selectedStrategy === 'move_local_to_drive' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="transfer-strategy"
              value="move_local_to_drive"
              checked={selectedStrategy === 'move_local_to_drive'}
              onChange={() => setSelectedStrategy('move_local_to_drive')}
              className="mt-1"
            />
            <div className="option-text">
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <CloudUpload className="w-4 h-4 text-emerald-600" />
                {fa ? '۱. انتقال و همگام‌سازی داده‌های محلی به درایو' : '1. Move & sync local data to Drive'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fa
                  ? 'تمام تمرین‌ها و مراحل حل‌شده محلی در صف همگام‌سازی با درایو قرار می‌گیرند.'
                  : 'All local chapters, progress, and history are queued to sync with Drive.'}
              </p>
            </div>
          </label>

          <label
            className={`transfer-option flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
              selectedStrategy === 'overwrite_local_from_drive' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="transfer-strategy"
              value="overwrite_local_from_drive"
              checked={selectedStrategy === 'overwrite_local_from_drive'}
              onChange={() => setSelectedStrategy('overwrite_local_from_drive')}
              className="mt-1"
            />
            <div className="option-text">
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <Download className="w-4 h-4 text-amber-600" />
                {fa ? '۲. بازیابی از درایو (با تهیه پشتیبان خودکار محلی)' : '2. Overwrite from Drive (with auto-backup)'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fa
                  ? 'ابتدا یک فایل پشتیبان کامل از داده‌های فعلی دانلود می‌شود، سپس داده‌های درایو بارگذاری می‌گردند.'
                  : 'A backup of local data is automatically downloaded first, then Drive data is loaded.'}
              </p>
            </div>
          </label>

          <label
            className={`transfer-option flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
              selectedStrategy === 'switch_only' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="transfer-strategy"
              value="switch_only"
              checked={selectedStrategy === 'switch_only'}
              onChange={() => setSelectedStrategy('switch_only')}
              className="mt-1"
            />
            <div className="option-text">
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                {fa ? '۳. فقط تغییر حالت بدون انتقال داده' : '3. Switch mode only without copying'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fa
                  ? 'حالت بدون جابجایی یا کپی کردن داده‌ها تغییر می‌یابد.'
                  : 'Switches the mode immediately without modifying existing datasets.'}
              </p>
            </div>
          </label>
        </div>

        <div className="dialog-actions flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            {fa ? 'انصراف' : 'Cancel'}
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? (fa ? 'در حال اعمال…' : 'Applying…') : fa ? 'تأیید و تغییر حالت' : 'Confirm & Switch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
