import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ServerConnectionGate } from '../../src/sync/server-connection-gate';

const gateMocks = vi.hoisted(() => ({ resetPending: true }));

vi.mock('../../src/sync/browser-db', () => ({
  getAuthenticatedServerStorage: () => undefined,
  isLocalLearningResetPending: () => gateMocks.resetPending,
}));
vi.mock('../../src/sync/worker-session', () => ({
  ensureWorkerSession: async () => undefined,
}));
vi.mock('../../src/sync/google-login-button', () => ({ GoogleLoginButton: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  gateMocks.resetPending = true;
});

describe('server connection gate during reset', () => {
  it('locks the learning editor while local reset is pending', async () => {
    const { container } = render(
      <ServerConnectionGate tokenProvider={() => undefined} onAuthenticated={vi.fn()} flushPendingDraft={async () => {}}>
        <button type="button">Save an answer</button>
      </ServerConnectionGate>,
    );

    const editor = container.querySelector('[data-server-editor]');
    expect(editor?.hasAttribute('inert')).toBe(true);
    await screen.findByText(/برای همگام‌سازی امن با سرور، از دکمهٔ Google وارد شو/);
    expect(screen.getByLabelText('وضعیت همگام‌سازی').textContent).toContain('پاسخ‌دادن در این مرورگر قفل است');
    expect(screen.getByRole('button', { name: 'Save an answer' })).toBeDefined();
  });
});
