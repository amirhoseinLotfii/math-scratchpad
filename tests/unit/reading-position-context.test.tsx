import { useEffect, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingPositionProvider, useOptionalReadingPositionContext } from '../../src/features/progress/reading-position-context';
import { useReadingPositionStore } from '../../src/features/progress/reading-position-store';
import { READING_POSITION_STORAGE_KEY } from '../../src/features/progress/reading-position-storage';

afterEach(() => {
  localStorage.removeItem(READING_POSITION_STORAGE_KEY);
  useReadingPositionStore.setState({ position: null });
  vi.restoreAllMocks();
});

describe('ReadingPositionProvider tracking callbacks', () => {
  it('does not retrigger a lesson location effect after its own position write', async () => {
    localStorage.removeItem(READING_POSITION_STORAGE_KEY);
    useReadingPositionStore.setState({ position: null });

    let effectRuns = 0;
    const trackCallbacks = new Set<unknown>();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ReadingPositionProvider>{children}</ReadingPositionProvider>
    );

    const { result, unmount } = renderHook(() => {
      const context = useOptionalReadingPositionContext();
      const trackPosition = context?.trackPosition;
      if (trackPosition) trackCallbacks.add(trackPosition);

      useEffect(() => {
        if (!trackPosition) return;
        effectRuns += 1;
        void trackPosition({
          chapterId: '2',
          lessonId: '1.1',
          sectionId: '1.1-a',
          contentVersion: 'bank-v1',
          lastActivity: 'reading',
        });
      }, [trackPosition]);

      return context;
    }, { wrapper });

    await waitFor(() => expect(result.current?.position?.lessonId).toBe('1.1'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(effectRuns).toBe(1);
    expect(trackCallbacks.size).toBe(1);
    expect(storageWrite.mock.calls.filter(([key]) => key === READING_POSITION_STORAGE_KEY)).toHaveLength(1);
    unmount();
  });
});