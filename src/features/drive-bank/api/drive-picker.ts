import type { DriveConfig } from '../../../auth/google';

type PickerCallbackData = { action?: unknown; docs?: Array<{ id?: string; name?: string }> };

/** Opens Google Picker so the user grants this app (drive.file) access to just the chosen file. */
export function pickFile(cfg: DriveConfig, token: string, done: (r: { id?: string; name?: string; error?: string }) => void) {
  const p = window.google?.picker;
  if (!p) { done({ error: 'Google Picker is not ready.' }); return; }
  const view = new p.DocsView(p.ViewId.DOCS).setMimeTypes('application/json,text/plain').setMode(p.DocsViewMode.LIST).setQuery('MATH_QUESTION_BANK.json');
  new p.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId).setOrigin(window.location.origin)
    .setLocale('en').setTitle('Select MATH_QUESTION_BANK.json').setCallback((data: PickerCallbackData) => {
      if (data.action === p.Action.PICKED) { const d = data.docs?.[0]; done(d?.id ? { id: d.id, name: d.name } : { error: 'No file was selected.' }); }
      else if (data.action === p.Action.CANCEL) done({ error: 'File selection was canceled.' });
    }).build().setVisible(true);
}
