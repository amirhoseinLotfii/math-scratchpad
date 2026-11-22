import type { DriveConfig } from '../auth/google';

type PickerCallbackData = { action?: unknown; docs?: Array<{ id?: string; name?: string }> };

/** Lets the owner select a private Drive folder for one-time learning-data backups. */
export function pickBackupFolder(cfg: DriveConfig, token: string, done: (r: { id?: string; name?: string; error?: string }) => void) {
  const p = window.google?.picker;
  if (!p) { done({ error: 'Google Picker is not ready.' }); return; }
  const view = new p.DocsView(p.ViewId.FOLDERS).setSelectFolderEnabled(true).setMode(p.DocsViewMode.LIST);
  new p.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId).setOrigin(window.location.origin)
    .setLocale('fa').setTitle('پوشهٔ خصوصی پشتیبان را انتخاب کن').setCallback((data: PickerCallbackData) => {
      if (data.action === p.Action.PICKED) { const d = data.docs?.[0]; done(d?.id ? { id: d.id, name: d.name } : { error: 'No folder was selected.' }); }
      else if (data.action === p.Action.CANCEL) done({ error: 'Folder selection was canceled.' });
    }).build().setVisible(true);
}
