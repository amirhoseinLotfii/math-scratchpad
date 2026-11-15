import { readFileSync } from 'node:fs';
import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { Provider } from '../../src/app/store-provider';
import { initialState, makeStore } from '../../src/store';
import { validateBank, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import type { LessonProgress } from '../../src/features/lessons/types';

afterEach(cleanup);

export function sampleBank(): DriveBank {
  return validateBank(JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as unknown);
}

export function mount(bank = sampleBank(), lessonId = 'SAMPLE-1.1', initialProgress?: LessonProgress) {
  const lesson = bank.lessons!.find((item) => item.id === lessonId)!;
  const onProgress = vi.fn<(progress: LessonProgress) => void>();
  const onStartPractice = vi.fn();
  const onBack = vi.fn();
  const store = makeStore(initialState());
  render(
    <Provider store={store}>
      <LessonScreen
        bank={bank}
        lesson={lesson}
        initialProgress={initialProgress}
        onBack={onBack}
        onProgress={onProgress}
        onStartPractice={onStartPractice}
      />
    </Provider>,
  );
  return { bank, lesson, onProgress, onStartPractice, onBack, store };
}
