export type Lang = 'fa' | 'en';
export type BlockType = 'heading' | 'paragraph' | 'definition' | 'example' | 'note' | 'math' | 'image' | 'image-description';

interface BlockBase { type: BlockType; lang?: Lang; page?: number }
export interface TextBlock extends BlockBase { type: 'heading' | 'paragraph' | 'note'; text: string; latex?: string }
export interface DefinitionBlock extends BlockBase { type: 'definition'; text: string; latex?: string }
export interface ExampleBlock extends BlockBase { type: 'example'; title?: string; text?: string; latex?: string; steps: string[] }
export interface MathBlock extends BlockBase { type: 'math'; latex: string; text?: string }
export interface ImageBlock extends BlockBase { type: 'image'; src: string; alt: string; caption?: string }
export interface ImageDescriptionBlock extends BlockBase { type: 'image-description'; text: string }
export interface UnsupportedBlock { type: 'unsupported'; originalType: string; source?: string }
export type LessonBlock = TextBlock | DefinitionBlock | ExampleBlock | MathBlock | ImageBlock | ImageDescriptionBlock | UnsupportedBlock;

export interface Concept { id: string; title: string; pages?: string; blocks: LessonBlock[]; checkQuestionIds: string[] }
/** A short, source-page-sized unit in a complete lesson/chapter bank. */
export interface LessonSectionDefinition {
  id: string;
  title: string;
  pages: string;
  conceptIds: string[];
  learnQuestionIds: string[];
  practiceQuestionIds: string[];
}
export interface Lesson { id: string; book: string; section: string; title: string; pages?: string; concepts: Concept[]; sections?: LessonSectionDefinition[] }

export type Stage = 'learn' | 'practice';
export type Difficulty = 1 | 2 | 3;
export interface QuestionLessonFields {
  lessonId?: string;
  conceptId?: string;
  stage?: Stage;
  difficulty?: Difficulty;
  origin?: 'textbook' | 'generated';
  sectionId?: string;
}

export type LessonStatus = 'not_started' | 'learning' | 'practising' | 'done';
