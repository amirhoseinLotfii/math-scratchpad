import type { AnswerType } from './drive-bank.types';

export type { AnswerType };
export type Leaf = { id: string; type: 'number' | 'operator' | 'identifier'; value: string };
export type Sequence = { id: string; type: 'sequence'; children: MathNode[] };
export type Structure =
  | { id: string; type: 'fraction'; numerator: Sequence; denominator: Sequence }
  | { id: string; type: 'power'; base: Sequence; exponent: Sequence }
  | { id: string; type: 'root'; body: Sequence }
  | { id: string; type: 'group'; body: Sequence; delim?: 'bracket' }
  | { id: string; type: 'matrix'; size: number; cells: Sequence[] }
  | { id: string; type: 'template'; kind: string; args: Sequence[] };
export type MathNode = Leaf | Structure;

export type StepSegmentType = 'persian_text' | 'ltr_text' | 'math';

export type StepSegment = {
  segmentId: string;
  type: StepSegmentType;
  content: string;
  mathJson?: unknown;
};

export type BranchSign = 'main' | 'plus' | 'minus' | 'case';

/** Optional lossless LaTeX snapshot and segmented content for bilingual math editing. */
export type Step = {
  id: string;
  expression: Sequence;
  final: boolean;
  status: 'unchecked' | 'needs-review';
  edited?: boolean;
  mathLatex?: string;
  orderKey?: string;
  branchId?: string;
  parentStepId?: string | null;
  branchSign?: BranchSign;
  isPrefilledFromQuestion?: boolean;
  segments?: StepSegment[];
  combinedLatex?: string;
};

export type TrueFalseChoice = 'true' | 'false';
export type Exercise = {
  id: string;
  source: string;
  mode: 'math' | 'text';
  prompt?: string;
  answerType?: AnswerType;
  choices?: string[];
  answerText?: string;
  answerChoice?: TrueFalseChoice;
  answerReason?: string;
  diagnosticId?: number;
  bankQuestionId?: string;
  /** Optional bank lesson metadata. Older session JSON remains valid without it. */
  stage?: 'learn' | 'practice';
  conceptId?: string;
  assessment?: 'fractions-round-1';
  elapsedMs?: number;
  confidence?: 'high' | 'medium' | 'low';
  skipped?: boolean;
  migrationNotes?: string;
  startedAt?: string;
  submittedAt?: string;
  hintUsed?: boolean;
  hintNote?: string;
  guidance?: string;
  guidanceOpenedAt?: string;
  /** Epoch ms when the current open timing segment began (wall clock; survives reloads and hidden tabs). */
  timerRunningSince?: number;
  timerPaused?: boolean;
  steps: Step[];
};
export type SessionMeta = { id: string; anxiety?: number; energy?: number; startedAt: string; endedAt?: string; bankId?: string; bankVersion?: string; chapter?: number };
export type Cursor = { stepId: string; nodeId: string | null; sequenceId: string | null; index: number; offset: number; selected: string | null };
export type Document = { exercises: Exercise[]; exerciseId: string; cursor: Cursor; session?: SessionMeta };
export type Preferences = { compact: boolean; favorites: string[]; recent: string[] };
export type NodeInfo = { node: MathNode; parent: Sequence; index: number; ancestors: NodeInfo[]; path: string };
export type SymbolItem = { key: string; label: string; title: string };
