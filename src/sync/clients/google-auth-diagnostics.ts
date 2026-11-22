export type GoogleAuthDiagnostic = { at: string; event: string; detail?: string };

const MAX_ENTRIES = 40;
const entries: GoogleAuthDiagnostic[] = [];
const listeners = new Set<() => void>();

/** Diagnostics are deliberately memory-only and accept only token-free, short labels. */
export function recordGoogleAuthDiagnostic(event: string, detail?: string): void {
  const safeEvent = event.replace(/[^a-z0-9_.-]/gi, '').slice(0, 48);
  const safeDetail = detail?.replace(/[^a-z0-9_.:-]/gi, '').slice(0, 64);
  if (!safeEvent) return;
  entries.push({ at: new Date().toISOString(), event: safeEvent, ...(safeDetail ? { detail: safeDetail } : {}) });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  for (const listener of [...listeners]) listener();
}

export function getGoogleAuthDiagnostics(): GoogleAuthDiagnostic[] {
  return entries.map(entry => ({ ...entry }));
}

export function subscribeGoogleAuthDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
