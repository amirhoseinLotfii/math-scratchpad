import React from 'react';
import { Check, CloudOff, RefreshCw, AlertCircle, HardDrive } from 'lucide-react';

export type SaveStatusState =
  | 'saved_locally'
  | 'saved_to_drive'
  | 'queued_offline'
  | 'syncing'
  | 'error';

export interface SaveStatusPillProps {
  status: SaveStatusState;
  uiLang: 'fa' | 'en';
  errorMessage?: string;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<
  SaveStatusState,
  {
    fa: string;
    en: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  saved_locally: {
    fa: 'ذخیره در حافظه دستگاه',
    en: 'Saved locally',
    icon: HardDrive,
    className: 'status-saved-local'
  },
  saved_to_drive: {
    fa: 'ذخیره در گوگل درایو',
    en: 'Saved to Drive',
    icon: Check,
    className: 'status-saved-drive'
  },
  queued_offline: {
    fa: 'در صف ذخیره (آفلاین)',
    en: 'Queued (Offline)',
    icon: CloudOff,
    className: 'status-queued'
  },
  syncing: {
    fa: 'در حال ذخیره…',
    en: 'Syncing…',
    icon: RefreshCw,
    className: 'status-syncing'
  },
  error: {
    fa: 'خطا در ذخیره‌سازی',
    en: 'Save error',
    icon: AlertCircle,
    className: 'status-error'
  }
};

export function SaveStatusPill({
  status,
  uiLang,
  errorMessage,
  onClick
}: SaveStatusPillProps) {
  const fa = uiLang === 'fa';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.saved_locally;
  const Icon = config.icon;
  const label = fa ? config.fa : config.en;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`save-status-pill ${config.className}`}
      title={errorMessage || label}
      onClick={onClick}
    >
      <Icon className={`pill-icon ${status === 'syncing' ? 'animate-spin' : ''}`} />
      <span className="pill-label">{label}</span>
    </div>
  );
}
