import { assertNetworkAllowed } from '../shared/lib/mode-gate';

export interface GoogleCodeClientConfig {
  clientId: string;
  scope?: string;
  onCodeReceived: (code: string) => Promise<void>;
  onError?: (err: unknown) => void;
}

interface GisOauth2Client {
  initCodeClient: (options: {
    client_id: string;
    scope: string;
    ux_mode: 'popup' | 'redirect';
    callback: (response: { code?: string; error?: string }) => void;
    error_callback?: (err: unknown) => void;
  }) => { requestCode: () => void };
}

function getGisOauth2(): GisOauth2Client | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { google?: { accounts?: { oauth2?: GisOauth2Client } } }).google
    ?.accounts?.oauth2;
}

/**
 * Google Identity Services (GIS) Code Flow Client - §2 & §4.1
 * Uses initCodeClient in 'popup' mode to securely obtain an auth code.
 */
export class GoogleCodeClient {
  private client: { requestCode: () => void } | null = null;

  constructor(private config: GoogleCodeClientConfig) {}

  /**
   * Initializes the GIS code client.
   * Checks Mode Gate first to guarantee zero network activity in offline mode.
   */
  init(): boolean {
    assertNetworkAllowed('google-accounts-oauth2');

    const oauth2 = getGisOauth2();
    if (!oauth2?.initCodeClient) {
      return false;
    }

    this.client = oauth2.initCodeClient({
      client_id: this.config.clientId,
      scope: this.config.scope || 'https://www.googleapis.com/auth/drive.file',
      ux_mode: 'popup',
      callback: (response: { code?: string; error?: string }) => {
        if (response.code) {
          this.config.onCodeReceived(response.code).catch(err => {
            this.config.onError?.(err);
          });
        } else if (response.error) {
          this.config.onError?.(new Error(`OAuth error: ${response.error}`));
        }
      },
      error_callback: (err: unknown) => {
        this.config.onError?.(err);
      }
    });

    return true;
  }

  /**
   * Triggers the OAuth popup for user consent.
   * Must be called in response to an explicit user gesture (click).
   */
  requestCode(): void {
    assertNetworkAllowed('google-accounts-request-code');

    if (!this.client) {
      const initialized = this.init();
      if (!initialized) {
        throw new Error('Google Identity Services (GIS) SDK not loaded yet.');
      }
    }

    this.client?.requestCode();
  }
}
