/** User-facing message for a failed Drive call. */
export function driveError(status: number, action: string): Error {
  if (status === 401) return Error('Google authorization expired. Reconnect to continue.');
  if (status === 403) return Error(`${action}: Google denied access (403). Choose the bank file again or check the Drive API configuration.`);
  if (status === 404) return Error(`${action}: the file was not found or was not granted to this app (404). Choose it again.`);
  if (status === 429 || status >= 500) return Error(`${action}: Google is temporarily unavailable (${status}). The app will retry later.`);
  return Error(`${action} failed (${status}).`);
}
