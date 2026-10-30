import { createRoot } from 'react-dom/client';
import { Provider } from '../../src/app/store-provider';
import { initialState, makeStore } from '../../src/store';
import { LessonScreen } from '../../src/features/lessons/lesson-screen';
import { LessonPicker } from '../../src/features/lessons/lesson-picker';
import type { LessonProgress } from '../../src/features/lessons/types';
import type { DriveBank } from '../../src/features/drive-bank/drive-bank';
import sample from '../../examples/MATH_QUESTION_BANK.sample.json';
import '../../src/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';
import '../../src/styles.css';

const bank = structuredClone(sample) as DriveBank;
const view = new URLSearchParams(location.search).get('view') ?? 'concept';
bank.lessons![0].concepts[0].blocks.push({
  type: 'example',
  title: 'Sample worked example',
  text: 'Try this sample expression.',
  latex: 'x+1',
  steps: ['First sample teaching step.', 'Second sample teaching step.'],
});
const lesson = bank.lessons![0];
if (view === 'text') {
  const check = bank.questions.find(question => question.id === 'SAMPLE-1.1-L01');
  if (check) { check.mode = 'text'; check.answerType = 'text'; }
}
if (view === 'checks') {
  const concept = lesson.concepts[0];
  const mathCheck = bank.questions.find(question => question.id === 'SAMPLE-1.1-L02');
  if (mathCheck) { mathCheck.conceptId = concept.id; concept.checkQuestionIds.push(mathCheck.id); }
}
if (view === 'image-error') lesson.concepts[0].blocks.push({ type: 'image', src: '/missing-learn-illustration.png', alt: 'Sample diagram alternative text' });
const currentConceptIndex = view === 'math' ? 1 : 0;
const progress: LessonProgress = {
  lessonId: lesson.id,
  status: view === 'summary' ? 'done' : 'learning',
  currentConceptIndex,
  completedConceptIds: [],
  answeredCheckIds: [],
  skippedChecks: [],
  revealedSteps: view === 'concept' ? { [`${lesson.concepts[0].id}:3`]: 1 } : {},
  learnStartedAt: new Date().toISOString(),
};

const root = createRoot(document.getElementById('math-scratchpad-redux')!);
if (view === 'empty-picker') {
  root.render(<LessonPicker open lessons={[]} progressByLesson={{}} onOpenChange={() => undefined} onChoose={() => undefined} />);
} else if (view === 'loading' || view === 'unavailable') {
  root.render(<LessonScreen bank={view === 'loading' ? bank : null} lesson={null} loading={view === 'loading'} onBack={() => undefined} onProgress={() => undefined} onStartPractice={() => undefined} />);
} else {
  root.render(
    <Provider store={makeStore(initialState())}>
      <LessonScreen bank={bank} lesson={lesson} initialProgress={progress} onBack={() => undefined} onStartPractice={() => undefined} />
    </Provider>,
  );
}
