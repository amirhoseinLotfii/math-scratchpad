export type GoogleAuthFailureCode =
  | 'prompt_unavailable'
  | 'popup_blocked'
  | 'user_cancelled'
  | 'account_mismatch'
  | 'session_rejected'
  | 'network_timeout'
  | 'network_error';

export class GoogleAuthError extends Error {
  constructor(
    readonly code: GoogleAuthFailureCode,
    readonly status?: number,
    message?: string,
  ) {
    super(message ?? googleAuthFailureMessage(code, status));
    this.name = 'GoogleAuthError';
  }
}

export function googleAuthFailureMessage(code: GoogleAuthFailureCode, status?: number): string {
  switch (code) {
    case 'prompt_unavailable': return 'ورود Google در این مرورگر آماده نشد. اتصال اینترنت را بررسی کن، صفحه را دوباره بارگیری کن و از دکمهٔ ورود Google استفاده کن.';
    case 'popup_blocked': return 'مرورگر پنجرهٔ مجوز Drive را مسدود کرد. پنجره‌های بازشو را برای این سایت مجاز کن و دوباره بزن.';
    case 'user_cancelled': return 'درخواست Google لغو شد. برای ادامه دوباره اقدام کن.';
    case 'account_mismatch': return 'حساب Google Drive با حساب واردشده یکی نیست. در هر دو مرحله همان حساب Google را انتخاب کن.';
    case 'session_rejected': return `سرور نشست Google را نپذیرفت${status ? ` (HTTP ${status})` : ''}. اتصال را بررسی کن و دوباره وارد شو.`;
    case 'network_timeout': return 'پاسخ سرور در زمان مجاز نرسید. اتصال اینترنت را بررسی کن و دوباره تلاش کن.';
    case 'network_error': return 'اتصال با Google یا سرور برقرار نشد. اتصال اینترنت را بررسی کن و دوباره تلاش کن.';
  }
}
