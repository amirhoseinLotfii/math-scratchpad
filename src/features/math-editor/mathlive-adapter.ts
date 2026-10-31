import type { MathfieldElement, Selector } from 'mathlive';

const fields = new Map<string, MathfieldElement>();

export function registerMathfield(stepId: string, field: MathfieldElement | null) {
  if (field) fields.set(stepId, field);
  else fields.delete(stepId);
}

export function mathfieldForStep(stepId: string) {
  return fields.get(stepId);
}

const operators: Record<string, string> = {
  '+': '+', '=': '=', '-': '-', '×': '\\times ', '÷': '\\div ', '−': '-', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ',
};

const structures: Record<string, string> = {
  fraction: String.raw`\frac{\placeholder{}}{\placeholder{}}`,
  power: String.raw`{\placeholder{}}^{\placeholder{}}`,
  root: String.raw`\sqrt{\placeholder{}}`,
  group: String.raw`\left(\placeholder{}\right)`,
  abs: String.raw`\left|\placeholder{}\right|`,
  percent: String.raw`\placeholder{}\%`,
  factorial: String.raw`\placeholder{}!`,
  f: String.raw`f\left(\placeholder{}\right)`,
  sin: String.raw`\sin\left(\placeholder{}\right)`,
  cos: String.raw`\cos\left(\placeholder{}\right)`,
  tan: String.raw`\tan\left(\placeholder{}\right)`,
  ln: String.raw`\ln\left(\placeholder{}\right)`,
  log: String.raw`\log\left(\placeholder{}\right)`,
  exp: String.raw`\exp\left(\placeholder{}\right)`,
  integral: String.raw`\int_{\placeholder{}}^{\placeholder{}}\placeholder{}\,\mathrm{d}\,\placeholder{}`,
  sum: String.raw`\sum_{\placeholder{}}^{\placeholder{}}\placeholder{}`,
  limit: String.raw`\lim_{\placeholder{}\to\placeholder{}}\placeholder{}`,
  derivative: String.raw`\frac{\mathrm{d}}{\mathrm{d}\,\placeholder{}}\placeholder{}`,
  choose: String.raw`\binom{\placeholder{}}{\placeholder{}}`,
  probability: String.raw`P\left(\placeholder{}\right)`,
  mean: String.raw`\overline{\placeholder{}}`,
  det: String.raw`\det\left(\placeholder{}\right)`,
  matrix2: String.raw`\begin{bmatrix}\placeholder{}&\placeholder{}\\\placeholder{}&\placeholder{}\end{bmatrix}`,
  matrix3: String.raw`\begin{bmatrix}\placeholder{}&\placeholder{}&\placeholder{}\\\placeholder{}&\placeholder{}&\placeholder{}\\\placeholder{}&\placeholder{}&\placeholder{}\end{bmatrix}`,
  sigma: String.raw`\sigma `,
  infinity: String.raw`\infty `,
  theta: String.raw`\theta `,
  pi: String.raw`\pi `,
  number: String.raw`\placeholder{}`,
};

export function mathLatexForSymbol(key: string): string | undefined {
  if (Object.hasOwn(operators, key)) return operators[key];
  if (/^[0-9.]$/.test(key) || /^[a-zA-Z]$/.test(key)) return key;
  return structures[key];
}

export function insertMathSymbol(stepId: string, key: string) {
  const field = fields.get(stepId), latex = mathLatexForSymbol(key);
  if (!field || latex === undefined) return false;
  const hasPlaceholder = latex.includes('\\placeholder');
  const isEmptyField = /^\s*\\placeholder(?:\[[^\]]*\])?\{\}\s*$/.test(field.value);
  // The input adapter routes the first key from an empty Step through this path.
  // Explicitly select the empty placeholder so both literal keys and structures
  // replace it consistently across browsers and MathLive builds.
  if (isEmptyField) field.executeCommand('selectAll');
  field.insert(latex, {
    mode: 'math',
    format: 'latex',
    insertionMode: 'replaceSelection',
    selectionMode: hasPlaceholder ? 'placeholder' : 'after',
    focus: true,
    scrollIntoView: true,
  });
  return true;
}

export function executeMathfield(stepId: string, command: Selector) {
  const field = fields.get(stepId);
  if (!field) return false;
  field.focus();
  field.executeCommand(command);
  return true;
}

export function undoMathfield(stepId: string) {
  const field = fields.get(stepId);
  if (!field?.canUndo()) return false;
  field.focus();
  field.executeCommand('undo');
  return true;
}

export function redoMathfield(stepId: string) {
  const field = fields.get(stepId);
  if (!field?.canRedo()) return false;
  field.focus();
  field.executeCommand('redo');
  return true;
}

export function duplicateMathfieldGroup(stepId: string) {
  const field = fields.get(stepId);
  if (!field) return false;
  field.focus();
  field.executeCommand('selectGroup');
  const content = field.getValue(field.selection, 'latex');
  if (!content) return true;
  field.insert(content, { mode: 'math', format: 'latex', insertionMode: 'insertAfter', selectionMode: 'after', focus: true });
  return true;
}

export function moveMathfield(stepId: string, direction: -1 | 1) {
  const field = fields.get(stepId);
  if (!field) return false;
  field.focus();
  field.executeCommand(direction < 0 ? 'moveToPreviousChar' : 'moveToNextChar');
  return true;
}
