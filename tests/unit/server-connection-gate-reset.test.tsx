import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ServerConnectionGate } from '../../src/sync/server-connection-gate';

const gateMocks = vi.hoisted(() => ({ resetPending: true, resetStatusVerified: true, ensureWorkerSession: vi.fn(async () => undefined), googleButtonCalls: 0 }));

vi.mock('../../src/sync/browser-db', () => ({
  getAuthenticatedServerStorage: () => undefined,
  isLocalLearningResetPending: () => gateMocks.resetPending,
  readQuarantineCount: async () => 0,
}));
vi.mock('../../src/sync/learning-reset-epoch', () => ({
  isServerResetStatusVerified: () => gateMocks.resetStatusVerified,
  LOCAL_RESET_STATE_CHANGED_EVENT: 'math-scratchpad:local-reset-state-changed',
}));
vi.mock('../../src/sync/worker-session', () => ({
  ensureWorkerSession: gateMocks.ensureWorkerSession,
}));
vi.mock('../../src/sync/google-login-button', () => ({ GoogleLoginButton: () => { gateMocks.googleButtonCalls += 1; return null; } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  gateMocks.resetPending = true;
  gateMocks.resetStatusVerified = true;
  gateMocks.googleButtonCalls = 0;
});

describe('server connection gate during reset', () => {
  it('keeps local editing available and avoids Google sign-in while reset is pending', async () => {
    const { container } = render(
      <ServerConnectionGate tokenProvider={() => undefined} onAuthenticated={vi.fn()} flushPendingDraft={async () => {}}>
        <button type="button">Save an answer</button>
      </ServerConnectionGate>,
    );

    const editor = container.querySelector('[data-server-editor]');
    expect(editor?.hasAttribute('inert')).toBe(false);
    await screen.findByText(/حالت محلی فعال است/);
    expect(screen.getByLabelText('وضعیت همگام‌سازی').textContent).toContain('پاسخ‌ها روی همین دستگاه ذخیره می‌شوند');
    expect(screen.getByRole('button', { name: 'Save an answer' })).toBeDefined();
    expect(gateMocks.ensureWorkerSession).not.toHaveBeenCalled();
    expect(gateMocks.googleButtonCalls).toBe(0);
  });

  it('keeps local editing available and avoids auth before the first reset-status response', async () => {
    gateMocks.resetPending = false;
    gateMocks.resetStatusVerified = false;
    const { container } = render(
      <ServerConnectionGate tokenProvider={() => undefined} onAuthenticated={vi.fn()} flushPendingDraft={async () => {}}>
        <button type="button">Save an answer</button>
      </ServerConnectionGate>,
    );

    const editor = container.querySelector('[data-server-editor]');
    expect(editor?.getAttribute('data-connection-state')).toBe('local');
    await screen.findByText(/حالت محلی فعال است/);
    expect(screen.getByRole('button', { name: 'Save an answer' })).toBeDefined();
    expect(gateMocks.ensureWorkerSession).not.toHaveBeenCalled();
    expect(gateMocks.googleButtonCalls).toBe(0);
  });
});
