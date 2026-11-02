import { expect, test } from '../support/test';

const bankText = JSON.stringify({
  schema_version: 'math-scratchpad.bank/1.0',
  bank_id: 'qa-confirmation',
  version: 'v1',
  questions: [{ id: 'Q01', mode: 'math', source: '1+2' }],
});

test('batch and saved-session replacement use accessible in-app confirmations', { tag: '@only-mobile-390' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  // Isolated test identity: no account, token, or real Drive is used.
  await page.addInitScript(() => {
    const hash = '5722e9ceb3077a549643b3e349b6b44058f422818edfddec115e9703a07fc024';
    const digest = new Uint8Array(hash.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    Object.defineProperty(crypto.subtle, 'digest', { configurable: true, value: async () => digest.slice().buffer });
    class DocsView {
      constructor(_viewId: unknown) {}
      setMimeTypes() { return this; }
      setMode() { return this; }
      setQuery() { return this; }
    }
    class PickerBuilder {
      callback: (data: unknown) => void = () => undefined;
      addView() { return this; }
      setOAuthToken() { return this; }
      setDeveloperKey() { return this; }
      setAppId() { return this; }
      setOrigin() { return this; }
      setLocale() { return this; }
      setTitle() { return this; }
      setCallback(callback: (data: unknown) => void) { this.callback = callback; return this; }
      build() { return { setVisible: () => this.callback({ action: 'picked', docs: [{ id: 'qa-file-id-12345', name: 'QA-bank.json' }] }) }; }
    }
    const google = {
      accounts: { oauth2: {
        hasGrantedAllScopes: () => true,
        initTokenClient: (config: { callback: (token: unknown) => void }) => ({ requestAccessToken: () => config.callback({ access_token: 'isolated-test-token', expires_in: 3600 }) }),
      } },
      picker: { ViewId: { DOCS: 'docs' }, DocsViewMode: { LIST: 'list' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, DocsView, PickerBuilder },
    };
    Object.assign(window, { google, gapi: {} });
  });
  await page.route('https://www.googleapis.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/userinfo')) return route.fulfill({ json: { email: 'qa-fixture@example.test', email_verified: true } });
    if (url.includes('alt=media')) return route.fulfill({ status: 200, contentType: 'application/json', body: bankText });
    return route.fulfill({ json: { id: 'qa-file-id-12345', name: 'QA-bank.json', mimeType: 'application/json', md5Checksum: 'qa-md5', headRevisionId: 'qa-r1', version: '1', size: String(bankText.length) } });
  });

  const nativeDialogs: string[] = [];
  page.on('dialog', async dialog => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: /Google Drive/ }).click();
  await page.getByRole('button', { name: 'Connect Google Drive' }).click();
  const drive = page.getByRole('region', { name: 'Google Drive question bank' });
  const openBatch = drive.getByRole('button', { name: 'Open received batch' });
  await expect(openBatch).toBeVisible();

  await openBatch.click();
  const batchConfirm = page.getByRole('dialog', { name: 'Open a new question batch?' });
  await expect(batchConfirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await batchConfirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(openBatch).toBeFocused();
  expect(nativeDialogs).toEqual([]);

  await openBatch.click();
  await page.getByRole('dialog', { name: 'Open a new question batch?' }).getByRole('button', { name: 'Open batch' }).click();
  const wellbeing = page.getByRole('dialog', { name: 'Before you start this batch' });
  if (await wellbeing.isVisible().catch(() => false)) await wellbeing.getByRole('button', { name: 'Skip for now' }).click();
  await expect(drive.getByText(/Saved sessions \(1\)/)).toBeVisible();
  await drive.getByText(/Saved sessions \(1\)/).click();
  const resume = drive.getByRole('button', { name: 'Resume' });
  await resume.click();
  const restoreConfirm = page.getByRole('dialog', { name: 'Restore this saved session?' });
  await restoreConfirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(resume).toBeFocused();
  await resume.click();
  await page.getByRole('dialog', { name: 'Restore this saved session?' }).getByRole('button', { name: 'Restore session' }).click();
  await expect(drive.getByRole('status')).toContainText('The saved session was restored.');
  expect(nativeDialogs).toEqual([]);
});
