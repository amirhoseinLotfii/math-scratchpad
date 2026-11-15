import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider } from '../../src/app/store-provider';
import { DriveBankPanel } from '../../src/features/drive-bank/drive-bank-panel';
import { initialState, makeStore } from '../../src/store';
import userEvent from '@testing-library/user-event';
export function mockGoogle(email = 'me@example.com') {
  const picker = {
    ViewId: { DOCS: 'd' },
    DocsViewMode: { LIST: 'l' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' },
    DocsView: class {
      setMimeTypes() {
        return this;
      }
      setMode() {
        return this;
      }
      setQuery() {
        return this;
      }
    },
    PickerBuilder: class {
      cb: (d: unknown) => void = () => undefined;
      addView() {
        return this;
      }
      setOAuthToken() {
        return this;
      }
      setDeveloperKey() {
        return this;
      }
      setAppId() {
        return this;
      }
      setOrigin() {
        return this;
      }
      setLocale() {
        return this;
      }
      setTitle() {
        return this;
      }
      setCallback(cb: (d: unknown) => void) {
        this.cb = cb;
        return this;
      }
      build() {
        return { setVisible: () => this.cb({ action: 'picked', docs: [{ id: 'private-file-123', name: 'MATH_QUESTION_BANK.json' }] }) };
      }
    },
  };
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, email }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  let idCallback: ((response: { credential?: string }) => void) | undefined;
  const identity = {
    initialize: (options: { callback: (response: { credential?: string }) => void }) => {
      idCallback = options.callback;
    },
    prompt: () => idCallback?.({ credential: `header.${payload}.signature` }),
    renderButton: (element: HTMLElement) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Sign in with Google';
      button.setAttribute('aria-label', 'Sign in with Google');
      button.addEventListener('click', () => idCallback?.({ credential: `header.${payload}.signature` }));
      element.replaceChildren(button);
    },
  };
  window.gapi = {};
  window.google = {
    picker,
    accounts: {
      id: identity,
      oauth2: {
        hasGrantedAllScopes: () => true,
        initTokenClient: (c: { callback: (r: unknown) => void }) => ({
          requestAccessToken: () => c.callback({ access_token: 'tok', expires_in: 3600 }),
        }),
      },
    },
  };
  return email;
}
export function mockDrive(state: { content: string; rev: number; status?: number; email?: string; mime?: string }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/session'))
      return Response.json({ sessionToken: `mss1.${'T'.repeat(43)}`, expiresAt: Date.now() + 7 * 24 * 60 * 60_000 }, { status: 201 });
    if (url.includes('userinfo')) return new Response(JSON.stringify({ email: state.email ?? 'me@example.com', email_verified: true }));
    if (state.status) return new Response('', { status: state.status });
    if (url.includes('alt=media')) return new Response(state.content);
    return new Response(
      JSON.stringify({
        id: 'private-file-123',
        name: 'b.json',
        mimeType: state.mime ?? 'application/json',
        md5Checksum: `m${state.rev}`,
        headRevisionId: `r${state.rev}`,
      }),
    );
  });
}
export function panel() {
  const store = makeStore(initialState());
  const onAvailable = vi.fn(),
    onBankReady = vi.fn();
  const view = render(
    <Provider store={store}>
      <DriveBankPanel open close={() => undefined} onAvailable={onAvailable} onBankReady={onBankReady} />
    </Provider>,
  );
  return { store, onAvailable, onBankReady, view, user: userEvent.setup() };
}
export const media = (f: ReturnType<typeof mockDrive>) => f.mock.calls.filter((c) => String(c[0]).includes('alt=media')).length;
export async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
  await screen.findByText('نشست Google در سرور تأیید شد.');
  await user.click(await screen.findByRole('button', { name: 'Grant Google Drive access' }));
}
