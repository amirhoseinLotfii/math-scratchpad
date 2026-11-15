import { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { Provider } from '../../src/app/store-provider';
import { actions, makeStore } from '../../src/store';
import { Keyboard } from '../../src/features/math-editor/components/keyboard';
import { createLessonMathStore, LessonMathCheck } from '../../src/features/lessons/lesson-math-check';

afterEach(cleanup);

it('profiles App, Keyboard and LessonMathCheck through 50 changes and a timer update', () => {
  const question = { id: 'synthetic', source: '2 + 2', mode: 'math' as const };
  const main = makeStore();
  const lesson = createLessonMathStore(question, true);
  const counts = { App: 0, Keyboard: 0, LessonMathCheck: 0 };
  const onRender = (id: string) => {
    counts[id as keyof typeof counts]++;
  };
  render(
    <Provider store={main}>
      <Profiler id="App" onRender={onRender}>
        <App />
      </Profiler>
      <Profiler id="Keyboard" onRender={onRender}>
        <Keyboard />
      </Profiler>
      <Profiler id="LessonMathCheck" onRender={onRender}>
        <LessonMathCheck question={question} store={lesson} onAnswered={() => {}} />
      </Profiler>
    </Provider>,
  );
  const startup = { ...counts };
  for (let i = 1; i <= 50; i++) {
    act(() => {
      for (const store of [main, lesson]) {
        store.dispatch(actions.mathLiveInput({ stepId: store.getState().doc.cursor.stepId, value: '1'.repeat(i) }));
      }
    });
  }
  const afterTyping = { ...counts };
  act(() => {
    for (const store of [main, lesson]) {
      store.dispatch(actions.addQuestionTime({ exerciseId: store.getState().doc.exerciseId, milliseconds: 1000 }));
    }
  });
  const afterTimer = { ...counts };
  act(() => {
    for (const store of [main, lesson]) store.dispatch(actions.notice('Unrelated status message'));
  });
  const afterNotice = { ...counts };
  act(() => {
    main.dispatch(actions.topic('Matrices'));
    lesson.dispatch(actions.topic('Matrices'));
  });
  const unrelatedTopic = Object.fromEntries(
    Object.entries(counts).map(([name, value]) => [name, value - afterNotice[name as keyof typeof counts]]),
  );
  const typing = Object.fromEntries(
    Object.entries(afterTyping).map(([name, value]) => [name, value - startup[name as keyof typeof counts]]),
  );
  const timer = Object.fromEntries(
    Object.entries(afterTimer).map(([name, value]) => [name, value - afterTyping[name as keyof typeof counts]]),
  );
  const notice = Object.fromEntries(
    Object.entries(afterNotice).map(([name, value]) => [name, value - afterTimer[name as keyof typeof counts]]),
  );
  expect(typing.App).toBeGreaterThan(0);
  expect(typing.LessonMathCheck).toBeGreaterThan(0);
  expect(typing.App).toBeLessThanOrEqual(60);
  expect(typing.LessonMathCheck).toBeLessThanOrEqual(62);
  expect(typing.Keyboard).toBe(0);
  expect(timer).toEqual({ App: 1, Keyboard: 0, LessonMathCheck: 0 });
  expect(notice).toEqual({ App: 1, Keyboard: 0, LessonMathCheck: 0 });
  expect(unrelatedTopic).toEqual({ App: 0, Keyboard: 0, LessonMathCheck: 0 });
  console.info(JSON.stringify({ typing, timer, notice, unrelatedTopic }));
});
