import type { Page } from '@playwright/test';

/**
 * Bypass real Google consent only in storage/mirror E2E scenarios.
 * The Worker is mocked by the test; this verifies app persistence and
 * sync behavior, not account authorization or production JWT verification.
 */
export async function seedMockGoogleSession(page: Page): Promise<void> {
 const expiresAt = Date.now() + 3_600_000;
 const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expiresAt / 1000) })).toString('base64url');
 await page.addInitScript(({ token, expiresAt }) => {
  sessionStorage.setItem('math-scratchpad-google-id-token-v1', JSON.stringify({ token, expiresAt }));
 }, { token: `header.${payload}.signature`, expiresAt });

 // Keep the GIS loader deterministic; these scenarios do not click OAuth.
 await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'window.google = { accounts: { oauth2: {}, id: { initialize() {}, renderButton() {}, prompt() {} } } };',
 }));
}
