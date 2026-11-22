export type {
  BlockType,
  Concept,
  DefinitionBlock,
  Difficulty,
  ExampleBlock,
  ImageBlock,
  ImageDescriptionBlock,
  Lang,
  Lesson,
  LessonBlock,
  LessonSectionDefinition,
  LessonStatus,
  MathBlock,
  QuestionLessonFields,
  Stage,
  TextBlock,
  UnsupportedBlock,
} from '../../domain/entities/lesson.types';

export {
  lessonCheckAnswerComplete,
  type LessonCheckAnswer,
  type LessonProgress,
  type LessonWorkAnswer,
} from '../../domain/entities/lesson-progress.types';
