import { vi } from 'vitest';
/**
 * Most legacy suites start batches and drive the editor directly. The once-per-batch
 * anxiety/energy prompt is a modal, so it is treated as already answered unless a test
 * opts in with globalThis.__askWellbeing = true (see tests/ux-batch/*.test.tsx).
 */
vi.mock('../../src/shared/lib/ui-prefs', async importOriginal => {
  const real = await importOriginal<typeof import('../../src/shared/lib/ui-prefs')>();
  return { ...real, wellbeingAsked: (id: string) => (globalThis as { __askWellbeing?: boolean }).__askWellbeing ? real.wellbeingAsked(id) : true };
});
