import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, Download, X } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { requestStoragePersistence } from '../../storage/storage-persistence-guard';

export interface StorageEvictionBannerProps {
  daysSinceExport: number;
  persisted: boolean;
  uiLang: 'fa' | 'en';
  onExportBackup?: () => void;
}

export function StorageEvictionBanner({
  daysSinceExport,
  persisted,
  uiLang,
  onExportBackup
}: StorageEvictionBannerProps) {
  const fa = uiLang === 'fa';
  const [dismissed, setDismissed] = useState(false);
  const [isProtecting, setIsProtecting] = useState(false);
  const [protectedSuccess, setProtectedSuccess] = useState(persisted);

  if (dismissed || (protectedSuccess && daysSinceExport <= 7)) {
    return null;
  }

  const handleProtect = async () => {
    setIsProtecting(true);
    const success = await requestStoragePersistence();
    setIsProtecting(false);
    if (success) {
      setProtectedSuccess(true);
    }
  };

  return (
    <div
      className="storage-eviction-banner"
      role="alert"
      aria-live="polite"
      dir={fa ? 'rtl' : 'ltr'}
    >
      <div className="banner-content">
        <AlertTriangle className="banner-icon" aria-hidden="true" />
        <div className="banner-text">
          <p className="banner-title font-semibold">
            {fa ? 'توجه: خطر پاک‌شدن داده‌های آفلاین' : 'Notice: Risk of Offline Data Loss'}
          </p>
          <p className="banner-desc text-xs text-muted-foreground">
            {!protectedSuccess
              ? (fa
                  ? 'مرورگر ممکن است در صورت کمبود حافظه، داده‌های ذخیره‌شده را پاک کند.'
                  : 'The browser may clear local offline data if disk space is low.')
              : (fa
                  ? `بیش از ${daysSinceExport} روز از آخرین خروجی پشتیبان می‌گذرد.`
                  : `It has been over ${daysSinceExport} days since your last backup export.`)}
          </p>
        </div>
      </div>

      <div className="banner-actions">
        {!protectedSuccess && (
          <Button
            size="sm"
            variant="outline"
            className="protect-btn"
            disabled={isProtecting}
            onClick={handleProtect}
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            {fa ? 'محافظت از داده‌های آفلاین' : 'Protect Offline Data'}
          </Button>
        )}

        {onExportBackup && (
          <Button
            size="sm"
            variant="outline"
            className="backup-btn"
            onClick={onExportBackup}
          >
            <Download className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            {fa ? 'دریافت نسخه پشتیبان' : 'Export Backup'}
          </Button>
        )}

        <button
          type="button"
          className="dismiss-btn p-1 text-muted-foreground hover:text-foreground"
          aria-label={fa ? 'بستن پیام' : 'Dismiss notice'}
          onClick={() => setDismissed(true)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
